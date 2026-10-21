"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/accessGuards";
import { cloudSqlPool, withCloudSqlTransaction } from "@/lib/cloudSqlPool";
import { ROUTES } from "@/lib/routes";
import { getCurrentAppUser } from "@/lib/appUsers";
import type { PoolClient } from "pg";

export type Monitor = {
  id: string;
  customer_id: string;
  customer_name_snapshot: string;
  name: string;
  url: string;
  enabled: boolean;
  interval_seconds: number;
  retry_delay_seconds: number | null;
  timeout_ms: number;
  expected_status_min: number;
  expected_status_max: number;
  auth_secret_ref: string | null;
  next_due_at: string;
  status: "unknown" | "up" | "down";
  last_checked_at: string | null;
  active_incident: boolean;
};

export type MonitorInput = {
  customerId: string;
  name: string;
  url: string;
  enabled: boolean;
  intervalSeconds: number;
  retryDelaySeconds: number | null;
  timeoutMs: number;
  expectedStatusMin: number;
  expectedStatusMax: number;
  authSecretRef: string | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validate(input: MonitorInput): MonitorInput {
  if (!uuidPattern.test(input.customerId)) throw new Error("Select a customer");
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");
  if (name.length > 200) throw new Error("Name is too long");
  const url = input.url.trim();
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Enter a valid URL"); }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error("Enter an HTTP or HTTPS URL without embedded credentials");
  }
  if (!Number.isInteger(input.intervalSeconds) || input.intervalSeconds < 30 || input.intervalSeconds > 86400) {
    throw new Error("Interval must be 30–86400 seconds");
  }
  if (input.retryDelaySeconds !== null && (!Number.isInteger(input.retryDelaySeconds) || input.retryDelaySeconds < 1)) {
    throw new Error("Retry delay must be a positive number of seconds");
  }
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1) throw new Error("Timeout must be positive");
  if (!Number.isInteger(input.expectedStatusMin) || !Number.isInteger(input.expectedStatusMax) ||
      input.expectedStatusMin < 100 || input.expectedStatusMax > 599 || input.expectedStatusMax < input.expectedStatusMin) {
    throw new Error("Expected HTTP status range must be within 100–599");
  }
  if (typeof input.enabled !== "boolean") throw new Error("Invalid enabled value");
  const authSecretRef = input.authSecretRef?.trim() || null;
  if (authSecretRef && authSecretRef.length > 500) throw new Error("Secret reference is too long");
  return { ...input, name, url, authSecretRef };
}

export async function getMonitors(): Promise<Monitor[]> {
  await assertAdmin();
  const { rows } = await cloudSqlPool.query<Monitor>(
    `SELECT m.id, m.customer_id, m.customer_name_snapshot, m.name, m.url,
            m.enabled, m.interval_seconds, m.retry_delay_seconds, m.timeout_ms,
            m.expected_status_min, m.expected_status_max, m.auth_secret_ref,
            m.next_due_at, COALESCE(s.status, 'unknown') AS status,
            s.last_checked_at, (s.active_incident_id IS NOT NULL) AS active_incident
       FROM monitoring.monitors m
       LEFT JOIN monitoring.monitor_state s ON s.monitor_id = m.id
      ORDER BY lower(m.customer_name_snapshot), lower(m.name)`
  );
  return rows.map((row) => ({
    ...row,
    next_due_at: new Date(row.next_due_at).toISOString(),
    last_checked_at: row.last_checked_at ? new Date(row.last_checked_at).toISOString() : null,
  }));
}

export async function getMonitorCustomers(): Promise<{ id: string; name: string }[]> {
  await assertAdmin();
  const { rows } = await cloudSqlPool.query<{ id: string; name: string }>(
    `SELECT id, name FROM customers ORDER BY lower(name)`
  );
  return rows;
}

async function customerName(client: PoolClient, id: string): Promise<string> {
  const { rows } = await client.query<{ name: string }>(`SELECT name FROM customers WHERE id = $1`, [id]);
  if (!rows[0]) throw new Error("Customer no longer exists");
  return rows[0].name;
}

