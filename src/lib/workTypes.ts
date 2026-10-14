import type { WorkBoardStatus, WorkIssueStatus } from "@/lib/workStatuses";
import type { WorkIssueRelations } from "@/lib/workIssueRelations";

export type { WorkIssueRelations };

export type { WorkBoardStatus, WorkIssueStatus };

export const WORK_FILE_MAX_BYTES = 8 * 1024 * 1024;

export type WorkSelectorBoard = {
  id: string;
  title: string;
  prefix: string;
};

export type WorkSelectorCustomer = {
  id: string;
  name: string;
  color: string | null;
  url: string | null;
  isInternal: boolean;
  boards: WorkSelectorBoard[];
};

export type WorkCustomerView = WorkSelectorCustomer & {
  archivedBoards: WorkSelectorBoard[];
};

export type WorkPerson = {
  id: string;
  name: string;
  initials: string;
};

export type WorkAccessPerson = WorkPerson & { onCustomer: boolean };

export type WorkLabel = {
  id: string;
  name: string;
};

export type WorkIssuePriority = "low" | "medium" | "high";

/** Fixed issue kinds. Default for new cards is chosen in the add-card UI. */
export type WorkIssueType = "issue" | "bug";

export type WorkComponent = {
  id: string;
  name: string;
};

export type WorkSprintStatus = "current" | "next" | "completed";

export type WorkSprint = {
  id: string;
  number: number;
  title: string;
  startsOn: string;
  endsOn: string;
  status: WorkSprintStatus;
  capacityHours: number | null;
};

export type WorkRequirement = {
  id: string;
  body: string;
  isDone: boolean;
  sortOrder: number;
};

export type WorkRequirementKind = "acceptance" | "dod";

/** Checklist item for DB / Litium BO setup before deploy. */
export type WorkPreDeployAction = {
  id: string;
  body: string;
  isDone: boolean;
  sortOrder: number;
};

export type WorkReference = {
  id: string;
  url: string;
  label: string;
  sortOrder: number;
};

export type WorkComment = {
  id: string;
  body: string;
  createdAt: string;
  author: WorkPerson;
};

export type WorkEvent = {
  id: string;
  kind: string;
  summary: string;
  createdAt: string;
  actor: WorkPerson;
};

export type WorkFile = {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
};

export type WorkIssue = {
  id: string;
  number: number;
  key: string;
  title: string;
  status: WorkIssueStatus;
  sortOrder: number;
  issueType: WorkIssueType;
  component: WorkComponent | null;
  description: string;
  currentState: string;
  nextStep: string;
  priority: WorkIssuePriority | null;
  owner: WorkPerson | null;
  reporter: WorkPerson | null;
  assignees: WorkPerson[];
  labels: WorkLabel[];
  comments: WorkComment[];
  events: WorkEvent[];
  files: WorkFile[];
  requirements: WorkRequirement[];
  definitionOfDone: WorkRequirement[];
  preDeployActions: WorkPreDeployAction[];
  outOfScope: string;
  references: WorkReference[];
  relations: WorkIssueRelations;
  estimateHours: number | null;
  loggedHours: number;
  sprintId: string | null;
  startDate: string | null;
  dueDate: string | null;
};

export type WorkBoardView = {
  id: string;
  title: string;
  prefix: string;
  agentsMd: string;
  customerId: string;
  customerName: string;
  /** Linked Planner `projects.id`, when set. */
  plannerProjectId: string | null;
  plannerProjectName: string | null;
  /**
   * Whether the current viewer may see estimates and reported time.
   * False for customer-role users when the customer setting is off.
   */
  showTime: boolean;
  currentUser: WorkPerson;
  people: WorkPerson[];
  members: WorkPerson[];
  statuses: WorkBoardStatus[];
  boardLabels: WorkLabel[];
  components: WorkComponent[];
  issues: WorkIssue[];
  sprints: WorkSprint[];
};

export type WorkProjectContext = {
  project: {
    id: string;
    title: string;
    prefix: string;
    customerId: string;
    customerName: string;
  };
  columns: WorkBoardStatus[];
  agentsMd: string;
};
