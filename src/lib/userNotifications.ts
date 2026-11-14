import "server-only";

import { revalidatePath } from "next/cache";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { getCurrentAppUser } from "@/lib/appUsers";
import {
  getCachedUnreadNotificationCount,
  revalidateUserNotificationCache,
} from "@/lib/layoutShell";
import {
  USER_NOTIFICATION_KIND,
  type AllocationInsertForNotify,
  type UserNotificationKind,
  type UserNotificationRow,
} from "@/lib/userNotificationKinds";

function revalidateDashboardShell() {
  revalidatePath("/", "page");
  revalidatePath("/", "layout");
  revalidatePath("/notifications", "page");
  revalidatePath("/notifications", "layout");
}

function isUserNotificationsAccessError(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  if (err?.code === "42501" || err?.code === "42P01") return true;
  const msg = typeof err?.message === "string" ? err.message : "";
  return (
    msg.includes("permission denied for table user_notifications") ||
    msg.includes('relation "user_notifications" does not exist')
  );
}

export {
  USER_NOTIFICATION_KIND,
  type AllocationInsertForNotify,
  type UserNotificationKind,
  type UserNotificationRow,
} from "@/lib/userNotificationKinds";

async function getAppUserIdByEmail(email: string): Promise<string | null> {
  const { rows } = await cloudSqlPool.query<{ id: string }>(
    `SELECT id FROM app_users WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1`,
    [email]
  );
  return rows[0]?.id ?? null;
}

async function getAppUserIdForConsultant(consultantId: string): Promise<string | null> {
  const { rows } = await cloudSqlPool.query<{ id: string }>(
    `SELECT c.app_user_id AS id
     FROM consultants c
     WHERE c.id = $1
       AND c.app_user_id IS NOT NULL
     LIMIT 1`,
    [consultantId]
  );
  return rows[0]?.id ?? null;
}

async function insertNotificationRow(
  appUserId: string,
  kind: UserNotificationKind,
  payload: Record<string, unknown>
): Promise<void> {
  await cloudSqlPool.query(
    `INSERT INTO user_notifications (app_user_id, kind, payload)
     VALUES ($1, $2, $3::jsonb)`,
    [appUserId, kind, JSON.stringify(payload)]
  );
}

export async function insertUserNotification(
  appUserId: string,
  kind: UserNotificationKind,
  payload: Record<string, unknown>
): Promise<void> {
  await insertNotificationRow(appUserId, kind, payload);
  const { rows } = await cloudSqlPool.query<{ email: string }>(
    `SELECT email FROM app_users WHERE id = $1 LIMIT 1`,
    [appUserId]
  );
  if (rows[0]?.email) revalidateUserNotificationCache(rows[0].email);
  revalidateDashboardShell();
}

/**
 * One grouped notification per (consultant, project) for newly inserted allocation rows.
 * Skips when the consultant has no matching app_users row. Ignores move/bulk internal paths not passed here.
 */
export async function notifyAllocationInserts(
  records: AllocationInsertForNotify[]
): Promise<void> {
  try {
    await notifyAllocationInsertsInner(records);
  } catch (e) {
    console.error("[userNotifications] notifyAllocationInserts failed", e);
  }
}

