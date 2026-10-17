import type { AppUserRole } from "@/lib/peopleTypes";

export type WorkActor = {
  id: string;
  role: AppUserRole;
};

export type WorkBoardVisibilityInput = {
  customerIsInternal: boolean;
  memberAppUserIds: readonly string[];
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
 * Customer-role users only see estimate/logged time when the customer setting
 * allows it. Everyone else always sees time.
 */
export function canSeeWorkTime(
  actor: WorkActor,
  customerAllowsTimeForCustomerUsers: boolean
): boolean {
  if (actor.role !== "customer") return true;
  return customerAllowsTimeForCustomerUsers;
}

/**
 * Activity rows that reveal an estimate or a time report.
 * Customer users never see these, even when the customer setting shows the Time tab.
 */
const CUSTOMER_HIDDEN_ACTIVITY_KINDS = new Set([
  "estimate",
  "time",
  "time_log",
  "time_report",
]);

export function isWorkActivityVisibleToActor(
  actor: WorkActor,
  kind: string
): boolean {
  if (actor.role !== "customer") return true;
  return !CUSTOMER_HIDDEN_ACTIVITY_KINDS.has(kind);
}

/** Customer-role users never log time on Work issues. */
export function canLogWorkTime(actor: WorkActor): boolean {
  return actor.role !== "customer";
}

/** Customer-role users cannot create Work projects. */
export function canCreateWorkProject(actor: WorkActor): boolean {
  return actor.role !== "customer";
}
