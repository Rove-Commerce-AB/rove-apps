import "server-only";

import { withCloudSqlTransaction } from "@/lib/cloudSqlPool";
import {
  canDeleteWorkIssue,
  canSeeWorkTime,
  type WorkActor,
} from "@/lib/workAccess";
import { requireVisibleWorkBoard } from "@/lib/workBoards";
import { WorkInputError } from "@/lib/workErrors";
import { workIssueKey } from "@/lib/workIssueKey";
import {
  addWorkIssueAssignee,
  deleteWorkIssueFile,
  fetchWorkIssueNotifyMeta,
  fetchWorkIssueDescription,
  fetchWorkIssueCreatedByAppUserId,
  fetchWorkBoardMembers,
  countIssuesUsingComponent,
  deleteBoardComponent,
  findBoardComponentByName,
  findOrCreateBoardComponent,
  findOrCreateBoardLabel,
  renameBoardComponent,
  insertWorkIssue,
  deleteWorkIssueComment,
  deleteWorkIssueRelation,
  fetchWorkIssueRelations,
  insertWorkIssueComment,
  insertWorkIssueEvent,
  insertWorkIssueFile,
  insertWorkIssueRelation,
  insertWorkIssueRequirement,
  insertWorkIssuePreDeployAction,
  insertWorkIssueReference,
  linkWorkIssueLabel,
  moveWorkIssue,
  removeWorkIssueAssignee,
  reorderWorkIssuesInStatus,
  unlinkWorkIssueLabel,
  updateWorkIssueComment,
  updateWorkIssueComponent,
  updateWorkIssueEstimate,
  updateWorkIssueField,
  updateWorkIssueOwner,
  updateWorkIssuePriority,
  updateWorkIssueType,
  updateWorkIssueRequirementBody,
  updateWorkIssueRequirementDone,
  deleteWorkIssueRequirement,
  updateWorkIssuePreDeployActionBody,
  updateWorkIssuePreDeployActionDone,
  deleteWorkIssuePreDeployAction,
  deleteWorkIssueReference,
  updateWorkIssueTitle,
  updateWorkIssueDetails,
  isWorkBoardMember,
  workIssueHasLoggedTime,
  deleteWorkIssue as deleteWorkIssueRow,
} from "@/lib/workIssuesQueries";
import { commentPreview, extractMentionedIds } from "@/lib/workMentions";
import {
  childAlreadyHasParent,
  relationEdgeFromRole,
  relationEventSummary,
  WORK_RELATION_ROLES,
  wouldCreateBlocksCycle,
  wouldCreateParentCycle,
  type WorkRelationRole,
} from "@/lib/workIssueRelations";
import { USER_NOTIFICATION_KIND } from "@/lib/userNotificationKinds";
import { insertUserNotification } from "@/lib/userNotifications";
import {
  WORK_FILE_MAX_BYTES,
  type WorkComponent,
  type WorkIssuePriority,
  type WorkIssueType,
  type WorkIssueDetailsInput,
  type WorkRequirementKind,
} from "@/lib/workTypes";
import { formatWorkHours, parseWorkEstimateHours } from "@/lib/workTime";
import type { WorkIssueStatus } from "@/lib/workStatuses";
import { fetchWorkBoardStatuses } from "@/lib/workBoardsQueries";
import { setWorkIssueSprint } from "@/lib/workSprints";
import { fetchWorkSprintById } from "@/lib/workSprintsQueries";

export { WORK_FILE_MAX_BYTES };

async function requireBoardAccess(boardId: string, authenticatedActor?: WorkActor) {
  const visible = await requireVisibleWorkBoard(boardId, authenticatedActor);

  if (!visible) throw new WorkInputError("Project not found or access denied.");

  return visible;
}

async function logEvent(
  issueId: string,
  actorAppUserId: string,
  kind: string,
  summary: string
) {
  await insertWorkIssueEvent({ issueId, actorAppUserId, kind, summary });
}

