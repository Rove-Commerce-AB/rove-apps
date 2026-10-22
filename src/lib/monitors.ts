"use server";

import { revalidatePath } from "next/cache";
import { cloudSqlPool, withCloudSqlTransaction } from "@/lib/cloudSqlPool";
import {
  ROUTES,
  supportCustomerMonitorsHref,
} from "@/lib/routes";
import type { PoolClient } from "pg";
import { compareTextSv } from "@/lib/sort";
import {
  canManageMonitors,
  canSeeSupportOverview,
  canViewMonitors,
  type SupportActor,
} from "@/lib/supportAccess";
import {
  getSupportActor,
  linkedSupportCustomerIdsForActor,
} from "@/lib/supportActor";

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
  slack_notification_ids: string[];
};

export type SlackNotificationOption = {
  id: string;
  name: string;
  channel_name: string;
  default_enabled: boolean;
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
  slackNotificationIds: string[];
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MONITOR_SELECT = `SELECT m.id, m.customer_id, m.customer_name_snapshot, m.name, m.url,
            m.enabled, m.interval_seconds, m.retry_delay_seconds, m.timeout_ms,
            m.expected_status_min, m.expected_status_max, m.auth_secret_ref,
            m.next_due_at, COALESCE(s.status, 'unknown') AS status,
            s.last_checked_at, (s.active_incident_id IS NOT NULL) AS active_incident,
            COALESCE((SELECT array_agg(n.notification_id)
                        FROM monitoring.monitor_slack_notifications n
                       WHERE n.monitor_id = m.id AND n.enabled), '{}') AS slack_notification_ids
       FROM monitoring.monitors m
       LEFT JOIN monitoring.monitor_state s ON s.monitor_id = m.id`;

function validate(input: MonitorInput): MonitorInput {
  if (!uuidPattern.test(input.customerId)) throw new Error("Select a customer");
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");
  if (name.length > 200) throw new Error("Name is too long");
  const url = input.url.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Enter a valid URL");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      "Enter an HTTP or HTTPS URL without embedded credentials"
    );
  }
  if (
    !Number.isInteger(input.intervalSeconds) ||
    input.intervalSeconds < 30 ||
    input.intervalSeconds > 86400
  ) {
    throw new Error("Interval must be 30–86400 seconds");
  }
  if (
    input.retryDelaySeconds !== null &&
    (!Number.isInteger(input.retryDelaySeconds) || input.retryDelaySeconds < 1)
  ) {
    throw new Error("Retry delay must be a positive number of seconds");
  }
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1) {
    throw new Error("Timeout must be positive");
  }
  if (
    !Number.isInteger(input.expectedStatusMin) ||
    !Number.isInteger(input.expectedStatusMax) ||
    input.expectedStatusMin < 100 ||
    input.expectedStatusMax > 599 ||
    input.expectedStatusMax < input.expectedStatusMin
  ) {
    throw new Error("Expected HTTP status range must be within 100–599");
  }
  if (typeof input.enabled !== "boolean") throw new Error("Invalid enabled value");
  if (
    !Array.isArray(input.slackNotificationIds) ||
    input.slackNotificationIds.some(
      (id) => typeof id !== "string" || !uuidPattern.test(id)
    )
  ) {
    throw new Error("Invalid Slack channel selection");
  }
  const authSecretRef = input.authSecretRef?.trim() || null;
  if (authSecretRef && authSecretRef.length > 500) {
    throw new Error("Secret reference is too long");
  }
  return {
    ...input,
    name,
    url,
    authSecretRef,
    slackNotificationIds: [...new Set(input.slackNotificationIds)],
  };
}

function mapMonitorRows(rows: Monitor[]): Monitor[] {
  return rows
    .map((row) => ({
      ...row,
      next_due_at: new Date(row.next_due_at).toISOString(),
      last_checked_at: row.last_checked_at
        ? new Date(row.last_checked_at).toISOString()
        : null,
      slack_notification_ids: row.slack_notification_ids ?? [],
    }))
    .sort(
      (a, b) =>
        compareTextSv(a.name, b.name) ||
        compareTextSv(a.customer_name_snapshot, b.customer_name_snapshot) ||
        a.id.localeCompare(b.id)
    );
}

async function requireSupportActorOrThrow(): Promise<{
  actor: SupportActor;
  linked: string[];
}> {
  const actor = await getSupportActor();
  if (!actor) throw new Error("Unauthorized");
  const linked = await linkedSupportCustomerIdsForActor(actor);
  return { actor, linked };
}

async function assertCanManageCustomer(customerId: string) {
  const { actor, linked } = await requireSupportActorOrThrow();
  if (!canManageMonitors(actor, linked, customerId)) {
    throw new Error("Unauthorized");
  }
  return actor;
}

