import "server-only";

import { getCurrentAppUser } from "@/lib/appUsers";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { getConsultantForCurrentUser } from "@/lib/consultants";
import { fetchConsultantByAppUserId } from "@/lib/consultantsQueries";
import type { McpUser } from "@/lib/mcpAuth";
import { pgDateToDateOnly } from "@/lib/pgDateOnly";
import { getBillingItemsForCustomerAndProject } from "@/lib/projectRates";
import {
  deleteWorkIssueTimeEntry,
  logHoursAgainstWorkIssue,
  updateWorkIssueTimeEntry,
} from "@/lib/timeReportEntries";
import { canLogWorkTime, canSeeWorkTime } from "@/lib/workAccess";
import { requireVisibleWorkBoard } from "@/lib/workBoards";
import { workIssueKey } from "@/lib/workIssueKey";
import type {
  WorkIssueTimeLogEntry,
  WorkIssueTimeLogState,
} from "@/lib/workIssueTimeLogTypes";

export type { WorkIssueTimeLogEntry, WorkIssueTimeLogState };

const emptyTimeLogState = (
  overrides: Partial<WorkIssueTimeLogState> = {}
): WorkIssueTimeLogState => ({
  canLog: false,
  cannotLogReason: null,
  currentConsultantId: null,
  roleOptions: [],
  defaultRoleId: null,
  entries: [],
  loggedHours: 0,
  ...overrides,
});

async function requireTimeLogBoard(boardId: string, mcpUser?: McpUser) {
  if (mcpUser && !mcpUser.appKeys.includes("work")) {
    return null;
  }

  return requireVisibleWorkBoard(boardId, mcpUser);
}

async function loadIssueOnBoard(boardId: string, issueId: string) {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    title: string;
    number: number;
    prefix: string;
    customer_id: string;
    planner_project_id: string | null;
  }>(
    `SELECT i.id, i.title, i.number, b.prefix, b.customer_id, b.planner_project_id
     FROM work_issues i
     JOIN work_projects b ON b.id = i.project_id
     WHERE i.id = $1 AND i.project_id = $2
     LIMIT 1`,
    [issueId, boardId]
  );
  return rows[0] ?? null;
}

export async function listTimeEntriesForWorkIssue(
  boardId: string,
  issueId: string,
  mcpUser?: McpUser
): Promise<WorkIssueTimeLogEntry[]> {
  const visible = await requireTimeLogBoard(boardId, mcpUser);

  if (!visible || !canSeeWorkTime(visible.actor, visible.board.work_show_time_to_customer_users)) return [];

  const issue = await loadIssueOnBoard(boardId, issueId);
  if (!issue) return [];

  const { rows } = await cloudSqlPool.query<{
    id: string;
    entry_date: Date | string;
    hours: string | number;
    internal_comment: string | null;
    consultant_id: string;
    consultant_name: string;
  }>(
    `SELECT e.id,
            e.entry_date,
            e.hours,
            e.internal_comment,
            e.consultant_id,
            c.name AS consultant_name
     FROM time_report_entry_lines l
     JOIN time_report_entries e
       ON e.entry_line_id = l.id
      AND e.consultant_id = l.consultant_id
      AND l.iso_year = EXTRACT(ISOYEAR FROM e.entry_date)::int
      AND l.iso_week = EXTRACT(WEEK FROM e.entry_date)::int
     JOIN consultants c ON c.id = e.consultant_id
     WHERE l.work_issue_id = $1
     ORDER BY e.entry_date DESC, c.name ASC, e.created_at DESC`,
    [issueId]
  );

  return rows.map((row) => ({
    id: row.id,
    date: pgDateToDateOnly(row.entry_date),
    hours: Number(row.hours ?? 0),
    note: row.internal_comment,
    consultantId: row.consultant_id,
    consultantName: row.consultant_name,
  }));
}

