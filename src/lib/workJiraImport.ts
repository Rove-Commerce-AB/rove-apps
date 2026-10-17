import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import {
  createWorkBoardStatus,
  requireVisibleWorkBoard,
} from "@/lib/workBoards";
import { fetchWorkBoardStatuses } from "@/lib/workBoardsQueries";
import { WorkInputError } from "@/lib/workErrors";
import {
  estimateHoursFromSeconds,
  formatImportedComment,
  suggestPriorityMapping,
  suggestTypeMapping,
  type JiraRelationEdge,
} from "@/lib/jiraXmlParse";
import {
  findOrCreateBoardComponent,
  insertWorkIssue,
  insertWorkIssueComment,
  insertWorkIssueEvent,
  insertWorkIssuePreDeployAction,
  insertWorkIssueReference,
  insertWorkIssueRelation,
  updateWorkIssueEstimate,
  updateWorkIssuePreDeployActionDone,
  fetchWorkIssueRelations,
} from "@/lib/workIssuesQueries";
import { updateWorkIssueSchedule } from "@/lib/workSprintsQueries";
import {
  childAlreadyHasParent,
  wouldCreateBlocksCycle,
  wouldCreateParentCycle,
} from "@/lib/workIssueRelations";
import type { WorkIssuePriority, WorkIssueType } from "@/lib/workTypes";
import {
  JIRA_STATUS_CREATE,
  type JiraImportBatchResult,
  type JiraImportIssuePayload,
  type JiraImportMappings,
  type JiraImportRelationSkip,
  type JiraImportRelationsResult,
} from "@/lib/workJiraImportShared";

export {
  JIRA_STATUS_CREATE,
  matchPeopleByName,
  type JiraImportBatchResult,
  type JiraImportIssuePayload,
  type JiraImportMappings,
  type JiraImportRelationSkip,
  type JiraImportRelationsResult,
} from "@/lib/workJiraImportShared";

export type JiraImportPrepareResult = {
  existingKeys: string[];
  createdStatuses: { id: string; name: string }[];
  statusMap: Record<string, string>;
};

export async function findExistingJiraKeys(
  boardId: string,
  keys: string[]
): Promise<Set<string>> {
  const unique = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
  if (unique.length === 0) return new Set();

  const { rows } = await cloudSqlPool.query<{ label: string }>(
    `SELECT DISTINCT r.label
     FROM work_issue_references r
     INNER JOIN work_issues i ON i.id = r.issue_id
     WHERE i.project_id = $1
       AND r.label = ANY($2::text[])`,
    [boardId, unique]
  );
  return new Set(rows.map((r) => r.label));
}

async function resolveJiraKeysToIssueIds(
  boardId: string,
  keys: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { rows } = await cloudSqlPool.query<{ label: string; issue_id: string }>(
    `SELECT DISTINCT ON (r.label) r.label, r.issue_id
     FROM work_issue_references r
     INNER JOIN work_issues i ON i.id = r.issue_id
     WHERE i.project_id = $1
       AND r.label = ANY($2::text[])
     ORDER BY r.label, r.sort_order ASC, r.created_at ASC`,
    [boardId, unique]
  );
  return new Map(rows.map((r) => [r.label, r.issue_id]));
}

/**
 * Create any columns marked JIRA_STATUS_CREATE and return a resolved
 * statusMap (all values are real column UUIDs).
 */
export async function prepareJiraImport(
  boardId: string,
  statusMap: Record<string, string>,
  allKeys: string[]
): Promise<JiraImportPrepareResult> {
  const visible = await requireVisibleWorkBoard(boardId);
  if (!visible) throw new WorkInputError("Project not found or access denied.");

  const createdStatuses: { id: string; name: string }[] = [];
  const resolved: Record<string, string> = { ...statusMap };

  for (const [jiraStatus, target] of Object.entries(statusMap)) {
    if (target !== JIRA_STATUS_CREATE) continue;
    const statuses = await fetchWorkBoardStatuses(boardId);
    const existing = statuses.find(
      (s) => s.name.trim().toLowerCase() === jiraStatus.trim().toLowerCase()
    );
    if (existing) {
      resolved[jiraStatus] = existing.id;
      continue;
    }
    const created = await createWorkBoardStatus(boardId, jiraStatus);
    createdStatuses.push({ id: created.id, name: created.name });
    resolved[jiraStatus] = created.id;
  }

  const statuses = await fetchWorkBoardStatuses(boardId);
  const statusIds = new Set(statuses.map((s) => s.id));
  for (const [jiraStatus, target] of Object.entries(resolved)) {
    if (!statusIds.has(target)) {
      throw new WorkInputError(
        `Status “${jiraStatus}” is not mapped to a project column.`
      );
    }
  }

  const existingKeys = [
    ...((await findExistingJiraKeys(boardId, allKeys)).values()),
  ];

  return { existingKeys, createdStatuses, statusMap: resolved };
}