export async function createWorkIssue(input: WorkIssueDetailsInput & {
  boardId: string;
  title: string;
  /** Defaults to assigning the creator as owner. False creates an unassigned issue. */
  assignToMe?: boolean;
  /** Defaults to the board's first status (by sort order). */
  status?: WorkIssueStatus;
  issueType?: WorkIssueType;
  componentId?: string | null;
  /** When set, issue is placed in that sprint (current/next only). */
  sprintId?: string | null;
}, authenticatedActor?: WorkActor): Promise<string> {
  const { actor } = await requireBoardAccess(input.boardId, authenticatedActor);
  const details = normalizeWorkIssueDetails(input);
  const title = details.title;

  if (!title) throw new WorkInputError("Title is required.");

  let status = input.status;
  if (status) {
    await assertBoardStatus(input.boardId, status);
  } else {
    const statuses = await fetchWorkBoardStatuses(input.boardId);
    status = statuses[0]?.id;
    if (!status) throw new WorkInputError("Project has no columns.");
  }

  const sprintId = input.sprintId?.trim() || null;
  if (sprintId) {
    const sprint = await fetchWorkSprintById(sprintId);
    if (!sprint || sprint.project_id !== input.boardId) {
      throw new Error("Sprint not found");
    }
    if (sprint.status !== "current" && sprint.status !== "next") {
      throw new Error("Can only add issues to the current or an upcoming sprint");
    }
  }

  const issueType = input.issueType === "bug" ? "bug" : "issue";
  const issueId = await insertWorkIssue({
    boardId: input.boardId,
    title,
    status,
    createdByAppUserId: actor.id,
    ownerAppUserId: input.assignToMe === false ? null : actor.id,
    issueType,
    componentId: input.componentId ?? null,
    description: details.description,
    currentState: details.currentState,
    nextStep: details.nextStep,
    outOfScope: details.outOfScope,
    priority: details.priority,
    labels: details.labels,
  });

  if (sprintId) {
    await setWorkIssueSprint(input.boardId, issueId, sprintId, actor);
  }

  return issueId;
}

function normalizeWorkIssueDetails(input: WorkIssueDetailsInput): WorkIssueDetailsInput {
  const details: WorkIssueDetailsInput = {};

  for (const field of ["title", "description", "currentState", "nextStep", "outOfScope"] as const) {
    const value = input[field];

    if (value === undefined) continue;

    if (typeof value !== "string") throw new WorkInputError(`${field} must be text.`);

    details[field] = field === "title" ? value.trim() : value;
  }

  if (details.title === "") throw new WorkInputError("Title is required.");

  if (input.issueType !== undefined) {
    if (input.issueType !== "issue" && input.issueType !== "bug") throw new WorkInputError("Invalid issue type.");

    details.issueType = input.issueType;
  }

  if (input.priority !== undefined) {
    if (input.priority !== null && !["low", "medium", "high"].includes(input.priority)) {
      throw new WorkInputError("Invalid priority.");
    }

    details.priority = input.priority;
  }

  if (input.labels !== undefined) {
    if (!Array.isArray(input.labels) || input.labels.length > 50) {
      throw new WorkInputError("Labels must be an array of up to 50 names.");
    }

    const names = new Map<string, string>();

    for (const name of input.labels) {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
        throw new WorkInputError("Each label must have a nonblank name of up to 100 characters.");
      }

      const trimmed = name.trim();
      const key = trimmed.toLowerCase();

      if (!names.has(key)) names.set(key, trimmed);
    }

    details.labels = [...names.values()];
  }

  return details;
}

export async function editWorkIssue(
  boardId: string,
  issueId: string,
  changes: WorkIssueDetailsInput,
  authenticatedActor?: WorkActor
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId, authenticatedActor);
  const details = normalizeWorkIssueDetails(changes);

  if (Object.keys(details).length === 0) throw new WorkInputError("Provide at least one field to update.");

  const updated = await updateWorkIssueDetails(boardId, issueId, details, actor.id);

  if (!updated) throw new WorkInputError("Issue not found in this project.");
}