export async function getWorkIssueTimeLogState(
  boardId: string,
  issueId: string,
  mcpUser?: McpUser
): Promise<WorkIssueTimeLogState> {
  const visible = await requireTimeLogBoard(boardId, mcpUser);

  if (!visible) {
    return emptyTimeLogState({ cannotLogReason: "Unauthorized" });
  }

  const showTime = canSeeWorkTime(
    visible.actor,
    visible.board.work_show_time_to_customer_users
  );
  const allowLog = canLogWorkTime(visible.actor);

  const [appUser, consultant, issue, entries] = await Promise.all([
    mcpUser ?? getCurrentAppUser(),
    mcpUser ? fetchConsultantByAppUserId(mcpUser.id) : getConsultantForCurrentUser(),
    loadIssueOnBoard(boardId, issueId),
    showTime
      ? listTimeEntriesForWorkIssue(boardId, issueId, mcpUser)
      : Promise.resolve([] as WorkIssueTimeLogEntry[]),
  ]);

  const loggedHours = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const currentConsultantId = consultant?.id ?? null;

  if (!issue) {
    return emptyTimeLogState({
      cannotLogReason: "Issue not found",
      currentConsultantId,
      entries,
      loggedHours,
    });
  }

  if (!showTime) {
    return emptyTimeLogState({
      cannotLogReason: "Time is not shared with customer users on this account.",
      currentConsultantId,
    });
  }

  let roleOptions: WorkIssueTimeLogState["roleOptions"] = [];
  let defaultRoleId: string | null = null;
  if (issue.planner_project_id) {
    const [items, preferredRole] = await Promise.all([
      getBillingItemsForCustomerAndProject(
        issue.customer_id,
        issue.planner_project_id
      ),
      consultant?.id
        ? cloudSqlPool.query<{ role_id: string | null }>(
            `SELECT role_id FROM consultants WHERE id = $1 LIMIT 1`,
            [consultant.id]
          )
        : Promise.resolve({ rows: [] as { role_id: string | null }[] }),
    ]);
    roleOptions = items;
    const preferred = preferredRole.rows[0]?.role_id?.trim() || null;
    defaultRoleId =
      (preferred && roleOptions.some((r) => r.id === preferred)
        ? preferred
        : null) ??
      roleOptions[0]?.id ??
      null;
  }

  let cannotLogReason: string | null = null;
  if (!allowLog) {
    cannotLogReason = "Customer users cannot log time.";
  } else if (!mcpUser && !appUser?.appKeys.includes("time_report")) {
    cannotLogReason = "Time report access is required to log hours.";
  } else if (!consultant?.id) {
    cannotLogReason = "Link a consultant profile to log time.";
  } else if (!issue.planner_project_id) {
    cannotLogReason =
      "Link this Work project to a planner project in settings before logging time.";
  } else if (roleOptions.length === 0) {
    cannotLogReason =
      "No roles are configured for this project. Add a role or rate before logging time.";
  }

  return {
    canLog: cannotLogReason == null,
    cannotLogReason,
    currentConsultantId,
    roleOptions,
    defaultRoleId,
    entries,
    loggedHours,
  };
}

export async function logTimeOnWorkIssue(
  boardId: string,
  issueId: string,
  input: { hours: number; date: string; note?: string; roleId: string },
  mcpUser?: McpUser
): Promise<
  | { ok: true; loggedHours: number; entries: WorkIssueTimeLogEntry[] }
  | { ok: false; error: string }