async function notifyAllocationInsertsInner(
  records: AllocationInsertForNotify[]
): Promise<void> {
  const filtered = records.filter(
    (r) => r.consultant_id != null && Number(r.hours) > 0
  );
  if (filtered.length === 0) return;

  type Group = {
    consultant_id: string;
    project_id: string;
    weeks: { year: number; week: number }[];
    allocation_ids: string[];
  };
  const groups = new Map<string, Group>();
  for (const r of filtered) {
    const cid = r.consultant_id!;
    const key = `${cid}\0${r.project_id}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        consultant_id: cid,
        project_id: r.project_id,
        weeks: [],
        allocation_ids: [],
      };
      groups.set(key, g);
    }
    g.weeks.push({ year: r.year, week: r.week });
    g.allocation_ids.push(r.id);
  }

  const projectIds = [...new Set([...groups.values()].map((g) => g.project_id))];
  const { rows: projectRows } = await cloudSqlPool.query<{
    id: string;
    name: string;
    customer_name: string;
  }>(
    `SELECT p.id, p.name, c.name AS customer_name
     FROM projects p
     INNER JOIN customers c ON c.id = p.customer_id
     WHERE p.id = ANY($1::uuid[])`,
    [projectIds]
  );
  const projectMeta = new Map(projectRows.map((p) => [p.id, p]));

  let anyInserted = false;
  for (const g of groups.values()) {
    const appUserId = await getAppUserIdForConsultant(g.consultant_id);
    if (!appUserId) continue;

    g.weeks.sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.week - b.week
    );
    const meta = projectMeta.get(g.project_id);
    const payload: Record<string, unknown> = {
      projectId: g.project_id,
      projectName: meta?.name ?? null,
      customerName: meta?.customer_name ?? null,
      weeks: g.weeks,
      allocationIds: g.allocation_ids,
    };
    try {
      await insertNotificationRow(
        appUserId,
        USER_NOTIFICATION_KIND.ALLOCATION_BOOKED,
        payload
      );
      anyInserted = true;
    } catch (e) {
      console.error("[userNotifications] allocation insert failed", e);
    }
  }
  if (anyInserted) revalidateDashboardShell();
}


export async function getNotificationsForCurrentUser(
  limit = 20
): Promise<UserNotificationRow[]> {
  const sessionUser = await getCurrentAppUser();
  if (!sessionUser?.email) return [];

  try {
    const { rows } = await cloudSqlPool.query<{
      id: string;
      kind: string;
      payload: Record<string, unknown>;
      read_at: string | null;
      created_at: string;
    }>(
      `SELECT un.id, un.kind, un.payload, un.read_at::text, un.created_at::text
       FROM user_notifications un
       INNER JOIN app_users au ON au.id = un.app_user_id
       WHERE lower(trim(au.email)) = lower(trim($1))
       ORDER BY un.created_at DESC
       LIMIT $2`,
      [sessionUser.email, limit]
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      payload: r.payload ?? {},
      read_at: r.read_at,
      created_at: r.created_at,
    }));
  } catch (e) {
    if (isUserNotificationsAccessError(e)) {
      console.warn(
        "[userNotifications] user_notifications not readable (missing GRANT or table?). See sql/20260418_user_notifications.sql footer.",
        e
      );
      return [];
    }
    throw e;
  }
}

/** Unread only — for the top-bar notification dropdown. */
export async function getUnreadNotificationsForCurrentUser(
  limit = 30
): Promise<UserNotificationRow[]> {
  const sessionUser = await getCurrentAppUser();
  if (!sessionUser?.email) return [];

  try {
    const { rows } = await cloudSqlPool.query<{
      id: string;
      kind: string;
      payload: Record<string, unknown>;
      read_at: string | null;
      created_at: string;
    }>(
      `SELECT un.id, un.kind, un.payload, un.read_at::text, un.created_at::text
       FROM user_notifications un
       INNER JOIN app_users au ON au.id = un.app_user_id
       WHERE lower(trim(au.email)) = lower(trim($1))
         AND un.read_at IS NULL
       ORDER BY un.created_at DESC
       LIMIT $2`,
      [sessionUser.email, limit]
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      payload: r.payload ?? {},
      read_at: r.read_at,
      created_at: r.created_at,
    }));
  } catch (e) {
    if (isUserNotificationsAccessError(e)) {
      console.warn(
        "[userNotifications] user_notifications not readable (missing GRANT or table?). See sql/20260418_user_notifications.sql footer.",
        e
      );
      return [];
    }
    throw e;
  }
}

/** Olästa notiser för vänstermeny / indikator (COUNT, lättviktsquery). */
export async function getUnreadNotificationCountForCurrentUser(): Promise<number> {
  const sessionUser = await getCurrentAppUser();
  if (!sessionUser?.email) return 0;
  return getCachedUnreadNotificationCount(sessionUser.email);
}

function revalidateNotificationCountForEmail(email: string) {
  revalidateUserNotificationCache(email);
  revalidateDashboardShell();
}

async function getCurrentAppUserId(): Promise<string | null> {
  const u = await getCurrentAppUser();
  if (!u?.email) return null;
  return getAppUserIdByEmail(u.email);
}

async function getCurrentUserEmail(): Promise<string | null> {
  const u = await getCurrentAppUser();
  return u?.email ?? null;
}

export async function markUserNotificationRead(notificationId: string): Promise<void> {
  const appUserId = await getCurrentAppUserId();
  if (!appUserId) return;
  try {
    await cloudSqlPool.query(
      `UPDATE user_notifications SET read_at = now()
       WHERE id = $1 AND app_user_id = $2 AND read_at IS NULL`,
      [notificationId, appUserId]
    );
    const email = await getCurrentUserEmail();
    if (email) revalidateNotificationCountForEmail(email);
    else revalidateDashboardShell();
  } catch (e) {
    if (isUserNotificationsAccessError(e)) {
      console.warn("[userNotifications] mark read skipped (DB privileges)", e);
      return;
    }
    throw e;
  }
}

export async function markUserNotificationUnread(
  notificationId: string
): Promise<void> {
  const appUserId = await getCurrentAppUserId();
  if (!appUserId) return;
  try {
    await cloudSqlPool.query(
      `UPDATE user_notifications SET read_at = NULL
       WHERE id = $1 AND app_user_id = $2 AND read_at IS NOT NULL`,
      [notificationId, appUserId]
    );
    const email = await getCurrentUserEmail();
    if (email) revalidateNotificationCountForEmail(email);
    else revalidateDashboardShell();
  } catch (e) {
    if (isUserNotificationsAccessError(e)) {
      console.warn("[userNotifications] mark unread skipped (DB privileges)", e);
      return;
    }
    throw e;
  }
}

export async function markAllUserNotificationsRead(): Promise<void> {
  const appUserId = await getCurrentAppUserId();
  if (!appUserId) return;
  try {
    await cloudSqlPool.query(
      `UPDATE user_notifications SET read_at = now()
       WHERE app_user_id = $1 AND read_at IS NULL`,
      [appUserId]
    );
    const email = await getCurrentUserEmail();
    if (email) revalidateNotificationCountForEmail(email);
    else revalidateDashboardShell();
  } catch (e) {
    if (isUserNotificationsAccessError(e)) {
      console.warn("[userNotifications] mark all read skipped (DB privileges)", e);
      return;
    }
    throw e;
  }
}
