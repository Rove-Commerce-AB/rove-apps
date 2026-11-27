import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { getCurrentAppUser } from "@/lib/appUsers";
import {
  USER_NOTIFICATION_KIND,
  type UserNotificationKind,
} from "@/lib/userNotificationKinds";

export type UserNotificationPrefs = {
  workAssignInApp: boolean;
  workAssignEmail: boolean;
  workCommentInApp: boolean;
  workCommentEmail: boolean;
  workCommentReactionInApp: boolean;
  workCommentReactionEmail: boolean;
  workMentionInApp: boolean;
  /** Always true in product rules; stored for schema symmetry. */
  workMentionEmail: boolean;
  workDoneInApp: boolean;
  workDoneEmail: boolean;
};

export const DEFAULT_USER_NOTIFICATION_PREFS: UserNotificationPrefs = {
  workAssignInApp: true,
  workAssignEmail: true,
  workCommentInApp: true,
  workCommentEmail: true,
  workCommentReactionInApp: true,
  workCommentReactionEmail: true,
  workMentionInApp: true,
  workMentionEmail: true,
  workDoneInApp: true,
  workDoneEmail: true,
};

type PrefsRow = {
  work_assign_in_app: boolean;
  work_assign_email: boolean;
  work_comment_in_app: boolean;
  work_comment_email: boolean;
  work_comment_reaction_in_app: boolean;
  work_comment_reaction_email: boolean;
  work_mention_in_app: boolean;
  work_mention_email: boolean;
  work_done_in_app: boolean;
  work_done_email: boolean;
};

function mapRow(row: PrefsRow): UserNotificationPrefs {
  return {
    workAssignInApp: row.work_assign_in_app,
    workAssignEmail: row.work_assign_email,
    workCommentInApp: row.work_comment_in_app,
    workCommentEmail: row.work_comment_email,
    workCommentReactionInApp: row.work_comment_reaction_in_app,
    workCommentReactionEmail: row.work_comment_reaction_email,
    workMentionInApp: row.work_mention_in_app,
    workMentionEmail: true,
    workDoneInApp: row.work_done_in_app,
    workDoneEmail: row.work_done_email,
  };
}

function isPrefsMissingError(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  if (err?.code === "42P01" || err?.code === "42501") return true;
  const msg = typeof err?.message === "string" ? err.message : "";
  return (
    msg.includes("user_notification_prefs") &&
    (msg.includes("does not exist") || msg.includes("permission denied"))
  );
}

export async function getUserNotificationPrefs(
  appUserId: string
): Promise<UserNotificationPrefs> {
  try {
    const { rows } = await cloudSqlPool.query<PrefsRow>(
      `SELECT
         work_assign_in_app,
         work_assign_email,
         work_comment_in_app,
         work_comment_email,
         work_comment_reaction_in_app,
         work_comment_reaction_email,
         work_mention_in_app,
         work_mention_email,
         work_done_in_app,
         work_done_email
       FROM user_notification_prefs
       WHERE app_user_id = $1`,
      [appUserId]
    );
    const row = rows[0];
    if (!row) return { ...DEFAULT_USER_NOTIFICATION_PREFS };
    return mapRow(row);
  } catch (e) {
    if (isPrefsMissingError(e)) return { ...DEFAULT_USER_NOTIFICATION_PREFS };
    throw e;
  }
}

export async function getNotificationPrefsForCurrentUser(): Promise<UserNotificationPrefs> {
  const user = await getCurrentAppUser();
  if (!user?.id) return { ...DEFAULT_USER_NOTIFICATION_PREFS };
  return getUserNotificationPrefs(user.id);
}