async function customerName(client: PoolClient, id: string): Promise<string> {
  const { rows } = await client.query<{ name: string }>(
    `SELECT name FROM customers WHERE id = $1`,
    [id]
  );
  if (!rows[0]) throw new Error("Customer no longer exists");
  return rows[0].name;
}

async function audit(
  client: PoolClient,
  actorId: string | undefined,
  action: string,
  id: string
) {
  await client.query(
    `INSERT INTO monitoring.audit_events (actor_user_id, action, entity_type, entity_id)
     VALUES ($1, $2, 'monitor', $3)`,
    [actorId ?? null, action, id]
  );
}

async function saveSlackNotifications(
  client: PoolClient,
  monitorId: string,
  ids: string[]
) {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM monitoring.slack_notifications WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  if (rows.length !== ids.length) {
    throw new Error("A selected Slack channel no longer exists");
  }
  await client.query(
    `DELETE FROM monitoring.monitor_slack_notifications
      WHERE monitor_id=$1 AND NOT (notification_id = ANY($2::uuid[]))`,
    [monitorId, ids]
  );
  if (ids.length) {
    await client.query(
      `INSERT INTO monitoring.monitor_slack_notifications AS route (monitor_id, notification_id, enabled)
       SELECT $1, selected.id, true FROM unnest($2::uuid[]) AS selected(id)
       ON CONFLICT (monitor_id, notification_id)
       DO UPDATE SET enabled=true,
                     alert_on_down=CASE
                       WHEN NOT route.alert_on_down AND NOT route.alert_on_recovery
                       THEN true ELSE route.alert_on_down END,
                     updated_at=now()`,
      [monitorId, ids]
    );
  }
}

function revalidateMonitorPaths(customerId: string) {
  revalidatePath(ROUTES.supportOverview);
  revalidatePath(supportCustomerMonitorsHref(customerId));
  revalidatePath(ROUTES.monitors);
}

/** Staff Overview: all monitors. */
export async function getMonitorsOverview(): Promise<Monitor[]> {
  const { actor } = await requireSupportActorOrThrow();
  if (!canSeeSupportOverview(actor)) throw new Error("Unauthorized");
  const { rows } = await cloudSqlPool.query<Monitor>(
    `${MONITOR_SELECT}
      WHERE m.deleted_at IS NULL
      ORDER BY lower(m.customer_name_snapshot), lower(m.name), m.id`
  );
  return mapMonitorRows(rows);
}

export async function getMonitorsForCustomer(
  customerId: string
): Promise<Monitor[]> {
  const { actor, linked } = await requireSupportActorOrThrow();
  if (!canViewMonitors(actor, linked, customerId)) {
    throw new Error("Unauthorized");
  }
  const { rows } = await cloudSqlPool.query<Monitor>(
    `${MONITOR_SELECT}
      WHERE m.customer_id = $1 AND m.deleted_at IS NULL
      ORDER BY lower(m.name), m.id`,
    [customerId]
  );
  return mapMonitorRows(rows);
}

/** @deprecated Prefer getMonitorsOverview / getMonitorsForCustomer */
export async function getMonitors(): Promise<Monitor[]> {
  return getMonitorsOverview();
}

export async function getSlackNotifications(): Promise<
  SlackNotificationOption[]
> {
  const { actor } = await requireSupportActorOrThrow();
  if (!canSeeSupportOverview(actor) && actor.role === "customer") {
    throw new Error("Unauthorized");
  }
  const { rows } = await cloudSqlPool.query<SlackNotificationOption>(
    `SELECT id, name, channel_name, default_enabled
       FROM monitoring.slack_notifications
      ORDER BY lower(channel_name), lower(name), id`
  );
  return rows;
}

export async function getMonitorCustomers(): Promise<
  { id: string; name: string }[]
> {
  const { actor, linked } = await requireSupportActorOrThrow();
  if (!canSeeSupportOverview(actor) && linked.length === 0) {
    throw new Error("Unauthorized");
  }
  if (canSeeSupportOverview(actor)) {
    const { rows } = await cloudSqlPool.query<{ id: string; name: string }>(
      `SELECT id, name FROM customers WHERE is_active ORDER BY lower(name)`
    );
    return rows;
  }
  if (linked.length === 0) return [];
  const { rows } = await cloudSqlPool.query<{ id: string; name: string }>(
    `SELECT id, name FROM customers
     WHERE is_active AND id = ANY($1::uuid[])
     ORDER BY lower(name)`,
    [linked]
  );
  return rows;
}

