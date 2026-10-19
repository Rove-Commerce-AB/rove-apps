import "server-only";

import { withCloudSqlTransaction } from "@/lib/cloudSqlPool";
import { pgDateToDateOnly, pgDateToDateOnlyOrNull } from "@/lib/pgDateOnly";
import { canSeeWorkTime, type WorkActor } from "@/lib/workAccess";
import { requireVisibleWorkBoard } from "@/lib/workBoards";
import { WorkInputError } from "@/lib/workErrors";
import { workPersonFromUser } from "@/lib/workIssueKey";
import { fetchWorkBoardMembers, fetchWorkIssueFileForDownload, insertWorkIssueEvent, type WorkUserRow } from "@/lib/workIssuesQueries";
import { fetchWorkSprintsForBoard, mapWorkSprintRow, type WorkSprintRow } from "@/lib/workSprintsQueries";
import { WORK_ESTIMATE_HOURS_MAX } from "@/lib/workTime";
import { WORK_FILE_MAX_BYTES } from "@/lib/workTypes";

async function requireProject(actor: WorkActor, projectId: string) {
  const visible = await requireVisibleWorkBoard(projectId, actor);

  if (!visible) throw new WorkInputError("Project not found or access denied.");

  return visible;
}

export async function readWorkIssueFile(actor: WorkActor, projectId: string, issueId: string, fileId: string) {
  await requireProject(actor, projectId);
  const file = await fetchWorkIssueFileForDownload(fileId);

  if (!file || file.project_id !== projectId || file.issue_id !== issueId) {
    throw new WorkInputError("File not found on this issue in this project.");
  }

  if (file.content.length > WORK_FILE_MAX_BYTES) throw new WorkInputError("File exceeds the 8 MiB attachment limit.");

  return file;
}

export async function listWorkProjectMembers(actor: WorkActor, projectId: string) {
  await requireProject(actor, projectId);

  return { projectId, members: (await fetchWorkBoardMembers(projectId)).map(workPersonFromUser) };
}

export type WorkIssueAssignmentChanges = { ownerId?: string | null; assigneeIds?: string[] };

export async function setWorkIssueAssignments(
  actor: WorkActor, projectId: string, issueId: string, changes: WorkIssueAssignmentChanges
) {
  await requireProject(actor, projectId);

  if (changes.ownerId === undefined && changes.assigneeIds === undefined) {
    throw new WorkInputError("Provide ownerId or assigneeIds.");
  }

  if (changes.assigneeIds && changes.assigneeIds.length > 100) throw new WorkInputError("At most 100 assignees are allowed.");

  return withCloudSqlTransaction("work-set-assignments", async (client) => {
    const { rows: issues } = await client.query<{ owner_app_user_id: string | null }>(
      "SELECT owner_app_user_id FROM work_issues WHERE project_id = $1 AND id = $2 FOR UPDATE",
      [projectId, issueId]
    );
    const issue = issues[0];

    if (!issue) throw new WorkInputError("Issue not found in this project.");

    const ownerId = changes.ownerId === undefined ? issue.owner_app_user_id : changes.ownerId;
    const { rows: previous } = await client.query<{ app_user_id: string }>(
      "SELECT app_user_id FROM work_issue_assignees WHERE issue_id = $1 ORDER BY app_user_id", [issueId]
    );
    const assigneeIds = changes.assigneeIds === undefined
      ? previous.map((row) => row.app_user_id)
      : [...new Set(changes.assigneeIds)].sort();
    const requestedIds = [...new Set([
      ...(changes.assigneeIds ?? []), ...(changes.ownerId ? [changes.ownerId] : []),
    ])];
    const { rows: members } = await client.query<{ app_user_id: string }>(
      "SELECT app_user_id FROM work_project_members WHERE project_id = $1 AND app_user_id = ANY($2::uuid[]) FOR SHARE",
      [projectId, requestedIds]
    );

    if (members.length !== requestedIds.length) throw new WorkInputError("Every owner and assignee must be a project member.");

    const ownerChanged = ownerId !== issue.owner_app_user_id;
    const assigneesChanged = JSON.stringify(assigneeIds) !== JSON.stringify(previous.map((row) => row.app_user_id));

    if (ownerChanged) {
      await client.query("UPDATE work_issues SET owner_app_user_id = $2 WHERE id = $1", [issueId, ownerId]);
    }

    if (assigneesChanged) {
      await client.query("DELETE FROM work_issue_assignees WHERE issue_id = $1", [issueId]);
      await client.query(
        "INSERT INTO work_issue_assignees (issue_id, app_user_id) SELECT $1, id FROM unnest($2::uuid[]) AS id",
        [issueId, assigneeIds]
      );
    }

    const { rows: people } = await client.query<WorkUserRow>(
      "SELECT id, name, email FROM app_users WHERE id = ANY($1::uuid[])", [[...assigneeIds, ...(ownerId ? [ownerId] : [])]]
    );
    const peopleById = new Map(people.map((row) => [row.id, workPersonFromUser(row)]));
    const owner = ownerId ? peopleById.get(ownerId) ?? null : null;
    const assignees = assigneeIds.map((id) => peopleById.get(id)!);

    if (ownerChanged) {
      await insertWorkIssueEvent({
        issueId, actorAppUserId: actor.id, kind: "owner", summary: owner ? `set owner to ${owner.name}` : "removed the owner",
      }, client);
    }

    if (assigneesChanged) {
      await insertWorkIssueEvent({
        issueId, actorAppUserId: actor.id, kind: "assignee",
        summary: assignees.length ? `set assignees to ${assignees.map((person) => person.name).join(", ")}` : "removed all assignees",
      }, client);
    }

    return { projectId, issueId, owner, assignees };
  });
}