export async function saveNotificationPrefsForCurrentUser(
  input: Partial<UserNotificationPrefs>
): Promise<UserNotificationPrefs> {
  const user = await getCurrentAppUser();
  if (!user?.id) throw new Error("Not signed in");

  const current = await getUserNotificationPrefs(user.id);
  const next: UserNotificationPrefs = {
    workAssignInApp: input.workAssignInApp ?? current.workAssignInApp,
    workAssignEmail: input.workAssignEmail ?? current.workAssignEmail,
    workCommentInApp: input.workCommentInApp ?? current.workCommentInApp,
    workCommentEmail: input.workCommentEmail ?? current.workCommentEmail,
    workCommentReactionInApp:
      input.workCommentReactionInApp ?? current.workCommentReactionInApp,
    workCommentReactionEmail:
      input.workCommentReactionEmail ?? current.workCommentReactionEmail,
    workMentionInApp: input.workMentionInApp ?? current.workMentionInApp,
    workMentionEmail: true,
    workDoneInApp: input.workDoneInApp ?? current.workDoneInApp,
    workDoneEmail: input.workDoneEmail ?? current.workDoneEmail,
  };

  await cloudSqlPool.query(
    `INSERT INTO user_notification_prefs (
       app_user_id,
       work_assign_in_app,
       work_assign_email,
       work_comment_in_app,
       work_comment_email,
       work_comment_reaction_in_app,
       work_comment_reaction_email,
       work_mention_in_app,
       work_mention_email,
       work_done_in_app,
       work_done_email,
       updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10, now())
     ON CONFLICT (app_user_id) DO UPDATE SET
       work_assign_in_app = EXCLUDED.work_assign_in_app,
       work_assign_email = EXCLUDED.work_assign_email,
       work_comment_in_app = EXCLUDED.work_comment_in_app,
       work_comment_email = EXCLUDED.work_comment_email,
       work_comment_reaction_in_app = EXCLUDED.work_comment_reaction_in_app,
       work_comment_reaction_email = EXCLUDED.work_comment_reaction_email,
       work_mention_in_app = EXCLUDED.work_mention_in_app,
       work_mention_email = true,
       work_done_in_app = EXCLUDED.work_done_in_app,
       work_done_email = EXCLUDED.work_done_email,
       updated_at = now()`,
    [
      user.id,
      next.workAssignInApp,
      next.workAssignEmail,
      next.workCommentInApp,
      next.workCommentEmail,
      next.workCommentReactionInApp,
      next.workCommentReactionEmail,
      next.workMentionInApp,
      next.workDoneInApp,
      next.workDoneEmail,
    ]
  );

  return next;
}

export type NotificationDeliveryChannels = {
  inApp: boolean;
  email: boolean;
};

/** Resolve in-app / email channels for a notification kind. */
export function channelsForNotificationKind(
  kind: UserNotificationKind | string,
  prefs: UserNotificationPrefs
): NotificationDeliveryChannels {
  switch (kind) {
    case USER_NOTIFICATION_KIND.WORK_ISSUE_ASSIGNED:
    case USER_NOTIFICATION_KIND.WORK_ISSUE_OWNER_SET:
      return {
        inApp: prefs.workAssignInApp,
        email: prefs.workAssignEmail,
      };
    case USER_NOTIFICATION_KIND.WORK_ISSUE_COMMENTED:
      return {
        inApp: prefs.workCommentInApp,
        email: prefs.workCommentEmail,
      };
    case USER_NOTIFICATION_KIND.WORK_ISSUE_COMMENT_REACTION:
      return {
        inApp: prefs.workCommentReactionInApp,
        email: prefs.workCommentReactionEmail,
      };
    case USER_NOTIFICATION_KIND.WORK_ISSUE_MENTIONED:
      return {
        inApp: prefs.workMentionInApp,
        email: true,
      };
    case USER_NOTIFICATION_KIND.WORK_ISSUE_MARKED_DONE:
      return {
        inApp: prefs.workDoneInApp,
        email: prefs.workDoneEmail,
      };
    default:
      // Planner / product: in-app only in v1.
      return { inApp: true, email: false };
  }
}