export async function createMonitor(raw: MonitorInput): Promise<void> {
  const actor = await assertCanManageCustomer(raw.customerId);
  const input = validate(raw);
  await withCloudSqlTransaction("monitor-create", async (client) => {
    const customer = await customerName(client, input.customerId);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO monitoring.monitors
        (customer_id, customer_name_snapshot, name, url, enabled, interval_seconds,
         retry_delay_seconds, timeout_ms, expected_status_min, expected_status_max, auth_secret_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        input.customerId,
        customer,
        input.name,
        input.url,
        input.enabled,
        input.intervalSeconds,
        input.retryDelaySeconds,
        input.timeoutMs,
        input.expectedStatusMin,
        input.expectedStatusMax,
        input.authSecretRef,
      ]
    );
    await saveSlackNotifications(client, rows[0].id, input.slackNotificationIds);
    await audit(client, actor.id, "create", rows[0].id);
  });
  revalidateMonitorPaths(input.customerId);
}

export async function updateMonitor(
  id: string,
  raw: MonitorInput
): Promise<void> {
  if (!uuidPattern.test(id)) throw new Error("Invalid monitor ID");
  const actor = await assertCanManageCustomer(raw.customerId);
  const input = validate(raw);
  await withCloudSqlTransaction("monitor-update", async (client) => {
    const customer = await customerName(client, input.customerId);
    const { rowCount } = await client.query(
      `UPDATE monitoring.monitors SET customer_id=$2, customer_name_snapshot=$3,
         name=$4, url=$5, enabled=$6, interval_seconds=$7, retry_delay_seconds=$8,
         timeout_ms=$9, expected_status_min=$10, expected_status_max=$11,
         auth_secret_ref=$12, updated_at=now(),
         next_due_at=CASE WHEN NOT enabled AND $6 THEN now() ELSE next_due_at END
       WHERE id=$1 AND deleted_at IS NULL`,
      [
        id,
        input.customerId,
        customer,
        input.name,
        input.url,
        input.enabled,
        input.intervalSeconds,
        input.retryDelaySeconds,
        input.timeoutMs,
        input.expectedStatusMin,
        input.expectedStatusMax,
        input.authSecretRef,
      ]
    );
    if (!rowCount) throw new Error("Monitor no longer exists");
    await saveSlackNotifications(client, id, input.slackNotificationIds);
    await audit(client, actor.id, "update", id);
  });
  revalidateMonitorPaths(input.customerId);
}

export async function setMonitorEnabled(
  id: string,
  enabled: boolean
): Promise<void> {
  if (!uuidPattern.test(id) || typeof enabled !== "boolean") {
    throw new Error("Invalid monitor update");
  }
  const { actor, linked } = await requireSupportActorOrThrow();
  const { rows } = await cloudSqlPool.query<{ customer_id: string }>(
    `SELECT customer_id FROM monitoring.monitors WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  const customerId = rows[0]?.customer_id;
  if (!customerId) throw new Error("Monitor no longer exists");
  if (!canManageMonitors(actor, linked, customerId)) {
    throw new Error("Unauthorized");
  }
  await withCloudSqlTransaction("monitor-toggle", async (client) => {
    const { rowCount } = await client.query(
      `UPDATE monitoring.monitors SET enabled=$2, updated_at=now(),
         next_due_at=CASE WHEN NOT enabled AND $2 THEN now() ELSE next_due_at END
       WHERE id=$1 AND deleted_at IS NULL`,
      [id, enabled]
    );
    if (!rowCount) throw new Error("Monitor no longer exists");
    await audit(client, actor.id, enabled ? "enable" : "disable", id);
  });
  revalidateMonitorPaths(customerId);
}

export async function deleteMonitor(id: string): Promise<void> {
  if (!uuidPattern.test(id)) throw new Error("Invalid monitor ID");
  const { actor, linked } = await requireSupportActorOrThrow();
  const { rows } = await cloudSqlPool.query<{ customer_id: string }>(
    `SELECT customer_id FROM monitoring.monitors WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  const customerId = rows[0]?.customer_id;
  if (!customerId) throw new Error("Monitor no longer exists");
  if (!canManageMonitors(actor, linked, customerId)) {
    throw new Error("Unauthorized");
  }
  await withCloudSqlTransaction("monitor-delete", async (client) => {
    const { rowCount } = await client.query(
      `UPDATE monitoring.monitors
          SET enabled=false, deleted_at=now(), updated_at=now()
        WHERE id=$1 AND deleted_at IS NULL`,
      [id]
    );
    if (!rowCount) throw new Error("Monitor no longer exists");
    await audit(client, actor.id, "delete", id);
  });
  revalidateMonitorPaths(customerId);
}