export async function setWorkIssueTitle(
  boardId: string,
  issueId: string,
  title: string
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId);
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Title is required");
  const ok = await updateWorkIssueTitle(boardId, issueId, trimmed);
  if (!ok) throw new Error("Issue not found");
  await logEvent(issueId, actor.id, "title", `changed the title to “${trimmed}”`);
}

export async function deleteWorkIssue(
  boardId: string,
  issueId: string
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId);
  const createdByAppUserId = await fetchWorkIssueCreatedByAppUserId(
    boardId,
    issueId
  );
  if (!canDeleteWorkIssue(actor, createdByAppUserId)) {
    throw new WorkInputError("You can only delete issues you created.");
  }
  if (await workIssueHasLoggedTime(issueId)) {
    throw new Error("Issues with logged time cannot be deleted");
  }
  const ok = await deleteWorkIssueRow(boardId, issueId);
  if (!ok) throw new Error("Issue not found");
}

export async function setWorkIssueOwner(
  boardId: string,
  issueId: string,
  ownerAppUserId: string | null,
  ownerName: string
): Promise<void> {
  const { actor, board } = await requireBoardAccess(boardId);
  if (ownerAppUserId) {
    const member = await isWorkBoardMember(boardId, ownerAppUserId);
    if (!member) {
      throw new Error("Owner must have access to the project");
    }
  }
  const previous = await fetchWorkIssueNotifyMeta(boardId, issueId);
  const previousOwnerId = previous?.owner_app_user_id ?? null;
  const ok = await updateWorkIssueOwner(boardId, issueId, ownerAppUserId);
  if (!ok) throw new Error("Issue not found");
  await logEvent(
    issueId,
    actor.id,
    "owner",
    ownerAppUserId
      ? `changed the owner to ${ownerName}`
      : "cleared the owner"
  );
  if (
    ownerAppUserId &&
    ownerAppUserId !== actor.id &&
    ownerAppUserId !== previousOwnerId
  ) {
    await notifyWorkIssuePersonChange({
      boardId,
      issueId,
      recipientAppUserId: ownerAppUserId,
      actorId: actor.id,
      kind: USER_NOTIFICATION_KIND.WORK_ISSUE_OWNER_SET,
      customerId: board.customer_id,
      boardTitle: board.title,
      boardPrefix: board.prefix,
    });
  }
}

export async function setWorkIssueTextField(
  boardId: string,
  issueId: string,
  field: "description" | "current_state" | "next_step" | "out_of_scope",
  value: string
): Promise<void> {
  const { actor, board } = await requireBoardAccess(boardId);
  const previousDescription =
    field === "description"
      ? await fetchWorkIssueDescription(boardId, issueId)
      : null;
  const ok = await updateWorkIssueField(boardId, issueId, field, value);
  if (!ok) throw new Error("Issue not found");
  const labels = {
    description: "description",
    current_state: "current state",
    next_step: "next step",
    out_of_scope: "out of scope",
  } as const;
  await logEvent(
    issueId,
    actor.id,
    field,
    `updated the ${labels[field]}`
  );
  if (field === "description") {
    await notifyWorkIssueMentions({
      boardId,
      issueId,
      body: value,
      previousBody: previousDescription ?? "",
      actorId: actor.id,
      memberIds: board.member_ids,
      customerId: board.customer_id,
      boardTitle: board.title,
      boardPrefix: board.prefix,
    });
  }
}

export async function setWorkIssueEstimate(
  boardId: string,
  issueId: string,
  rawHours: string
): Promise<void> {
  const { actor, board } = await requireBoardAccess(boardId);
  if (
    !canSeeWorkTime(actor, board.work_show_time_to_customer_users)
  ) {
    throw new Error("Unauthorized");
  }
  const parsed = parseWorkEstimateHours(rawHours);
  if (!parsed.ok) throw new Error("Estimate must be a number of hours");
  const ok = await updateWorkIssueEstimate(boardId, issueId, parsed.value);
  if (!ok) throw new Error("Issue not found");
  await logEvent(
    issueId,
    actor.id,
    "estimate",
    parsed.value == null
      ? "cleared the estimate"
      : `set the estimate to ${formatWorkHours(parsed.value)}`
  );
}

