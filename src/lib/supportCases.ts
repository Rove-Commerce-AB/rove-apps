"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getCurrentAppUser } from "@/lib/appUsers";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { getCustomerById } from "@/lib/customers";
import { supportCustomerCasesHref } from "@/lib/routes";
import { canUseSupportCases } from "@/lib/supportAccess";
import {
  getSupportActor,
  linkedSupportCustomerIdsForActor,
} from "@/lib/supportActor";
import { notifySupportCaseCreated } from "@/lib/supportCaseSlack";
import {
  customerHasActiveSupportContract,
  fetchSupportContractForCustomer,
} from "@/lib/supportContractsQueries";
import { createWorkIssue } from "@/lib/workIssues";
import { WorkInputError } from "@/lib/workErrors";
import {
  fetchWorkBoardById,
  fetchWorkBoardStatuses,
} from "@/lib/workBoardsQueries";
import { insertWorkIssue, insertWorkIssueComment } from "@/lib/workIssuesQueries";
import { fetchWorkIssueCommentPage } from "@/lib/workIssueDetailsQueries";

async function requireCasesContext(customerId: string) {
  const actor = await getSupportActor();
  if (!actor) throw new WorkInputError("Unauthorized");
  const linked = await linkedSupportCustomerIdsForActor(actor);
  const hasContract = await customerHasActiveSupportContract(customerId);
  if (!canUseSupportCases(actor, linked, customerId, hasContract)) {
    throw new WorkInputError(
      "Support cases are not available for this customer."
    );
  }
  const contract = await fetchSupportContractForCustomer(customerId);
  const projectId = contract?.support_work_project_id;
  if (!projectId) {
    throw new WorkInputError("Support project is not provisioned yet.");
  }
  const board = await fetchWorkBoardById(projectId);
  if (!board || board.customer_id !== customerId) {
    throw new WorkInputError("Support project not found.");
  }
  if (board.is_support_board === false) {
    throw new WorkInputError("Linked project is not a support board.");
  }
  return { actor, projectId, board };
}

export type SupportCaseListItem = {
  id: string;
  key: string;
  title: string;
  statusName: string;
  isDone: boolean;
  createdAt: string;
};

export async function listSupportCases(
  customerId: string
): Promise<SupportCaseListItem[]> {
  const { projectId } = await requireCasesContext(customerId);
  const statuses = await fetchWorkBoardStatuses(projectId);
  const statusById = new Map(statuses.map((s) => [s.id, s]));

  const { rows } = await cloudSqlPool.query<{
    id: string;
    number: number;
    title: string;
    status: string;
    created_at: Date;
    prefix: string;
  }>(
    `SELECT i.id, i.number, i.title, i.status, i.created_at, p.prefix
     FROM work_issues i
     JOIN work_projects p ON p.id = i.project_id
     WHERE i.project_id = $1
     ORDER BY i.number DESC
     LIMIT 200`,
    [projectId]
  );

  return rows.map((row) => {
    const status = statusById.get(row.status);
    return {
      id: row.id,
      key: `${row.prefix}-${row.number}`,
      title: row.title,
      statusName: status?.name ?? "Unknown",
      isDone: status?.isDone ?? false,
      createdAt: new Date(row.created_at).toISOString(),
    };
  });
}

function scheduleSupportCaseSlackNotify(input: {
  customerId: string;
  customerName: string;
  issueId: string;
  title: string;
  createdByName: string;
}) {
  after(() => {
    void notifySupportCaseCreated(input);
  });
}

export async function createSupportCase(
  customerId: string,
  title: string,
  description?: string
): Promise<{ issueId: string }> {
  const { actor, projectId, board } = await requireCasesContext(customerId);
  const trimmed = title.trim();
  if (!trimmed) throw new WorkInputError("Title is required.");

  const [customer, user] = await Promise.all([
    getCustomerById(customerId),
    getCurrentAppUser(),
  ]);
  const customerName = customer?.name?.trim() || "Unknown customer";
  const createdByName = user?.name?.trim() || user?.email || "Unknown";

  const isBoardMember = board.member_ids.includes(actor.id);

  let issueId: string;
  if (isBoardMember) {
    issueId = await createWorkIssue(
      {
        boardId: projectId,
        title: trimmed,
        description: description?.trim() || undefined,
        assignToMe: actor.role !== "customer",
      },
      actor
    );
  } else {
    const statuses = await fetchWorkBoardStatuses(projectId);
    const status = statuses[0]?.id;
    if (!status) throw new WorkInputError("Support project has no columns.");

    issueId = await insertWorkIssue({
      boardId: projectId,
      title: trimmed,
      status,
      createdByAppUserId: actor.id,
      description: description?.trim() || "",
      issueType: "issue",
      ownerAppUserId: null,
    });
  }

  revalidatePath(supportCustomerCasesHref(customerId));
  scheduleSupportCaseSlackNotify({
    customerId,
    customerName,
    issueId,
    title: trimmed,
    createdByName,
  });
  return { issueId };
}

export type SupportCaseComment = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorId: string;
};

export type SupportCaseDetail = {
  id: string;
  key: string;
  title: string;
  description: string;
  statusName: string;
  isDone: boolean;
  createdAt: string;
  comments: SupportCaseComment[];
};

export async function getSupportCaseDetail(
  customerId: string,
  issueId: string
): Promise<SupportCaseDetail> {
  const { projectId } = await requireCasesContext(customerId);
  const statuses = await fetchWorkBoardStatuses(projectId);
  const statusById = new Map(statuses.map((s) => [s.id, s]));

  const { rows } = await cloudSqlPool.query<{
    id: string;
    number: number;
    title: string;
    description: string;
    status: string;
    created_at: Date;
    prefix: string;
  }>(
    `SELECT i.id, i.number, i.title, i.description, i.status, i.created_at, p.prefix
     FROM work_issues i
     JOIN work_projects p ON p.id = i.project_id
     WHERE i.project_id = $1 AND i.id = $2`,
    [projectId, issueId]
  );
  const row = rows[0];
  if (!row) throw new WorkInputError("Case not found.");

  const commentRows = await fetchWorkIssueCommentPage({
    projectId,
    issueId,
    limit: 100,
  });
  // Conversation order: oldest first.
  const comments = [...commentRows]
    .reverse()
    .map((comment) => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.created_at,
      authorId: comment.author_id,
      authorName:
        comment.author_name?.trim() ||
        comment.author_email ||
        "Unknown",
    }));

  const status = statusById.get(row.status);
  return {
    id: row.id,
    key: `${row.prefix}-${row.number}`,
    title: row.title,
    description: row.description ?? "",
    statusName: status?.name ?? "Unknown",
    isDone: status?.isDone ?? false,
    createdAt: new Date(row.created_at).toISOString(),
    comments,
  };
}

export async function addSupportCaseComment(
  customerId: string,
  issueId: string,
  body: string
): Promise<void> {
  const { actor, projectId } = await requireCasesContext(customerId);
  const trimmed = body.trim();
  if (!trimmed) throw new WorkInputError("Comment is required.");

  const commentId = await insertWorkIssueComment({
    boardId: projectId,
    issueId,
    authorAppUserId: actor.id,
    body: trimmed,
  });
  if (!commentId) throw new WorkInputError("Case not found.");

  revalidatePath(supportCustomerCasesHref(customerId));
}
