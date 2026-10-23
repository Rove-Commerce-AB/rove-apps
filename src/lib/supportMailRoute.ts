"use server";

import { revalidatePath } from "next/cache";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import {
  ROUTES,
  supportCustomerIncidentsHref,
  workProjectHref,
} from "@/lib/routes";
import { canSeeSupportOverview } from "@/lib/supportAccess";
import { requireSupportActor } from "@/lib/supportActor";
import { ensureSupportWorkProject } from "@/lib/supportBoard";
import { fetchActiveSupportContractForCustomer } from "@/lib/supportContractsQueries";
import { WorkInputError } from "@/lib/workErrors";
import { moveWorkIssueToProject } from "@/lib/workIssuesQueries";

async function requireOverviewStaff() {
  const actor = await requireSupportActor();
  if (!canSeeSupportOverview(actor)) {
    throw new WorkInputError("Unauthorized");
  }
  return actor;
}

async function loadInboxIssue(issueId: string): Promise<{
  id: string;
  boardId: string;
  title: string;
}> {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    project_id: string;
    title: string;
  }>(
    `SELECT i.id, i.project_id, i.title
     FROM work_issues i
     JOIN work_projects p ON p.id = i.project_id
     WHERE i.id = $1
       AND p.is_support_inbox
       AND p.archived_at IS NULL`,
    [issueId]
  );
  const row = rows[0];
  if (!row) throw new WorkInputError("Inbox issue not found.");
  return { id: row.id, boardId: row.project_id, title: row.title };
}

async function resolveCustomerSupportBoard(input: {
  customerId: string;
  actorAppUserId: string;
}): Promise<string> {
  const existing = await fetchActiveSupportContractForCustomer(input.customerId);
  if (!existing) {
    throw new WorkInputError(
      "Customer has no active support contract. Activate support in customer master data."
    );
  }
  return ensureSupportWorkProject({
    customerId: input.customerId,
    actorAppUserId: input.actorAppUserId,
    contractId: existing.id,
  });
}

export type RouteInboxResult = {
  issueId: string;
  targetBoardId: string;
  customerId: string;
  /** Deep-link after route: Cases when support board, else Work board. */
  href: string;
};

/**
 * Route an inbox issue onto the customer's Support board and mark as read
 * (status Investigating). Requires an existing active support contract.
 */
export async function routeInboxToSupportBoard(input: {
  issueId: string;
  customerId: string;
}): Promise<RouteInboxResult> {
  const actor = await requireOverviewStaff();
  const issue = await loadInboxIssue(input.issueId);

  const targetBoardId = await resolveCustomerSupportBoard({
    customerId: input.customerId,
    actorAppUserId: actor.id,
  });

  await moveWorkIssueToProject({
    issueId: issue.id,
    fromProjectId: issue.boardId,
    toProjectId: targetBoardId,
    preferredStatusName: "Investigating",
    actorAppUserId: actor.id,
    eventSummary: "routed from Support Inbox to Support board (read)",
  });

  await cloudSqlPool.query(
    `UPDATE support_mail_messages
     SET customer_id = $2
     WHERE work_issue_id = $1`,
    [issue.id, input.customerId]
  );

  revalidatePath(ROUTES.supportOverview);
  revalidatePath(supportCustomerIncidentsHref(input.customerId));

  return {
    issueId: issue.id,
    targetBoardId,
    customerId: input.customerId,
    href: supportCustomerIncidentsHref(input.customerId),
  };
}

/**
 * Route an inbox issue onto another Work board for the customer
 * (e.g. retainer). Lands in the first column.
 */
export async function routeInboxToCustomerBoard(input: {
  issueId: string;
  customerId: string;
  boardId: string;
}): Promise<RouteInboxResult> {
  const actor = await requireOverviewStaff();
  const issue = await loadInboxIssue(input.issueId);

  const { rows: boardRows } = await cloudSqlPool.query<{
    id: string;
    customer_id: string;
    is_support_inbox: boolean;
  }>(
    `SELECT id, customer_id, is_support_inbox
     FROM work_projects
     WHERE id = $1 AND archived_at IS NULL`,
    [input.boardId]
  );
  const board = boardRows[0];
  if (!board || board.customer_id !== input.customerId) {
    throw new WorkInputError("Board does not belong to the selected customer.");
  }
  if (board.is_support_inbox) {
    throw new WorkInputError("Cannot route back to Support Inbox.");
  }

  await moveWorkIssueToProject({
    issueId: issue.id,
    fromProjectId: issue.boardId,
    toProjectId: board.id,
    preferredStatusName: null,
    actorAppUserId: actor.id,
    eventSummary: "routed from Support Inbox to customer board",
  });

  await cloudSqlPool.query(
    `UPDATE support_mail_messages
     SET customer_id = $2
     WHERE work_issue_id = $1`,
    [issue.id, input.customerId]
  );

  revalidatePath(ROUTES.supportOverview);
  revalidatePath(workProjectHref(input.customerId, board.id));

  return {
    issueId: issue.id,
    targetBoardId: board.id,
    customerId: input.customerId,
    href: workProjectHref(input.customerId, board.id),
  };
}

export async function listBoardsForSupportRouting(
  customerId: string
): Promise<
  { id: string; title: string; prefix: string; isSupportBoard: boolean }[]
> {
  await requireOverviewStaff();
  const { rows } = await cloudSqlPool.query<{
    id: string;
    title: string;
    prefix: string;
    is_support_board: boolean;
  }>(
    `SELECT id, title, prefix, is_support_board
     FROM work_projects
     WHERE customer_id = $1
       AND archived_at IS NULL
       AND NOT is_support_inbox
     ORDER BY is_support_board DESC, lower(title)`,
    [customerId]
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    prefix: row.prefix,
    isSupportBoard: row.is_support_board,
  }));
}