export async function setWorkIssuePriority(
  boardId: string,
  issueId: string,
  priority: WorkIssuePriority | null
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId);
  const ok = await updateWorkIssuePriority(boardId, issueId, priority);
  if (!ok) throw new Error("Issue not found");
  await logEvent(
    issueId,
    actor.id,
    "priority",
    priority == null ? "cleared the priority" : `set priority to ${priority}`
  );
}

export async function setWorkIssueType(
  boardId: string,
  issueId: string,
  issueType: WorkIssueType
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId);
  const next = issueType === "bug" ? "bug" : "issue";
  const ok = await updateWorkIssueType(boardId, issueId, next);
  if (!ok) throw new Error("Issue not found");
  await logEvent(
    issueId,
    actor.id,
    "type",
    `changed the type to ${next === "bug" ? "Bug" : "Issue"}`
  );
}

export async function setWorkIssueComponent(
  boardId: string,
  issueId: string,
  componentId: string | null,
  componentName: string
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId);
  const ok = await updateWorkIssueComponent(boardId, issueId, componentId);
  if (!ok) throw new Error("Issue not found");
  await logEvent(
    issueId,
    actor.id,
    "component",
    componentId
      ? `changed the component to “${componentName}”`
      : "cleared the component"
  );
}

export async function assignOrCreateIssueComponent(
  boardId: string,
  issueId: string,
  name: string
): Promise<WorkComponent> {
  const { actor } = await requireBoardAccess(boardId);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Component name is required");
  const component = await findOrCreateBoardComponent(boardId, trimmed);
  const ok = await updateWorkIssueComponent(boardId, issueId, component.id);
  if (!ok) throw new Error("Issue not found");
  await logEvent(
    issueId,
    actor.id,
    "component",
    `changed the component to “${component.name}”`
  );
  return component;
}

export async function createBoardComponent(
  boardId: string,
  name: string
): Promise<WorkComponent> {
  await requireBoardAccess(boardId);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Component name is required");
  return findOrCreateBoardComponent(boardId, trimmed);
}

export async function renameBoardComponentName(
  boardId: string,
  componentId: string,
  name: string
): Promise<WorkComponent> {
  await requireBoardAccess(boardId);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Component name is required");
  const clash = await findBoardComponentByName(boardId, trimmed);
  if (clash && clash.id !== componentId) {
    throw new Error("A component with that name already exists");
  }
  const row = await renameBoardComponent(boardId, componentId, trimmed);
  if (!row) throw new Error("Component not found");
  return row;
}

export async function removeBoardComponent(
  boardId: string,
  componentId: string
): Promise<{ clearedIssueCount: number }> {
  await requireBoardAccess(boardId);
  const clearedIssueCount = await countIssuesUsingComponent(
    boardId,
    componentId
  );
  const ok = await deleteBoardComponent(boardId, componentId);
  if (!ok) throw new Error("Component not found");
  return { clearedIssueCount };
}

export async function addIssueRequirement(
  boardId: string,
  issueId: string,
  body: string,
  kind: WorkRequirementKind = "acceptance"
): Promise<{ id: string; sortOrder: number }> {
  const { actor } = await requireBoardAccess(boardId);
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Requirement text is required");
  const created = await insertWorkIssueRequirement({
    issueId,
    body: trimmed,
    kind,
  });
  await logEvent(
    issueId,
    actor.id,
    "requirement",
    kind === "dod"
      ? "added a definition-of-done item"
      : "added a requirement"
  );
  return created;
}

export async function setIssueRequirementBody(
  boardId: string,
  issueId: string,
  requirementId: string,
  body: string
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId);
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Requirement text is required");
  const ok = await updateWorkIssueRequirementBody(
    issueId,
    requirementId,
    trimmed
  );
  if (!ok) throw new Error("Requirement not found");
  await logEvent(issueId, actor.id, "requirement", "updated a requirement");
}

