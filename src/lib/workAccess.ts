import type { AppUserRole } from "@/lib/peopleTypes";

export type WorkActor = {
  id: string;
  role: AppUserRole;
};

export type WorkBoardVisibilityInput = {
  customerIsInternal: boolean;
  memberAppUserIds: readonly string[];
};

export type WorkActivityTimeVisibility = {
  showEstimates: boolean;
  showReportedTime: boolean;
};

/** Admin sees every customer. Others only see assigned customers. */
export function canSeeWorkCustomer(
  actor: WorkActor,
  assignedCustomerIds: readonly string[],
  customerId: string
): boolean {
  if (actor.role === "admin") return true;
  return assignedCustomerIds.includes(customerId);
}

/**
 * Board access is the member list for everyone, including admins.
 */
export function canSeeWorkBoard(
  actor: WorkActor,
  board: WorkBoardVisibilityInput
): boolean {
  return board.memberAppUserIds.includes(actor.id);
}

export function filterVisibleWorkBoards<T extends WorkBoardVisibilityInput>(
  actor: WorkActor,
  boards: readonly T[]
): T[] {
  return boards.filter((board) => canSeeWorkBoard(actor, board));
}

/**
 * Customer-role users only see estimates when the customer setting allows it.
 * Everyone else always sees estimates.
 */
export function canSeeWorkEstimates(
  actor: WorkActor,
  customerAllowsEstimatesForCustomerUsers: boolean
): boolean {
  if (actor.role !== "customer") return true;
  return customerAllowsEstimatesForCustomerUsers;
}

/**
 * Customer-role users only see reported/logged time when the customer setting
 * allows it. Everyone else always sees reported time.
 */
export function canSeeWorkReportedTime(
  actor: WorkActor,
  customerAllowsReportedTimeForCustomerUsers: boolean
): boolean {
  if (actor.role !== "customer") return true;
  return customerAllowsReportedTimeForCustomerUsers;
}

const ESTIMATE_ACTIVITY_KINDS = new Set(["estimate"]);
const REPORTED_TIME_ACTIVITY_KINDS = new Set([
  "time",
  "time_log",
  "time_report",
]);

/**
 * Activity rows that reveal an estimate or a time report follow the matching
 * customer visibility setting. Staff always see every activity kind.
 */
export function isWorkActivityVisibleToActor(
  actor: WorkActor,
  kind: string,
  visibility?: WorkActivityTimeVisibility
): boolean {
  if (actor.role !== "customer") return true;
  if (ESTIMATE_ACTIVITY_KINDS.has(kind)) {
    return visibility?.showEstimates === true;
  }
  if (REPORTED_TIME_ACTIVITY_KINDS.has(kind)) {
    return visibility?.showReportedTime === true;
  }
  return true;
}

/** Customer-role users never log time on Work issues. */
export function canLogWorkTime(actor: WorkActor): boolean {
  return actor.role !== "customer";
}

/** Customer-role users cannot create Work projects. */
export function canCreateWorkProject(actor: WorkActor): boolean {
  return actor.role !== "customer";
}

/** Customer-role users cannot archive Work projects. */
export function canArchiveWorkProject(actor: WorkActor): boolean {
  return actor.role !== "customer";
}

/** Customer-role users cannot add/remove project members. */
export function canManageWorkBoardAccess(actor: WorkActor): boolean {
  return actor.role !== "customer";
}

/**
 * Customer-role users may only delete issues they created (reporter).
 * Admin/member can delete any issue on a board they can access (other rules apply).
 */
export function canDeleteWorkIssue(
  actor: WorkActor,
  createdByAppUserId: string | null | undefined
): boolean {
  if (actor.role !== "customer") return true;
  return Boolean(createdByAppUserId && createdByAppUserId === actor.id);
}