function resolveType(
  jiraType: string,
  typeMap: Record<string, WorkIssueType>
): WorkIssueType {
  return typeMap[jiraType] ?? suggestTypeMapping(jiraType);
}

function resolvePriority(
  jiraPriority: string,
  priorityMap: Record<string, WorkIssuePriority | null>
): WorkIssuePriority | null {
  if (Object.prototype.hasOwnProperty.call(priorityMap, jiraPriority)) {
    return priorityMap[jiraPriority] ?? null;
  }
  return suggestPriorityMapping(jiraPriority);
}

/**
 * Import a batch of parsed Jira issues into a Work project.
 * Skips keys that already have a reference labeled with the Jira key.
 * Epic cards are created only when createEpicCards is true; otherwise epics
 * may still seed components when mapEpicsToComponents is true.
 */
export async function importJiraIssueBatch(
  boardId: string,
  issues: JiraImportIssuePayload[],
  mappings: JiraImportMappings
): Promise<JiraImportBatchResult> {
  const visible = await requireVisibleWorkBoard(boardId);
  if (!visible) throw new WorkInputError("Project not found or access denied.");
  const actorId = visible.actor.id;

  if (issues.length === 0) {
    return { created: 0, skipped: 0, failed: [] };
  }
  if (issues.length > 40) {
    throw new WorkInputError("Batch too large (max 40).");
  }

  for (const [name, target] of Object.entries(mappings.statusMap)) {
    if (target === JIRA_STATUS_CREATE) {
      throw new WorkInputError(
        `Status “${name}” still needs a column. Run prepare first.`
      );
    }
  }

  const memberIds = new Set(visible.board.member_ids);
  const existing = await findExistingJiraKeys(
    boardId,
    issues.map((i) => i.key)
  );

  const componentCache = new Map<string, string>();
  async function ensureComponent(name: string): Promise<string> {
    const cacheKey = name.trim().toLowerCase();
    const cached = componentCache.get(cacheKey);
    if (cached) return cached;
    const component = await findOrCreateBoardComponent(boardId, name.trim());
    componentCache.set(cacheKey, component.id);
    return component.id;
  }

  async function componentIdForEpicParent(
    parentKey: string | null
  ): Promise<string | null> {
    if (!mappings.mapEpicsToComponents || !parentKey) return null;
    const title = mappings.epicTitles[parentKey];
    if (!title?.trim()) return null;
    return ensureComponent(title);
  }

  let created = 0;
  let skipped = 0;
  const failed: { key: string; error: string }[] = [];

  for (const issue of issues) {
    try {
      if (existing.has(issue.key)) {
        skipped += 1;
        continue;
      }

      const isEpic = issue.type.trim().toLowerCase() === "epic";

      if (isEpic && mappings.mapEpicsToComponents && issue.summary.trim()) {
        await ensureComponent(issue.summary);
      }

      if (isEpic && !mappings.createEpicCards) {
        skipped += 1;
        continue;
      }

      const statusId = mappings.statusMap[issue.status];
      if (!statusId) {
        throw new WorkInputError(
          `No column mapping for status “${issue.status}”.`
        );
      }

      const issueType = resolveType(issue.type, mappings.typeMap);
      const priority = resolvePriority(issue.priority, mappings.priorityMap);

      let ownerAppUserId: string | null = null;
      if (issue.assigneeName) {
        const mapped = mappings.peopleMap[issue.assigneeName];
        if (mapped && memberIds.has(mapped)) {
          ownerAppUserId = mapped;
        }
      }

      const componentId = await componentIdForEpicParent(issue.parentKey);

      const labels = issue.labels.filter(
        (l) => l.toUpperCase() !== "PREDEPLOYACTIONS"
      );

      const issueId = await insertWorkIssue({
        boardId,
        title: issue.summary.slice(0, 500) || issue.key,
        status: statusId,
        createdByAppUserId: actorId,
        ownerAppUserId,
        description: issue.descriptionText,
        priority,
        labels,
        issueType,
        componentId,
        eventActorAppUserId: actorId,
      });

      const hours = estimateHoursFromSeconds(issue.estimateSeconds);
      if (hours != null) {
        await updateWorkIssueEstimate(boardId, issueId, hours);
      }

      if (issue.startDate || issue.dueDate) {
        await updateWorkIssueSchedule(
          boardId,
          issueId,
          issue.startDate,
          issue.dueDate
        );
      }

      await insertWorkIssueReference({
        boardId,
        issueId,
        url: issue.link,
        label: issue.key,
        actorAppUserId: actorId,
      });

      for (const action of issue.preDeployActions) {
        const createdAction = await insertWorkIssuePreDeployAction({
          issueId,
          body: action.body.slice(0, 4000),
        });
        if (action.isDone) {
          await updateWorkIssuePreDeployActionDone(
            issueId,
            createdAction.id,
            true
          );
        }
      }

      for (const comment of issue.comments) {
        const body = formatImportedComment(comment);
        if (!body.trim()) continue;
        await insertWorkIssueComment({
          boardId,
          issueId,
          authorAppUserId: actorId,
          body: body.slice(0, 20000),
        });
      }

      existing.add(issue.key);
      created += 1;
    } catch (error) {
      failed.push({
        key: issue.key,
        error: error instanceof Error ? error.message : "Import failed",
      });
    }
  }

  return { created, skipped, failed };
}