export async function setIssueRequirementDone(
  boardId: string,
  issueId: string,
  requirementId: string,
  isDone: boolean,
  authenticatedActor?: WorkActor
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId, authenticatedActor);

  if (typeof isDone !== "boolean") throw new WorkInputError("isDone must be a boolean.");

  const ok = await updateWorkIssueRequirementDone(
    boardId,
    issueId,
    requirementId,
    isDone,
    actor.id
  );

  if (!ok) throw new WorkInputError("Requirement not found on this issue in this project.");
}

export async function removeIssueRequirement(
  boardId: string,
  issueId: string,
  requirementId: string
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId);
  const ok = await deleteWorkIssueRequirement(issueId, requirementId);
  if (!ok) throw new Error("Requirement not found");
  await logEvent(issueId, actor.id, "requirement", "removed a requirement");
}

export async function addIssuePreDeployAction(
  boardId: string,
  issueId: string,
  body: string
): Promise<{ id: string; sortOrder: number }> {
  const { actor } = await requireBoardAccess(boardId);
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Pre-deploy action text is required");
  const created = await insertWorkIssuePreDeployAction({
    issueId,
    body: trimmed,
  });
  await logEvent(
    issueId,
    actor.id,
    "pre_deploy",
    "added a pre-deploy action"
  );
  return created;
}

export async function setIssuePreDeployActionBody(
  boardId: string,
  issueId: string,
  actionId: string,
  body: string
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId);
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Pre-deploy action text is required");
  const ok = await updateWorkIssuePreDeployActionBody(
    issueId,
    actionId,
    trimmed
  );
  if (!ok) throw new Error("Pre-deploy action not found");
  await logEvent(
    issueId,
    actor.id,
    "pre_deploy",
    "updated a pre-deploy action"
  );
}

export async function setIssuePreDeployActionDone(
  boardId: string,
  issueId: string,
  actionId: string,
  isDone: boolean
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId);
  const ok = await updateWorkIssuePreDeployActionDone(
    issueId,
    actionId,
    isDone
  );
  if (!ok) throw new Error("Pre-deploy action not found");
  await logEvent(
    issueId,
    actor.id,
    "pre_deploy",
    isDone ? "checked a pre-deploy action" : "unchecked a pre-deploy action"
  );
}

export async function removeIssuePreDeployAction(
  boardId: string,
  issueId: string,
  actionId: string
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId);
  const ok = await deleteWorkIssuePreDeployAction(issueId, actionId);
  if (!ok) throw new Error("Pre-deploy action not found");
  await logEvent(
    issueId,
    actor.id,
    "pre_deploy",
    "removed a pre-deploy action"
  );
}

function normalizeReferenceUrl(raw: string): string {
  const trimmed = raw.trim();

  if (!trimmed || trimmed.length > 4096) throw new WorkInputError("URL is required and must be at most 4096 characters.");

  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new WorkInputError("Enter a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WorkInputError("URL must start with http:// or https://.");
  }

  return url.toString();
}

export async function addIssueReference(
  boardId: string,
  issueId: string,
  url: string,
  label: string,
  authenticatedActor?: WorkActor
): Promise<{ id: string; sortOrder: number }> {
  const { actor } = await requireBoardAccess(boardId, authenticatedActor);
  const normalized = normalizeReferenceUrl(url);

  if (label.trim().length > 1000) throw new WorkInputError("Reference label must be at most 1000 characters.");

  const created = await insertWorkIssueReference({
    boardId,
    issueId,
    url: normalized,
    label: label.trim(),
    actorAppUserId: actor.id,
  });

  if (!created) throw new WorkInputError("Issue not found in this project.");

  return created;
}

export async function removeIssueReference(
  boardId: string,
  issueId: string,
  referenceId: string
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId);
  const ok = await deleteWorkIssueReference(issueId, referenceId);
  if (!ok) throw new Error("Reference not found");
  await logEvent(issueId, actor.id, "reference", "removed a reference");
}