export async function listWorkProjectSprints(actor: WorkActor, projectId: string) {
  const { board } = await requireProject(actor, projectId);
  const showTime = canSeeWorkTime(actor, board.work_show_time_to_customer_users);
  const sprints = (await fetchWorkSprintsForBoard(projectId)).map((row) => ({
    ...mapWorkSprintRow(row), capacityHours: showTime && row.capacity_hours != null ? Number(row.capacity_hours) : null,
  }));

  return { projectId, sprints };
}

export type WorkIssueScheduleChanges = {
  estimateHours?: number | null;
  sprintId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
};

function validateScheduleDate(value: string | null | undefined, label: string) {
  if (value == null) return;

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new WorkInputError(`${label} must be a valid YYYY-MM-DD date.`);
  }
}

export async function setWorkIssuePlanning(
  actor: WorkActor, projectId: string, issueId: string, changes: WorkIssueScheduleChanges
) {
  const { board } = await requireProject(actor, projectId);
  const showTime = canSeeWorkTime(actor, board.work_show_time_to_customer_users);

  if (Object.values(changes).every((value) => value === undefined)) throw new WorkInputError("Provide at least one scheduling field.");
  if (changes.estimateHours !== undefined && !showTime) throw new WorkInputError("Time is not shared with customer users on this account.");

  if (changes.estimateHours != null &&
      (!Number.isFinite(changes.estimateHours) || changes.estimateHours < 0 || changes.estimateHours > WORK_ESTIMATE_HOURS_MAX)) {
    throw new WorkInputError(`Estimate must be between 0 and ${WORK_ESTIMATE_HOURS_MAX} hours.`);
  }

  validateScheduleDate(changes.startDate, "Start date");
  validateScheduleDate(changes.dueDate, "Due date");

  return withCloudSqlTransaction("work-set-planning", async (client) => {
    let sprint: WorkSprintRow | undefined;

    if (changes.sprintId) {
      const { rows } = await client.query<WorkSprintRow>(
        "SELECT * FROM work_sprints WHERE project_id = $1 AND id = $2 FOR SHARE", [projectId, changes.sprintId]
      );
      sprint = rows[0];

      if (!sprint) throw new WorkInputError("Sprint not found in this project.");
    }

    const { rows } = await client.query<{
      estimate_hours: string | null; sprint_id: string | null; start_date: Date | string | null; due_date: Date | string | null;
    }>(
      "SELECT estimate_hours, sprint_id, start_date, due_date FROM work_issues WHERE project_id = $1 AND id = $2 FOR UPDATE",
      [projectId, issueId]
    );
    const issue = rows[0];

    if (!issue) throw new WorkInputError("Issue not found in this project.");

    const oldEstimate = issue.estimate_hours == null ? null : Number(issue.estimate_hours);
    const oldStart = pgDateToDateOnlyOrNull(issue.start_date);
    const oldDue = pgDateToDateOnlyOrNull(issue.due_date);
    const estimateHours = changes.estimateHours === undefined ? oldEstimate
      : changes.estimateHours === null ? null : Math.round(changes.estimateHours * 100) / 100;
    const sprintId = changes.sprintId === undefined ? issue.sprint_id : changes.sprintId;
    let startDate = changes.startDate === undefined ? oldStart : changes.startDate;
    let dueDate = changes.dueDate === undefined ? oldDue : changes.dueDate;

    if (sprint && sprintId !== issue.sprint_id) {
      const startsOn = pgDateToDateOnly(sprint.starts_on);
      const endsOn = pgDateToDateOnly(sprint.ends_on);
      const today = new Date().toISOString().slice(0, 10);

      if (changes.startDate === undefined && !startDate) startDate = today >= startsOn && today <= endsOn ? today : startsOn;
      if (changes.dueDate === undefined && !dueDate) dueDate = endsOn;
    }

    if (startDate && dueDate && dueDate < startDate) throw new WorkInputError("Due date must be on or after start date.");

    const changed = estimateHours !== oldEstimate || sprintId !== issue.sprint_id || startDate !== oldStart || dueDate !== oldDue;

    if (changed) {
      await client.query(
        "UPDATE work_issues SET estimate_hours = $2, sprint_id = $3, start_date = $4::date, due_date = $5::date WHERE id = $1",
        [issueId, estimateHours, sprintId, startDate, dueDate]
      );
      const parts: string[] = [];

      if (estimateHours !== oldEstimate) parts.push(estimateHours == null ? "cleared estimate" : `set estimate to ${estimateHours}h`);
      if (sprintId !== issue.sprint_id) parts.push(sprint ? `moved to sprint ${sprint.number}` : "removed from sprint");
      if (startDate !== oldStart || dueDate !== oldDue) parts.push(`set dates to ${startDate ?? "unset"} / ${dueDate ?? "unset"}`);

      await insertWorkIssueEvent({ issueId, actorAppUserId: actor.id, kind: "schedule", summary: parts.join(", ") }, client);
    }

    return { projectId, issueId, estimateHours: showTime ? estimateHours : null, sprintId, startDate, dueDate };
  });
}
