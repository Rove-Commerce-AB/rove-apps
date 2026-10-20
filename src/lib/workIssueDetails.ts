import "server-only";

import {
  canSeeWorkEstimates,
  canSeeWorkReportedTime,
  type WorkActor,
} from "@/lib/workAccess";
import { requireVisibleWorkBoard } from "@/lib/workBoards";
import { fetchWorkBoardStatuses } from "@/lib/workBoardsQueries";
import { WorkInputError } from "@/lib/workErrors";
import { workIssueKey, workPersonFromUser } from "@/lib/workIssueKey";
import { emptyWorkIssueRelations, groupRelationsForIssues } from "@/lib/workIssueRelations";
import { fetchWorkIssueCommentPage, fetchWorkIssueRelationDetails, type WorkCommentPosition } from "@/lib/workIssueDetailsQueries";
import {
  fetchIssueAssignees,
  fetchIssueFiles,
  fetchIssueLabels,
  fetchIssuePreDeployActions,
  fetchIssueReferences,
  fetchIssueRequirements,
  fetchLoggedHoursByIssueIds,
  fetchWorkIssuesForBoard,
  fetchWorkIssueStatus,
} from "@/lib/workIssuesQueries";
import { pgDateToDateOnlyOrNull } from "@/lib/pgDateOnly";
import type { WorkIssueCommentsInput, WorkIssueCommentsPage, WorkIssueDetails, WorkIssueLookup } from "@/lib/workTypes";

export async function getWorkIssue(actor: WorkActor, input: WorkIssueLookup): Promise<{ issue: WorkIssueDetails }> {
  if ((input.issueId !== undefined) === (input.issueKey !== undefined)) {
    throw new WorkInputError("Provide exactly one of issueId or issueKey.");
  }

  const visible = await requireVisibleWorkBoard(input.projectId, actor);

  if (!visible) throw new WorkInputError("Project not found or access denied.");

  const { board } = visible;
  let selector: { id: string } | { number: number };

  if (input.issueId !== undefined) {
    selector = { id: input.issueId };
  } else {
    const match = /^([A-Z][A-Z0-9]{1,7})-([1-9][0-9]{0,9})$/.exec(input.issueKey!.trim().toUpperCase());

    if (!match || Number(match[2]) > 2147483647) throw new WorkInputError("Use an issue key such as WORK-123.");
    if (match[1] !== board.prefix.toUpperCase()) throw new WorkInputError("Issue not found in this project.");

    selector = { number: Number(match[2]) };
  }

  const [rows, columns] = await Promise.all([
    fetchWorkIssuesForBoard(board.id, selector),
    fetchWorkBoardStatuses(board.id),
  ]);
  const row = rows[0];
  const column = row && columns.find((item) => item.id === row.status);

  if (!row || !column) throw new WorkInputError("Issue not found in this project.");

  const issueIds = [row.id];
  const showEstimates = canSeeWorkEstimates(
    actor,
    board.work_show_estimates_to_customer_users
  );
  const showReportedTime = canSeeWorkReportedTime(
    actor,
    board.work_show_reported_time_to_customer_users
  );
  const [assignees, labels, files, requirements, preDeployActions, references, relations, hours] = await Promise.all([
    fetchIssueAssignees(issueIds),
    fetchIssueLabels(issueIds),
    fetchIssueFiles(issueIds),
    fetchIssueRequirements(issueIds),
    fetchIssuePreDeployActions(issueIds),
    fetchIssueReferences(issueIds),
    fetchWorkIssueRelationDetails(board.id, row.id),
    showReportedTime
      ? fetchLoggedHoursByIssueIds(issueIds)
      : Promise.resolve(new Map<string, number>()),
  ]);
  const key = workIssueKey(board.prefix, row.number);
  const refs = new Map([
    [row.id, { id: row.id, key, title: row.title, status: row.status, isDone: column.isDone }],
    ...relations.map((relation) => [relation.related_id, {
      id: relation.related_id,
      key: workIssueKey(board.prefix, relation.number),
      title: relation.title,
      status: relation.status,
      isDone: relation.is_done,
    }] as const),
  ]);
  const groupedRelations = groupRelationsForIssues(issueIds, relations.map((relation) => ({
    id: relation.id,
    boardId: board.id,
    fromIssueId: relation.from_issue_id,
    toIssueId: relation.to_issue_id,
    kind: relation.kind,
  })), refs);
  const checklistItem = (item: { id: string; body: string; is_done: boolean; sort_order: number }) => ({
    id: item.id, body: item.body, isDone: item.is_done, sortOrder: item.sort_order,
  });

  return {
    issue: {
      id: row.id,
      key,
      title: row.title,
      projectId: board.id,
      projectTitle: board.title,
      customerId: board.customer_id,
      customerName: board.customer_name,
      columnId: column.id,
      columnName: column.name,
      isDone: column.isDone,
      sortOrder: row.sort_order,
      issueType: row.issue_type,
      priority: row.priority,
      description: row.description,
      currentState: row.current_state,
      nextStep: row.next_step,
      outOfScope: row.out_of_scope,
      owner: row.owner_app_user_id
        ? workPersonFromUser({ id: row.owner_app_user_id, name: row.owner_name, email: row.owner_email ?? "" }) : null,
      reporter: row.created_by_app_user_id
        ? workPersonFromUser({ id: row.created_by_app_user_id, name: row.reporter_name, email: row.reporter_email ?? "" }) : null,
      assignees: assignees.map(workPersonFromUser),
      labels: labels.map(({ id, name }) => ({ id, name })),
      component: row.component_id && row.component_name ? { id: row.component_id, name: row.component_name } : null,
      files: files.map((file) => ({
        id: file.id, fileName: file.file_name, mimeType: file.mime_type, byteSize: file.byte_size, createdAt: file.created_at.toISOString(),
      })),
      requirements: requirements.filter((item) => item.kind === "acceptance").map(checklistItem),
      definitionOfDone: requirements.filter((item) => item.kind === "dod").map(checklistItem),
      preDeployActions: preDeployActions.map(checklistItem),
      references: references.map((reference) => ({ id: reference.id, url: reference.url, label: reference.label, sortOrder: reference.sort_order })),
      relations: groupedRelations.get(row.id) ?? emptyWorkIssueRelations(),
      showEstimates,
      showReportedTime,
      estimateHours:
        showEstimates && row.estimate_hours !== null
          ? Number(row.estimate_hours)
          : null,
      loggedHours: showReportedTime ? hours.get(row.id) ?? 0 : 0,
      sprintId: row.sprint_id,
      startDate: pgDateToDateOnlyOrNull(row.start_date),
      dueDate: pgDateToDateOnlyOrNull(row.due_date),
    },
  };
}

