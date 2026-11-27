import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { workIssueHref } from "@/lib/routes";
import { sendGmailNotificationEmail } from "@/lib/supportMailGmail";
import { USER_NOTIFICATION_KIND } from "@/lib/userNotificationKinds";

function appOrigin(): string | null {
  const raw = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (!raw?.trim()) return null;
  try {
    return new URL(raw.trim()).origin;
  } catch {
    return null;
  }
}

export function absoluteWorkIssueUrl(input: {
  customerId: string;
  boardId: string;
  issueId: string;
}): string | null {
  const origin = appOrigin();
  if (!origin) return null;
  return `${origin}${workIssueHref(input.customerId, input.boardId, input.issueId)}`;
}

function isOutboxMissingError(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  if (err?.code === "42P01" || err?.code === "42501") return true;
  const msg = typeof err?.message === "string" ? err.message : "";
  return (
    msg.includes("notification_email_outbox") &&
    (msg.includes("does not exist") || msg.includes("permission denied"))
  );
}

export async function enqueueNotificationEmail(input: {
  appUserId: string;
  notificationId: string | null;
  kind: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await cloudSqlPool.query(
      `INSERT INTO notification_email_outbox
         (app_user_id, notification_id, kind, payload)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        input.appUserId,
        input.notificationId,
        input.kind,
        JSON.stringify(input.payload),
      ]
    );
  } catch (e) {
    if (isOutboxMissingError(e)) {
      console.warn(
        "[notificationEmail] outbox table missing; skipped enqueue. Apply scripts/20261121_notification_email.sql"
      );
      return;
    }
    throw e;
  }
}

function lineForOutboxItem(kind: string, payload: Record<string, unknown>): string {
  const actor =
    (typeof payload.actorName === "string" && payload.actorName.trim()) ||
    (typeof payload.mentionerName === "string" && payload.mentionerName.trim()) ||
    "Someone";
  const issueKey =
    typeof payload.issueKey === "string" && payload.issueKey.trim()
      ? payload.issueKey.trim()
      : "an issue";
  const issueTitle =
    typeof payload.issueTitle === "string" && payload.issueTitle.trim()
      ? ` “${payload.issueTitle.trim()}”`
      : "";
  const preview =
    typeof payload.commentPreview === "string" && payload.commentPreview.trim()
      ? ` — ${payload.commentPreview.trim()}`
      : "";

  const customerId =
    typeof payload.customerId === "string" ? payload.customerId : "";
  const boardId = typeof payload.boardId === "string" ? payload.boardId : "";
  const issueId = typeof payload.issueId === "string" ? payload.issueId : "";
  const href =
    customerId && boardId && issueId
      ? absoluteWorkIssueUrl({ customerId, boardId, issueId })
      : null;

  let action: string;
  switch (kind) {
    case USER_NOTIFICATION_KIND.WORK_ISSUE_ASSIGNED:
      action = `${actor} assigned you to ${issueKey}${issueTitle}`;
      break;
    case USER_NOTIFICATION_KIND.WORK_ISSUE_OWNER_SET:
      action = `${actor} made you owner of ${issueKey}${issueTitle}`;
      break;
    case USER_NOTIFICATION_KIND.WORK_ISSUE_COMMENTED:
      action = `${actor} commented on ${issueKey}${issueTitle}${preview}`;
      break;
    case USER_NOTIFICATION_KIND.WORK_ISSUE_COMMENT_REACTION: {
      const emoji =
        typeof payload.reactionEmoji === "string" &&
        payload.reactionEmoji.trim()
          ? payload.reactionEmoji.trim()
          : "";
      const label =
        typeof payload.reactionLabel === "string" &&
        payload.reactionLabel.trim()
          ? payload.reactionLabel.trim()
          : "reacted";
      action = `${actor} reacted ${emoji ? `${emoji} ` : ""}(${label}) to your comment on ${issueKey}${issueTitle}${preview}`;
      break;
    }
    case USER_NOTIFICATION_KIND.WORK_ISSUE_MENTIONED:
      action = `${actor} mentioned you on ${issueKey}${issueTitle}${preview}`;
      break;
    case USER_NOTIFICATION_KIND.WORK_ISSUE_MARKED_DONE:
      action = `${issueKey}${issueTitle} was marked Done`;
      break;
    default:
      action = `${actor} updated ${issueKey}${issueTitle}`;
  }

  return href ? `• ${action}\n  ${href}` : `• ${action}`;
}

type OutboxRow = {
  id: string;
  app_user_id: string;
  kind: string;
  payload: Record<string, unknown>;
  email: string;
};

/**
 * Flush pending notification emails as one digest per recipient.
 * Intended for Cloud Scheduler ~every 15 minutes.
 */
export async function flushNotificationEmailDigest(options?: {
  maxUsers?: number;
}): Promise<{ users: number; items: number; sent: number; failed: number }> {
  const maxUsers = Math.min(Math.max(options?.maxUsers ?? 100, 1), 500);

  let rows: OutboxRow[] = [];
  try {
    const result = await cloudSqlPool.query<OutboxRow>(
      `WITH due_users AS (
         SELECT DISTINCT o.app_user_id
         FROM notification_email_outbox o
         WHERE o.status = 'pending'
         ORDER BY o.app_user_id
         LIMIT $1
       )
       SELECT o.id, o.app_user_id, o.kind, o.payload, au.email
       FROM notification_email_outbox o
       JOIN due_users u ON u.app_user_id = o.app_user_id
       JOIN app_users au ON au.id = o.app_user_id
       WHERE o.status = 'pending'
       ORDER BY o.app_user_id, o.created_at`,
      [maxUsers]
    );
    rows = result.rows.map((row) => ({
      ...row,
      payload: (row.payload ?? {}) as Record<string, unknown>,
    }));
  } catch (e) {
    if (isOutboxMissingError(e)) {
      console.warn("[notificationEmail] outbox missing; digest skipped");
      return { users: 0, items: 0, sent: 0, failed: 0 };
    }
    throw e;
  }

  if (rows.length === 0) {
    return { users: 0, items: 0, sent: 0, failed: 0 };
  }

  const byUser = new Map<string, OutboxRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.app_user_id) ?? [];
    list.push(row);
    byUser.set(row.app_user_id, list);
  }

  let sent = 0;
  let failed = 0;

  for (const [, items] of byUser) {
    const email = items[0]?.email?.trim().toLowerCase();
    const ids = items.map((item) => item.id);
    if (!email || !email.includes("@")) {
      await cloudSqlPool.query(
        `UPDATE notification_email_outbox
         SET status = 'failed', last_error = $2, sent_at = now()
         WHERE id = ANY($1::uuid[])`,
        [ids, "Recipient has no email"]
      );
      failed += ids.length;
      continue;
    }

    await cloudSqlPool.query(
      `UPDATE notification_email_outbox
       SET status = 'sending'
       WHERE id = ANY($1::uuid[]) AND status = 'pending'`,
      [ids]
    );

    const lines = items.map((item) => lineForOutboxItem(item.kind, item.payload));
    const count = items.length;
    const subject =
      count === 1
        ? "Rove Work: 1 notification"
        : `Rove Work: ${count} notifications`;
    const body = [
      "Here’s what happened in Rove Work:",
      "",
      ...lines,
      "",
      "You’re receiving this because of your notification preferences.",
      "Manage them in Rove Apps → Notifications.",
      "",
      "— Rove",
    ].join("\n");

    try {
      await sendGmailNotificationEmail({
        toEmail: email,
        subject,
        bodyText: body,
      });
      await cloudSqlPool.query(
        `UPDATE notification_email_outbox
         SET status = 'sent', sent_at = now(), last_error = NULL
         WHERE id = ANY($1::uuid[])`,
        [ids]
      );
      sent += ids.length;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send digest";
      console.error("[notificationEmail] digest send failed", {
        email,
        error: message,
      });
      await cloudSqlPool.query(
        `UPDATE notification_email_outbox
         SET status = 'failed', last_error = $2, sent_at = now()
         WHERE id = ANY($1::uuid[])`,
        [ids, message.slice(0, 500)]
      );
      failed += ids.length;
    }
  }

  return {
    users: byUser.size,
    items: rows.length,
    sent,
    failed,
  };
}