> {
  const visible = await requireTimeLogBoard(boardId, mcpUser);

  if (!visible) return { ok: false, error: "Unauthorized" };

  if (!canLogWorkTime(visible.actor)) {
    return { ok: false, error: "Customer users cannot log time." };
  }

  const appUser = mcpUser ?? await getCurrentAppUser();

  if (!mcpUser && !appUser?.appKeys.includes("time_report")) {
    return { ok: false, error: "Time report access is required to log hours." };
  }

  const roleId = input.roleId.trim();
  if (!roleId) {
    return { ok: false, error: "Role is required." };
  }

  const issue = await loadIssueOnBoard(boardId, issueId);
  if (!issue) return { ok: false, error: "Issue not found" };
  if (!issue.planner_project_id) {
    return {
      ok: false,
      error:
        "Link this Work project to a planner project in settings before logging time.",
    };
  }

  const key = workIssueKey(issue.prefix, issue.number);
  const title = issue.title.trim();
  const lineDescription = title ? `${key} ${title}` : key;

  const result = await logHoursAgainstWorkIssue({
    customerId: issue.customer_id,
    plannerProjectId: issue.planner_project_id,
    workIssueId: issueId,
    date: input.date,
    hours: input.hours,
    note: input.note,
    lineDescription,
    roleId,
  }, mcpUser);

  if (!result.success) {
    return { ok: false, error: result.error };
  }

  const entries = await listTimeEntriesForWorkIssue(boardId, issueId, mcpUser);
  return { ok: true, loggedHours: result.loggedHours, entries };
}

export async function updateTimeOnWorkIssue(
  boardId: string,
  issueId: string,
  entryId: string,
  input: { hours: number; date: string; note?: string | null },
  mcpUser?: McpUser
): Promise<
  | { ok: true; loggedHours: number; entries: WorkIssueTimeLogEntry[] }
  | { ok: false; error: string }
> {
  const visible = await requireTimeLogBoard(boardId, mcpUser);
  if (!visible) return { ok: false, error: "Unauthorized" };
  if (!canLogWorkTime(visible.actor)) {
    return { ok: false, error: "Customer users cannot log time." };
  }

  const appUser = mcpUser ?? await getCurrentAppUser();

  if (!mcpUser && !appUser?.appKeys.includes("time_report")) {
    return { ok: false, error: "Time report access is required to log hours." };
  }

  const issue = await loadIssueOnBoard(boardId, issueId);
  if (!issue) return { ok: false, error: "Issue not found" };
  if (!issue.planner_project_id) {
    return {
      ok: false,
      error:
        "Link this Work project to a planner project in settings before logging time.",
    };
  }

  const key = workIssueKey(issue.prefix, issue.number);
  const title = issue.title.trim();
  const lineDescription = title ? `${key} ${title}` : key;

  const result = await updateWorkIssueTimeEntry({
    customerId: issue.customer_id,
    plannerProjectId: issue.planner_project_id,
    workIssueId: issueId,
    entryId,
    hours: input.hours,
    date: input.date,
    note: input.note,
    lineDescription,
  }, mcpUser);

  if (!result.success) {
    return { ok: false, error: result.error };
  }

  const entries = await listTimeEntriesForWorkIssue(boardId, issueId, mcpUser);
  return { ok: true, loggedHours: result.loggedHours, entries };
}

export async function deleteTimeOnWorkIssue(
  boardId: string,
  issueId: string,
  entryId: string,
  mcpUser?: McpUser
): Promise<
  | { ok: true; loggedHours: number; entries: WorkIssueTimeLogEntry[] }
  | { ok: false; error: string }
> {
  const visible = await requireTimeLogBoard(boardId, mcpUser);
  if (!visible) return { ok: false, error: "Unauthorized" };
  if (!canLogWorkTime(visible.actor)) {
    return { ok: false, error: "Customer users cannot log time." };
  }

  const appUser = mcpUser ?? await getCurrentAppUser();

  if (!mcpUser && !appUser?.appKeys.includes("time_report")) {
    return { ok: false, error: "Time report access is required to log hours." };
  }

  const issue = await loadIssueOnBoard(boardId, issueId);
  if (!issue) return { ok: false, error: "Issue not found" };

  const result = await deleteWorkIssueTimeEntry({
    customerId: issue.customer_id,
    workIssueId: issueId,
    entryId,
  }, mcpUser);

  if (!result.success) {
    return { ok: false, error: result.error };
  }

  const entries = await listTimeEntriesForWorkIssue(boardId, issueId, mcpUser);
  return { ok: true, loggedHours: result.loggedHours, entries };
}