function decodeCommentCursor(raw: string, projectId: string, issueId: string): WorkCommentPosition {
  try {
    if (raw.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();

    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));

    if (typeof parsed !== "object" || parsed === null) throw new Error();

    const cursor = parsed as Record<string, unknown>;

    if (
      cursor.projectId !== projectId || cursor.issueId !== issueId ||
      typeof cursor.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id) ||
      typeof cursor.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.createdAt) ||
      new Date(cursor.createdAt).toISOString() !== `${cursor.createdAt.slice(0, 23)}Z`
    ) {
      throw new Error();
    }

    return { id: cursor.id, createdAt: cursor.createdAt };
  } catch {
    throw new WorkInputError("Invalid cursor. Use nextCursor from the same issue's comments.");
  }
}

export async function listWorkIssueComments(actor: WorkActor, input: WorkIssueCommentsInput): Promise<WorkIssueCommentsPage> {
  const limit = input.limit ?? 50;

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new WorkInputError("Limit must be between 1 and 100.");

  const after = input.cursor ? decodeCommentCursor(input.cursor, input.projectId, input.issueId) : undefined;
  const visible = await requireVisibleWorkBoard(input.projectId, actor);

  if (!visible) throw new WorkInputError("Project not found or access denied.");
  if (!await fetchWorkIssueStatus(input.projectId, input.issueId)) throw new WorkInputError("Issue not found in this project.");

  const rows = await fetchWorkIssueCommentPage({ ...input, limit, after });
  const page = rows.slice(0, limit);
  const last = page.at(-1);

  return {
    projectId: input.projectId,
    issueId: input.issueId,
    comments: page.map((comment) => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.created_at,
      author: workPersonFromUser({ id: comment.author_id, name: comment.author_name, email: comment.author_email }),
    })),
    // Preserve PostgreSQL microseconds so comments in the same millisecond paginate correctly.
    nextCursor: rows.length > limit && last
      ? Buffer.from(JSON.stringify({ projectId: input.projectId, issueId: input.issueId, id: last.id, createdAt: last.created_at })).toString("base64url")
      : null,
  };
}
