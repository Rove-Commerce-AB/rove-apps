export const USER_NOTIFICATION_KIND = {
  ALLOCATION_BOOKED: "allocation_booked",
  FEATURE_REQUEST_IMPLEMENTED: "feature_request_implemented",
  FEATURE_REQUEST_DECLINED: "feature_request_declined",
  WORK_ISSUE_MENTIONED: "work_issue_mentioned",
  WORK_ISSUE_OWNER_SET: "work_issue_owner_set",
  WORK_ISSUE_ASSIGNED: "work_issue_assigned",
  /** Assignee/owner notified when someone comments (not @mention). */
  WORK_ISSUE_COMMENTED: "work_issue_commented",
  /** Comment author notified when someone reacts to their comment. */
  WORK_ISSUE_COMMENT_REACTION: "work_issue_comment_reaction",
  /** Reporter notified when an issue first enters a Done column. */
  WORK_ISSUE_MARKED_DONE: "work_issue_marked_done",
} as const;

/** Legacy Taskboard kinds (rows may still exist; not emitted anymore). */
export const LEGACY_TASK_NOTIFICATION_KIND = {
  TASK_BOARD_INVITED: "task_board_invited",
  TASK_TODO_ASSIGNED: "task_todo_assigned",
} as const;

export type UserNotificationKind =
  (typeof USER_NOTIFICATION_KIND)[keyof typeof USER_NOTIFICATION_KIND];

export type UserNotificationRow = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type AllocationInsertForNotify = {
  id: string;
  consultant_id: string | null;
  project_id: string;
  year: number;
  week: number;
  hours: number;
};