async function audit(client: PoolClient, actorId: string | undefined, action: string, id: string) {
  await client.query(
    `INSERT INTO monitoring.audit_events (actor_user_id, action, entity_type, entity_id)
     VALUES ($1, $2, 'monitor', $3)`,
    [actorId ?? null, action, id]
  );
}

export async function createMonitor(raw: MonitorInput): Promise<void> {
  await assertAdmin();
  const actor = await getCurrentAppUser();
  const input = validate(raw);
  await withCloudSqlTransaction("monitor-create", async (client) => {
    const customer = await customerName(client, input.customerId);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO monitoring.monitors
        (customer_id, customer_name_snapshot, name, url, enabled, interval_seconds,
         retry_delay_seconds, timeout_ms, expected_status_min, expected_status_max, auth_secret_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [input.customerId, customer, input.name, input.url, input.enabled, input.intervalSeconds,
       input.retryDelaySeconds, input.timeoutMs, input.expectedStatusMin, input.expectedStatusMax, input.authSecretRef]
    );
    await audit(client, actor?.id, "create", rows[0].id);
  });
  revalidatePath(ROUTES.monitors);
}

export async function updateMonitor(id: string, raw: MonitorInput): Promise<void> {
  await assertAdmin();
  const actor = await getCurrentAppUser();
  if (!uuidPattern.test(id)) throw new Error("Invalid monitor ID");
  const input = validate(raw);
  await withCloudSqlTransaction("monitor-update", async (client) => {
    const customer = await customerName(client, input.customerId);
    const { rowCount } = await client.query(
      `UPDATE monitoring.monitors SET customer_id=$2, customer_name_snapshot=$3,
         name=$4, url=$5, enabled=$6, interval_seconds=$7, retry_delay_seconds=$8,
         timeout_ms=$9, expected_status_min=$10, expected_status_max=$11,
         auth_secret_ref=$12, updated_at=now(),
         next_due_at=CASE WHEN NOT enabled AND $6 THEN now() ELSE next_due_at END
       WHERE id=$1`,
      [id, input.customerId, customer, input.name, input.url, input.enabled,
       input.intervalSeconds, input.retryDelaySeconds, input.timeoutMs,
       input.expectedStatusMin, input.expectedStatusMax, input.authSecretRef]
    );
    if (!rowCount) throw new Error("Monitor no longer exists");
    await audit(client, actor?.id, "update", id);
  });
  revalidatePath(ROUTES.monitors);
}

export async function setMonitorEnabled(id: string, enabled: boolean): Promise<void> {
  await assertAdmin();
  const actor = await getCurrentAppUser();
  if (!uuidPattern.test(id) || typeof enabled !== "boolean") throw new Error("Invalid monitor update");
  await withCloudSqlTransaction("monitor-toggle", async (client) => {
    const { rowCount } = await client.query(
      `UPDATE monitoring.monitors SET enabled=$2, updated_at=now(),
         next_due_at=CASE WHEN NOT enabled AND $2 THEN now() ELSE next_due_at END
       WHERE id=$1`, [id, enabled]
    );
    if (!rowCount) throw new Error("Monitor no longer exists");
    await audit(client, actor?.id, enabled ? "enable" : "disable", id);
  });
  revalidatePath(ROUTES.monitors);
}

export async function deleteMonitor(id: string): Promise<void> {
  await assertAdmin();
  const actor = await getCurrentAppUser();
  if (!uuidPattern.test(id)) throw new Error("Invalid monitor ID");
  try {
    await withCloudSqlTransaction("monitor-delete", async (client) => {
      const { rowCount } = await client.query(`DELETE FROM monitoring.monitors WHERE id=$1`, [id]);
      if (!rowCount) throw new Error("Monitor no longer exists");
      await audit(client, actor?.id, "delete", id);
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23503") {
      throw new Error("This monitor has history or linked records and cannot be deleted. Disable it instead.");
    }
    throw error;
  }
  revalidatePath(ROUTES.monitors);
}