export async function addIssueAssignee(
  boardId: string,
  issueId: string,
  appUserId: string,
  personName: string
): Promise<void> {
  const { actor, board } = await requireBoardAccess(boardId);
  const member = await isWorkBoardMember(boardId, appUserId);
  if (!member) {
    throw new Error("Assignee must have access to the project");
  }
  const inserted = await addWorkIssueAssignee(issueId, appUserId);
  await logEvent(issueId, actor.id, "assignees", `assigned ${personName}`);
  if (inserted && appUserId !== actor.id) {
    await notifyWorkIssuePersonChange({
      boardId,
      issueId,
      recipientAppUserId: appUserId,
      actorId: actor.id,
      kind: USER_NOTIFICATION_KIND.WORK_ISSUE_ASSIGNED,
      customerId: board.customer_id,
      boardTitle: board.title,
      boardPrefix: board.prefix,
    });
  }
}

export async function removeIssueAssignee(
  boardId: string,
  issueId: string,
  appUserId: string,
  personName: string
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId);
  await removeWorkIssueAssignee(issueId, appUserId);
  await logEvent(issueId, actor.id, "assignees", `unassigned ${personName}`);
}

export async function addIssueLabel(
  boardId: string,
  issueId: string,
  name: string
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Label is required");
  const label = await findOrCreateBoardLabel(boardId, trimmed);
  await linkWorkIssueLabel(issueId, label.id);
  await logEvent(issueId, actor.id, "labels", `added label “${label.name}”`);
}

export async function removeIssueLabel(
  boardId: string,
  issueId: string,
  labelId: string,
  labelName: string
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId);
  await unlinkWorkIssueLabel(issueId, labelId);
  await logEvent(issueId, actor.id, "labels", `removed label “${labelName}”`);
}

export async function addIssueComment(
  boardId: string,
  issueId: string,
  body: string,
  authenticatedActor?: WorkActor
): Promise<string> {
  const visible = await requireBoardAccess(boardId, authenticatedActor);
  const { actor, board } = visible;
  const trimmed = body.trim();
  if (!trimmed) throw new WorkInputError("Comment is required.");

  const commentId = await insertWorkIssueComment({
    boardId,
    issueId,
    authorAppUserId: actor.id,
    body: trimmed,
  });
  if (!commentId) throw new WorkInputError("Issue not found in this project.");

  await notifyWorkIssueMentions({
    boardId,
    issueId,
    body: trimmed,
    actorId: actor.id,
    memberIds: board.member_ids,
    customerId: board.customer_id,
    boardTitle: board.title,
    boardPrefix: board.prefix,
  });

  return commentId;
}

export async function updateIssueComment(
  boardId: string,
  issueId: string,
  commentId: string,
  body: string
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId);
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Comment is required");
  const ok = await updateWorkIssueComment({
    commentId,
    issueId,
    authorAppUserId: actor.id,
    body: trimmed,
  });
  if (!ok) throw new Error("Comment not found");
  await logEvent(issueId, actor.id, "comment", "edited a comment");
}

export async function deleteIssueComment(
  boardId: string,
  issueId: string,
  commentId: string
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId);
  const ok = await deleteWorkIssueComment({
    commentId,
    issueId,
    authorAppUserId: actor.id,
  });
  if (!ok) throw new Error("Comment not found");
  await logEvent(issueId, actor.id, "comment", "deleted a comment");
}

export async function setWorkIssueStatus(
  boardId: string,
  issueId: string,
  status: WorkIssueStatus,
  sortOrder?: number,
  authenticatedActor?: WorkActor
): Promise<number> {
  const { actor } = await requireBoardAccess(boardId, authenticatedActor);

  if (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 2147483646)) {
    throw new WorkInputError("Sort order must be a non-negative integer below 2147483647.");
  }

  const statuses = await assertBoardStatus(boardId, status);
  const nextOrder = await moveWorkIssue({
    boardId,
    issueId,
    status,
    sortOrder,
    actorAppUserId: actor.id,
    statusName: statuses.find((row) => row.id === status)!.name,
  });

  if (nextOrder === null) throw new WorkInputError("Issue not found in this project.");

  return nextOrder;
}