/**
 * Pass 2: create Work relations from Jira parent/links after cards exist.
 * Missing endpoints are skipped and listed (not fatal).
 */
export async function importJiraRelations(
  boardId: string,
  edges: JiraRelationEdge[]
): Promise<JiraImportRelationsResult> {
  const visible = await requireVisibleWorkBoard(boardId);
  if (!visible) throw new WorkInputError("Project not found or access denied.");
  const actorId = visible.actor.id;

  if (edges.length === 0) {
    return { created: 0, skipped: [] };
  }
  if (edges.length > 2000) {
    throw new WorkInputError("Too many relations in one pass.");
  }

  const keys = edges.flatMap((e) => [e.fromKey, e.toKey]);
  const idByKey = await resolveJiraKeysToIssueIds(boardId, keys);

  const existingRows = (await fetchWorkIssueRelations(boardId)).map((row) => ({
    id: row.id,
    boardId: row.project_id,
    fromIssueId: row.from_issue_id,
    toIssueId: row.to_issue_id,
    kind: row.kind,
  }));

  let created = 0;
  const skipped: JiraImportRelationSkip[] = [];

  for (const edge of edges) {
    const fromId = idByKey.get(edge.fromKey);
    const toId = idByKey.get(edge.toKey);
    if (!fromId || !toId) {
      skipped.push({
        fromKey: edge.fromKey,
        toKey: edge.toKey,
        kind: edge.kind,
        jiraType: edge.jiraType,
        reason: !fromId && !toId
          ? `Missing both ${edge.fromKey} and ${edge.toKey}`
          : !fromId
            ? `Missing ${edge.fromKey}`
            : `Missing ${edge.toKey}`,
      });
      continue;
    }

    if (edge.kind === "parent") {
      if (childAlreadyHasParent(existingRows, toId)) {
        skipped.push({
          fromKey: edge.fromKey,
          toKey: edge.toKey,
          kind: edge.kind,
          jiraType: edge.jiraType,
          reason: "Child already has a parent",
        });
        continue;
      }
      if (wouldCreateParentCycle(existingRows, fromId, toId)) {
        skipped.push({
          fromKey: edge.fromKey,
          toKey: edge.toKey,
          kind: edge.kind,
          jiraType: edge.jiraType,
          reason: "Would create a parent cycle",
        });
        continue;
      }
    }

    if (edge.kind === "blocks") {
      if (wouldCreateBlocksCycle(existingRows, fromId, toId)) {
        skipped.push({
          fromKey: edge.fromKey,
          toKey: edge.toKey,
          kind: edge.kind,
          jiraType: edge.jiraType,
          reason: "Would create a blocks cycle",
        });
        continue;
      }
    }

    try {
      await insertWorkIssueRelation({
        boardId,
        fromIssueId: fromId,
        toIssueId: toId,
        kind: edge.kind,
      });
      existingRows.push({
        id: "new",
        boardId,
        fromIssueId: fromId,
        toIssueId: toId,
        kind: edge.kind,
      });
      await insertWorkIssueEvent({
        issueId: toId,
        actorAppUserId: actorId,
        kind: "relation",
        summary:
          edge.kind === "parent"
            ? `linked parent ${edge.fromKey} (import)`
            : edge.kind === "blocks"
              ? `linked blocks ${edge.fromKey} → ${edge.toKey} (import)`
              : `linked relates ${edge.fromKey} ↔ ${edge.toKey} (import)`,
      });
      created += 1;
    } catch (error) {
      const maybePg = error as { code?: string };
      if (maybePg.code === "23505") {
        skipped.push({
          fromKey: edge.fromKey,
          toKey: edge.toKey,
          kind: edge.kind,
          jiraType: edge.jiraType,
          reason: "Relation already exists",
        });
        continue;
      }
      skipped.push({
        fromKey: edge.fromKey,
        toKey: edge.toKey,
        kind: edge.kind,
        jiraType: edge.jiraType,
        reason: error instanceof Error ? error.message : "Failed",
      });
    }
  }

  return { created, skipped };
}
