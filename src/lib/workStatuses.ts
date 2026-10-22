export type WorkIssueStatus = string;

export type WorkBoardStatus = {
  id: string;
  name: string;
  sortOrder: number;
  isDone: boolean;
};

export const DEFAULT_WORK_PROJECT_STATUSES: {
  name: string;
  isDone: boolean;
}[] = [
  { name: "Todo", isDone: false },
  { name: "In progress", isDone: false },
  { name: "To be tested", isDone: false },
  { name: "In review", isDone: false },
  { name: "Done", isDone: true },
];

/**
 * Columns for auto-provisioned Support Work boards (prefix SUP).
 * Used only by ensureSupportWorkProject — not the default Work project set.
 */
export const SUPPORT_WORK_PROJECT_STATUSES: {
  name: string;
  isDone: boolean;
}[] = [
  { name: "New", isDone: false },
  { name: "Investigating", isDone: false },
  { name: "Waiting on customer", isDone: false },
  { name: "Resolved", isDone: true },
];