export async function reorderWorkIssues(
  boardId: string,
  status: WorkIssueStatus,
  issueIds: string[]
): Promise<void> {
  await requireBoardAccess(boardId);
  await assertBoardStatus(boardId, status);
  await reorderWorkIssuesInStatus({ boardId, status, issueIds });
}

async function assertBoardStatus(boardId: string, statusId: string) {
  const statuses = await fetchWorkBoardStatuses(boardId);
  if (!statuses.some((status) => status.id === statusId)) {
    throw new WorkInputError("Column not found in this project.");
  }
  return statuses;
}

export async function uploadIssueFile(
  boardId: string,
  issueId: string,
  file: { name: string; type: string; size: number; bytes: Uint8Array }
): Promise<string> {
  const { actor } = await requireBoardAccess(boardId);
  const fileName = file.name.trim() || "file";
  if (file.size <= 0) throw new Error("File is empty");
  if (file.size > WORK_FILE_MAX_BYTES) {
    throw new Error("File must be 8 MB or smaller");
  }
  const fileId = await insertWorkIssueFile({
    issueId,
    fileName,
    mimeType: file.type || "application/octet-stream",
    byteSize: file.size,
    content: Buffer.from(file.bytes),
    uploadedByAppUserId: actor.id,
  });
  await logEvent(issueId, actor.id, "file", `uploaded ${fileName}`);
  return fileId;
}

export async function removeIssueFile(
  boardId: string,
  issueId: string,
  fileId: string
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId);
  const fileName = await deleteWorkIssueFile(issueId, fileId);
  if (!fileName) throw new Error("File not found");
  await logEvent(issueId, actor.id, "file", `removed ${fileName}`);
}

async function workIssueNotifyActorLabel(
  boardId: string,
  actorId: string
): Promise<string> {
  const members = await fetchWorkBoardMembers(boardId);
  const user = members.find((member) => member.id === actorId);
  return user?.name?.trim() || user?.email || "Someone";
}

async function notifyWorkIssuePersonChange(input: {
  boardId: string;
  issueId: string;
  recipientAppUserId: string;
  actorId: string;
  kind:
    | typeof USER_NOTIFICATION_KIND.WORK_ISSUE_OWNER_SET
    | typeof USER_NOTIFICATION_KIND.WORK_ISSUE_ASSIGNED;
  customerId: string;
  boardTitle: string;
  boardPrefix: string;
}): Promise<void> {
  try {
    const [issue, actorName] = await Promise.all([
      fetchWorkIssueNotifyMeta(input.boardId, input.issueId),
      workIssueNotifyActorLabel(input.boardId, input.actorId),
    ]);
    if (!issue) return;
    await insertUserNotification(input.recipientAppUserId, input.kind, {
      customerId: input.customerId,
      boardId: input.boardId,
      boardTitle: input.boardTitle,
      issueId: input.issueId,
      issueKey: workIssueKey(input.boardPrefix, issue.number),
      issueTitle: issue.title,
      actorName,
    });
  } catch (error) {
    console.warn("[work] owner/assignee notification failed", error);
  }
}

