import {
  normalizePersonName,
  type JiraRelationEdge,
  type ParsedJiraComment,
  type ParsedJiraIssueLink,
  type ParsedJiraPreDeployAction,
} from "@/lib/jiraXmlParse";
import type {
  WorkIssuePriority,
  WorkIssueType,
  WorkPerson,
} from "@/lib/workTypes";

/** Sentinel in statusMap: create a column named like the Jira status. */
export const JIRA_STATUS_CREATE = "__create__";

export type JiraImportIssuePayload = {
  key: string;
  link: string;
  summary: string;
  descriptionText: string;
  type: string;
  priority: string;
  status: string;
  assigneeName: string | null;
  labels: string[];
  parentKey: string | null;
  links: ParsedJiraIssueLink[];
  estimateSeconds: number | null;
  dueDate: string | null;
  startDate: string | null;
  comments: ParsedJiraComment[];
  preDeployActions: ParsedJiraPreDeployAction[];
};

export type JiraImportMappings = {
  /** Jira status name → existing Work column id, or JIRA_STATUS_CREATE */
  statusMap: Record<string, string>;
  typeMap: Record<string, WorkIssueType>;
  priorityMap: Record<string, WorkIssuePriority | null>;
  /** Jira assignee display name → board member app_user id */
  peopleMap: Record<string, string>;
  /** Import Epic issues as Work cards and link children via parent relations. */
  createEpicCards: boolean;
  /** Create Work components from epic titles and assign them to children. */
  mapEpicsToComponents: boolean;
  /** Epic key → epic summary (for component names when mapping) */
  epicTitles: Record<string, string>;
};

export type JiraImportBatchResult = {
  created: number;
  skipped: number;
  failed: { key: string; error: string }[];
};

export type JiraImportRelationSkip = {
  fromKey: string;
  toKey: string;
  kind: string;
  jiraType: string;
  reason: string;
};

export type JiraImportRelationsResult = {
  created: number;
  skipped: JiraImportRelationSkip[];
};

export type { JiraRelationEdge };

export function matchPeopleByName(
  jiraNames: string[],
  members: WorkPerson[]
): Record<string, string> {
  const byNorm = new Map(
    members.map((m) => [normalizePersonName(m.name), m.id])
  );
  const out: Record<string, string> = {};
  for (const name of jiraNames) {
    const id = byNorm.get(normalizePersonName(name));
    if (id) out[name] = id;
  }
  return out;
}
