import "server-only";

import { requireVisibleWorkBoard } from "@/lib/workBoards";
import type { WorkActor } from "@/lib/workAccess";
import {
  applyDefaultSprintDates,
  closeWorkSprint,
  deleteWorkSprint as deleteWorkSprintQuery,
  fetchWorkSprintById,
  insertWorkSprint,
  mapWorkSprintRow,
  startWorkSprint as startWorkSprintQuery,
  updateWorkIssueSchedule,
  updateWorkIssueSprint,
  updateWorkSprint,
} from "@/lib/workSprintsQueries";
import { insertWorkIssueEvent } from "@/lib/workIssuesQueries";
import type { WorkSprint } from "@/lib/workTypes";

async function requireBoardAccess(boardId: string, authenticatedActor?: WorkActor) {
  const visible = await requireVisibleWorkBoard(boardId, authenticatedActor);
  if (!visible) throw new Error("Unauthorized");
  return visible;
}

function parseDateOnly(raw: string, label: string): string {
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    throw new Error(`${label} is not a valid date`);
  }
  return trimmed;
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function createWorkSprint(
  boardId: string,
  input: {
    title?: string;
    startsOn?: string;
    lengthDays?: number;
    as: "current" | "next";
    capacityHours?: number | null;
  }
): Promise<WorkSprint> {
  const { actor } = await requireBoardAccess(boardId);
  const today = new Date().toISOString().slice(0, 10);
  const startsOn = input.startsOn
    ? parseDateOnly(input.startsOn, "Start date")
    : today;
  const length = input.lengthDays && input.lengthDays > 0 ? input.lengthDays : 14;
  const endsOn = addDays(startsOn, length - 1);
  if (endsOn < startsOn) throw new Error("End date must be on or after start");
  const capacity =
    input.capacityHours === undefined
      ? null
      : input.capacityHours == null
        ? null
        : Number(input.capacityHours);
  if (capacity != null && (!Number.isFinite(capacity) || capacity < 0)) {
    throw new Error("Capacity must be a non-negative number of hours");
  }
  const row = await insertWorkSprint({
    boardId,
    title: (input.title ?? "").trim(),
    startsOn,
    endsOn,
    status: input.as,
    capacityHours: capacity,
  });
  void actor;
  return mapWorkSprintRow(row);
}

export async function editWorkSprint(
  boardId: string,
  sprintId: string,
  patch: {
    title?: string;
    startsOn?: string;
    endsOn?: string;
    capacityHours?: number | null;
  }
): Promise<WorkSprint> {
  await requireBoardAccess(boardId);
  const next = {
    title: patch.title !== undefined ? patch.title.trim() : undefined,
    startsOn:
      patch.startsOn !== undefined
        ? parseDateOnly(patch.startsOn, "Start date")
        : undefined,
    endsOn:
      patch.endsOn !== undefined
        ? parseDateOnly(patch.endsOn, "End date")
        : undefined,
    capacityHours: patch.capacityHours,
  };
  if (
    next.startsOn &&
    next.endsOn &&
    next.endsOn < next.startsOn
  ) {
    throw new Error("End date must be on or after start");
  }
  if (
    next.capacityHours != null &&
    (!Number.isFinite(next.capacityHours) || next.capacityHours < 0)
  ) {
    throw new Error("Capacity must be a non-negative number of hours");
  }
  const row = await updateWorkSprint(boardId, sprintId, next);
  if (!row) throw new Error("Sprint not found");
  return mapWorkSprintRow(row);
}

export async function completeWorkSprint(
  boardId: string,
  sprintId: string,
  unfinishedAction: "next" | "backlog" | "leave"
): Promise<void> {
  await requireBoardAccess(boardId);
  await closeWorkSprint(boardId, sprintId, unfinishedAction);
}

export async function startWorkSprint(
  boardId: string,
  sprintId: string
): Promise<WorkSprint> {
  await requireBoardAccess(boardId);
  const row = await startWorkSprintQuery(boardId, sprintId);
  return mapWorkSprintRow(row);
}

export async function deleteWorkSprint(
  boardId: string,
  sprintId: string
): Promise<void> {
  await requireBoardAccess(boardId);
  const ok = await deleteWorkSprintQuery(boardId, sprintId);
  if (!ok) throw new Error("Sprint not found");
}

export async function setWorkIssueSprint(
  boardId: string,
  issueId: string,
  sprintId: string | null,
  authenticatedActor?: WorkActor
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId, authenticatedActor);
  if (sprintId) {
    const sprint = await fetchWorkSprintById(sprintId);
    if (!sprint || sprint.project_id !== boardId) {
      throw new Error("Sprint not found");
    }
  }
  const ok = await updateWorkIssueSprint(boardId, issueId, sprintId);
  if (!ok) throw new Error("Issue not found");
  if (sprintId) {
    await applyDefaultSprintDates(boardId, issueId, sprintId);
  }
  await insertWorkIssueEvent({
    issueId,
    actorAppUserId: actor.id,
    kind: "sprint",
    summary: sprintId ? "moved to a sprint" : "removed from sprint",
  });
}

export async function setWorkIssueSchedule(
  boardId: string,
  issueId: string,
  startDate: string | null,
  dueDate: string | null
): Promise<void> {
  const { actor } = await requireBoardAccess(boardId);
  const start =
    startDate == null || startDate === ""
      ? null
      : parseDateOnly(startDate, "Start date");
  const due =
    dueDate == null || dueDate === ""
      ? null
      : parseDateOnly(dueDate, "Due date");
  if (start && due && due < start) {
    throw new Error("Due date must be on or after start date");
  }
  const ok = await updateWorkIssueSchedule(boardId, issueId, start, due);
  if (!ok) throw new Error("Issue not found");
  await insertWorkIssueEvent({
    issueId,
    actorAppUserId: actor.id,
    kind: "schedule",
    summary: "updated the schedule",
  });
}
