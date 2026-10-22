import "server-only";

import { headers } from "next/headers";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { assertAdmin } from "@/lib/accessGuards";

export type AppUserLoginEvent = {
  id: string;
  occurredAt: string;
  success: boolean;
  provider: string;
  ip: string | null;
  userAgent: string | null;
};

export type RecordLoginEventInput = {
  appUserId: string;
  success: boolean;
  provider?: string;
  ip?: string | null;
  userAgent?: string | null;
};

/** Best-effort client metadata from the current request. */
export async function readLoginRequestMeta(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const ip =
      forwarded?.split(",")[0]?.trim() ||
      h.get("x-real-ip")?.trim() ||
      null;
    const userAgent = h.get("user-agent")?.trim() || null;
    return { ip, userAgent };
  } catch {
    return { ip: null, userAgent: null };
  }
}

/**
 * Persist a login attempt. Never throws to callers — auth must not fail
 * because history logging failed.
 */
export async function recordAppUserLoginEvent(
  input: RecordLoginEventInput
): Promise<void> {
  const provider = input.provider?.trim() || "customer-password";
  try {
    await cloudSqlPool.query(
      `INSERT INTO app_user_login_events
         (app_user_id, success, provider, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.appUserId,
        input.success,
        provider,
        input.ip || null,
        input.userAgent || null,
      ]
    );
    if (input.success) {
      await cloudSqlPool.query(
        `UPDATE app_users
         SET last_login_at = now()
         WHERE id = $1`,
        [input.appUserId]
      );
    }
  } catch (cause) {
    console.error("[auth] failed to record login event", {
      appUserId: input.appUserId,
      success: input.success,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

export async function listAppUserLoginEventsForAdmin(
  appUserId: string,
  limit = 50
): Promise<AppUserLoginEvent[]> {
  await assertAdmin();
  const capped = Math.min(Math.max(1, limit), 100);
  const { rows } = await cloudSqlPool.query<{
    id: string;
    occurred_at: Date;
    success: boolean;
    provider: string;
    ip: string | null;
    user_agent: string | null;
  }>(
    `SELECT id, occurred_at, success, provider, ip, user_agent
     FROM app_user_login_events
     WHERE app_user_id = $1
     ORDER BY occurred_at DESC
     LIMIT $2`,
    [appUserId, capped]
  );
  return rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at.toISOString(),
    success: row.success,
    provider: row.provider,
    ip: row.ip,
    userAgent: row.user_agent,
  }));
}

export async function getAppUserLastLoginAtForAdmin(
  appUserId: string
): Promise<string | null> {
  await assertAdmin();
  const { rows } = await cloudSqlPool.query<{ last_login_at: Date | null }>(
    `SELECT last_login_at FROM app_users WHERE id = $1`,
    [appUserId]
  );
  const value = rows[0]?.last_login_at;
  return value ? value.toISOString() : null;
}