async function notifyWorkIssueMentions(input: {
  boardId: string;
  issueId: string;
  body: string;
  /** When set, only newly added mention tokens are notified. */
  previousBody?: string;
  actorId: string;
  memberIds: readonly string[];
  customerId: string;
  boardTitle: string;
  boardPrefix: string;
}): Promise<void> {
  const previouslyMentioned = new Set(
    extractMentionedIds(input.previousBody ?? "")
  );
  const mentioned = extractMentionedIds(input.body).filter(
    (id) =>
      id !== input.actorId &&
      input.memberIds.includes(id) &&
      !previouslyMentioned.has(id)
  );
  if (mentioned.length === 0) return;
  try {
    const [issue, mentionerName] = await Promise.all([
      fetchWorkIssueNotifyMeta(input.boardId, input.issueId),
      workIssueNotifyActorLabel(input.boardId, input.actorId),
    ]);
    if (!issue) return;
    const payload = {
      customerId: input.customerId,
      boardId: input.boardId,
      boardTitle: input.boardTitle,
      issueId: input.issueId,
      issueKey: workIssueKey(input.boardPrefix, issue.number),
      issueTitle: issue.title,
      mentionerName,
      commentPreview: commentPreview(input.body),
    };
    await Promise.all(
      mentioned.map((appUserId) =>
        insertUserNotification(
          appUserId,
          USER_NOTIFICATION_KIND.WORK_ISSUE_MENTIONED,
          payload
        )
      )
    );
  } catch (error) {
    console.warn("[work] mention notification failed", error);
  }
}

export async function addIssueRelation(
  boardId: string,
  issueId: string,
  otherIssueId: string,
  role: WorkRelationRole,
  authenticatedActor?: WorkActor
): Promise<string> {
  const { actor, board } = await requireBoardAccess(boardId, authenticatedActor);

  if (issueId === otherIssueId) throw new WorkInputError("An issue cannot relate to itself.");
  if (!WORK_RELATION_ROLES.includes(role)) throw new WorkInputError("Invalid relation role.");

  const edge = relationEdgeFromRole(issueId, otherIssueId, role);

  try {
    return await withCloudSqlTransaction("work-add-relation", async (client) => {
      // Serialize graph validation with relation creation to prevent concurrent cycles.
      await client.query("SELECT id FROM work_projects WHERE id = $1 FOR UPDATE", [boardId]);
      const { rows: issues } = await client.query<{ id: string; number: number }>(
        "SELECT id, number FROM work_issues WHERE project_id = $1 AND id = ANY($2::uuid[]) FOR KEY SHARE",
        [boardId, [issueId, otherIssueId]]
      );

      if (issues.length !== 2) throw new WorkInputError("Both issues must belong to this project.");

      const rows = (await fetchWorkIssueRelations(boardId, client)).map((row) => ({
        id: row.id, boardId: row.project_id, fromIssueId: row.from_issue_id, toIssueId: row.to_issue_id, kind: row.kind,
      }));

      if (edge.kind === "parent") {
        if (childAlreadyHasParent(rows, edge.toIssueId)) throw new WorkInputError("That issue already has a parent.");
        if (wouldCreateParentCycle(rows, edge.fromIssueId, edge.toIssueId)) throw new WorkInputError("That parent would create a cycle.");
      }

      if (edge.kind === "blocks" && wouldCreateBlocksCycle(rows, edge.fromIssueId, edge.toIssueId)) {
        throw new WorkInputError("That block would create a cycle.");
      }

      const relationId = await insertWorkIssueRelation({ boardId, ...edge }, client);
      const other = issues.find((issue) => issue.id === otherIssueId)!;
      await insertWorkIssueEvent({
        issueId, actorAppUserId: actor.id, kind: "relation",
        summary: relationEventSummary(role, workIssueKey(board.prefix, other.number)),
      }, client);

      return relationId;
    });
  } catch (error) {
    const maybePg = error as { code?: string };

    if (maybePg.code === "23505") {
      throw new WorkInputError("That relation already exists.");
    }

    throw error;
  }
}

export async function removeIssueRelation(
  boardId: string,
  issueId: string,
  relationId: string
): Promise<void> {
  const { actor, board } = await requireBoardAccess(boardId);
  const removed = await deleteWorkIssueRelation(boardId, relationId);
  if (!removed) throw new Error("Relation not found");
  const otherId =
    removed.fromIssueId === issueId ? removed.toIssueId : removed.fromIssueId;
  const other = await fetchWorkIssueNotifyMeta(boardId, otherId);
  const otherKey = other
    ? workIssueKey(board.prefix, other.number)
    : "another issue";
  await logEvent(
    issueId,
    actor.id,
    "relation",
    `removed a relation to ${otherKey}`
  );
}
