"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getCurrentAppUser } from "@/lib/appUsers";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { getCustomerById } from "@/lib/customers";
import { ROUTES } from "@/lib/routes";
import {
  canAccessSupportCustomer,
  canSeeSupportOverview,
  canUseSupportCases,
  isStaffSupportRole,
} from "@/lib/supportAccess";
import {
  getSupportActor,
  linkedSupportCustomerIdsForActor,
} from "@/lib/supportActor";
import {
  notifySupportCaseCreated,
  notifySupportCaseCustomerReply,
} from "@/lib/supportCaseSlack";
import {
  customerHasActiveSupportContract,
  fetchCustomerIdsWithActiveSupportContract,
  fetchSupportContractForCustomer,
} from "@/lib/supportContractsQueries";
import {
  getGmailMessageHeaders,
  sendGmailThreadReply,
  supportMailboxAddress,
} from "@/lib/supportMailGmail";
import {
  fetchSupportCaseRef,
  supportCaseViewUrl,
  withSupportCaseRefInSubject,
  withSupportCaseViewLink,
} from "@/lib/supportCaseRef";
import { createWorkIssue } from "@/lib/workIssues";
import { WorkInputError } from "@/lib/workErrors";
import { isImageMime, isVideoMime } from "@/lib/workMedia";
import { WORK_FILE_MAX_BYTES } from "@/lib/workTypes";
import {
  fetchWorkBoardById,
  fetchWorkBoardStatuses,
} from "@/lib/workBoardsQueries";
import { clearSupportAwaitingStaff } from "@/lib/supportAwaitingStaff";
import { workPersonFromUser } from "@/lib/workIssueKey";
import type { WorkPerson } from "@/lib/workTypes";
import {
  addWorkIssueAssignee,
  deleteWorkIssue as deleteWorkIssueRow,
  fetchWorkAssigneesForCustomer,
  fetchWorkBoardMembers,
  insertWorkIssue,
  insertWorkIssueComment,
  isWorkBoardMember,
  moveWorkIssue,
  removeWorkIssueAssignee,
  updateWorkIssueOwner,
  workIssueHasLoggedTime,
} from "@/lib/workIssuesQueries";
import type { WorkBoardStatus } from "@/lib/workStatuses";

async function requireCasesContext(customerId: string) {
  const actor = await getSupportActor();
  if (!actor) throw new WorkInputError("Unauthorized");
  const linked = await linkedSupportCustomerIdsForActor(actor);
  const hasContract = await customerHasActiveSupportContract(customerId);
  if (!canUseSupportCases(actor, linked, customerId, hasContract)) {
    throw new WorkInputError(
      "Support incidents are not available for this customer."
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

/**
 * Resolve a case by issue id for Support drawers (Incidents + Overview).
 * Allows the shared Support Inbox for overview staff (pre-routing).
 */
async function requireIssueCasesContext(customerId: string, issueId: string) {
  const actor = await getSupportActor();
  if (!actor) throw new WorkInputError("Unauthorized");

  const { rows } = await cloudSqlPool.query<{
    project_id: string;
    customer_id: string;
    is_support_board: boolean;
    is_support_inbox: boolean;
  }>(
    `SELECT i.project_id,
            p.customer_id,
            COALESCE(p.is_support_board, false) AS is_support_board,
            COALESCE(p.is_support_inbox, false) AS is_support_inbox
     FROM work_issues i
     JOIN work_projects p ON p.id = i.project_id
     WHERE i.id = $1`,
    [issueId]
  );
  const row = rows[0];
  if (!row || row.customer_id !== customerId) {
    throw new WorkInputError("Case not found.");
  }

  if (row.is_support_inbox) {
    if (!canSeeSupportOverview(actor)) {
      throw new WorkInputError("Unauthorized");
    }
    const board = await fetchWorkBoardById(row.project_id);
    if (!board) throw new WorkInputError("Support Inbox board not found.");
    return {
      actor,
      projectId: row.project_id,
      board,
      isInbox: true as const,
    };
  }

  if (!row.is_support_board) {
    throw new WorkInputError("Case is not on a support board.");
  }

  const linked = await linkedSupportCustomerIdsForActor(actor);
  const hasContract = await customerHasActiveSupportContract(customerId);
  if (!canUseSupportCases(actor, linked, customerId, hasContract)) {
    throw new WorkInputError(
      "Support incidents are not available for this customer."
    );
  }

  const board = await fetchWorkBoardById(row.project_id);
  if (!board || board.customer_id !== customerId) {
    throw new WorkInputError("Support project not found.");
  }
  return {
    actor,
    projectId: row.project_id,
    board,
    isInbox: false as const,
  };
}

export type SupportCaseListItem = {
  id: string;
  key: string;
  title: string;
  statusName: string;
  isDone: boolean;
  createdAt: string;
  customerId: string;
  customerName: string;
  /** Customer follow-up mail awaiting staff response. */
  awaitingStaff: boolean;
};

export type SupportCaseListResult = {
  cases: SupportCaseListItem[];
  totalCount: number;
};

export async function listSupportCases(
  customerId: string
): Promise<SupportCaseListResult> {
  const { projectId } = await requireCasesContext(customerId);
  const [statuses, customer] = await Promise.all([
    fetchWorkBoardStatuses(projectId),
    getCustomerById(customerId),
  ]);
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const customerName = customer?.name?.trim() || "Customer";

  const { rows } = await cloudSqlPool.query<{
    id: string;
    number: number;
    title: string;
    status: string;
    created_at: Date;
    prefix: string;
    support_awaiting_staff_at: Date | null;
    total_count: string | number;
  }>(
    `SELECT i.id, i.number, i.title, i.status, i.created_at, p.prefix,
            i.support_awaiting_staff_at,
            COUNT(*) OVER() AS total_count
     FROM work_issues i
     JOIN work_projects p ON p.id = i.project_id
     WHERE i.project_id = $1
     ORDER BY i.support_awaiting_staff_at DESC NULLS LAST, i.number DESC
     LIMIT 200`,
    [projectId]
  );

  const totalCount =
    rows.length === 0 ? 0 : Number(rows[0].total_count) || rows.length;

  return {
    totalCount,
    cases: rows.map((row) => {
      const status = statusById.get(row.status);
      return {
        id: row.id,
        key: `${row.prefix}-${row.number}`,
        title: row.title,
        statusName: status?.name ?? "Unknown",
        isDone: status?.isDone ?? false,
        createdAt: new Date(row.created_at).toISOString(),
        customerId,
        customerName,
        awaitingStaff: row.support_awaiting_staff_at != null,
      };
    }),
  };
}

/** Cases across customers with active support contracts the actor can access. */
export async function listSupportCasesForCustomers(
  customerIds: string[]
): Promise<SupportCaseListResult> {
  const actor = await getSupportActor();
  if (!actor) throw new WorkInputError("Unauthorized");
  const linked = await linkedSupportCustomerIdsForActor(actor);
  const accessible = customerIds.filter((id) =>
    canAccessSupportCustomer(actor, linked, id)
  );
  if (accessible.length === 0) return { cases: [], totalCount: 0 };

  const contractedSet =
    await fetchCustomerIdsWithActiveSupportContract(accessible);
  const contracted = [...contractedSet];
  if (contracted.length === 0) return { cases: [], totalCount: 0 };

  const { rows } = await cloudSqlPool.query<{
    id: string;
    number: number;
    title: string;
    status: string;
    created_at: Date;
    prefix: string;
    customer_id: string;
    customer_name: string;
    status_name: string | null;
    status_is_done: boolean | null;
    support_awaiting_staff_at: Date | null;
    total_count: string | number;
  }>(
    `SELECT i.id, i.number, i.title, i.status, i.created_at, p.prefix,
            p.customer_id, c.name AS customer_name,
            s.name AS status_name, s.is_done AS status_is_done,
            i.support_awaiting_staff_at,
            COUNT(*) OVER() AS total_count
     FROM work_issues i
     JOIN work_projects p ON p.id = i.project_id
     JOIN customers c ON c.id = p.customer_id
     JOIN support_contracts sc
       ON sc.customer_id = p.customer_id
      AND sc.support_work_project_id = p.id
      AND sc.active
      AND (sc.ends_on IS NULL OR sc.ends_on >= CURRENT_DATE)
      AND (sc.starts_on IS NULL OR sc.starts_on <= CURRENT_DATE)
     LEFT JOIN work_project_statuses s ON s.id = i.status
     WHERE p.customer_id = ANY($1::uuid[])
       AND p.is_support_board
       AND COALESCE(p.is_support_inbox, false) = false
     ORDER BY i.support_awaiting_staff_at DESC NULLS LAST, i.created_at DESC
     LIMIT 200`,
    [contracted]
  );

  const totalCount =
    rows.length === 0 ? 0 : Number(rows[0].total_count) || rows.length;

  return {
    totalCount,
    cases: rows.map((row) => ({
      id: row.id,
      key: `${row.prefix}-${row.number}`,
      title: row.title,
      statusName: row.status_name ?? "Unknown",
      isDone: row.status_is_done ?? false,
      createdAt: new Date(row.created_at).toISOString(),
      customerId: row.customer_id,
      customerName: row.customer_name,
      awaitingStaff: row.support_awaiting_staff_at != null,
    })),
  };
}

function revalidateSupportIncidents() {
  revalidatePath(ROUTES.supportIncidents);
  revalidatePath(ROUTES.supportOverview);
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

  revalidateSupportIncidents();
  scheduleSupportCaseSlackNotify({
    customerId,
    customerName,
    issueId,
    title: trimmed,
    createdByName,
  });
  return { issueId };
}

export type SupportCaseCommentKind =
  | "comment"
  | "mail_in"
  | "mail_out"
  | "internal";

export type SupportCaseComment = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorId: string;
  isInternal: boolean;
  kind: SupportCaseCommentKind;
};

export type SupportCaseStatusOption = {
  id: string;
  name: string;
  isDone: boolean;
};

export type SupportCaseMailThread = {
  threadId: string;
  replyToEmail: string;
  subject: string;
  lastInboundMessageId: string;
  fromMailbox: string;
};

export type SupportCaseDetail = {
  id: string;
  key: string;
  /** Stable Support reference (SUP-n), when allocated. */
  supportCaseRef: string | null;
  title: string;
  description: string;
  descriptionKind: "mail_in" | "description";
  statusId: string;
  statusName: string;
  isDone: boolean;
  createdAt: string;
  owner: WorkPerson | null;
  assignees: WorkPerson[];
  /** Board members / staff pickable in WorkCardPeople. */
  people: WorkPerson[];
  statuses: SupportCaseStatusOption[];
  canChangeStatus: boolean;
  /** Same gate as status — staff only. */
  canAssign: boolean;
  canReplyByEmail: boolean;
  /** Staff-only danger zone. */
  canDelete: boolean;
  hasLoggedTime: boolean;
  /** Customer follow-up mail awaiting staff response. */
  awaitingStaff: boolean;
  mailThread: SupportCaseMailThread | null;
  comments: SupportCaseComment[];
};

async function ensureSupportBoardMember(
  boardId: string,
  appUserId: string
): Promise<void> {
  const isMember = await isWorkBoardMember(boardId, appUserId);
  if (isMember) return;
  await cloudSqlPool.query(
    `INSERT INTO work_project_members (project_id, app_user_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [boardId, appUserId]
  );
}

async function requireStaffAssignee(
  appUserId: string
): Promise<{ id: string; name: string }> {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    name: string | null;
    email: string;
    role: string;
  }>(`SELECT id, name, email, role FROM app_users WHERE id = $1 LIMIT 1`, [
    appUserId,
  ]);
  const person = rows[0];
  if (!person || person.role === "customer") {
    throw new WorkInputError("Assignee must be a staff user.");
  }
  return workPersonFromUser(person);
}

const MAIL_IN_PREFIX = "Follow-up email from ";
const MAIL_OUT_PREFIX = "Email reply to ";

function commentKind(input: {
  body: string;
  isInternal: boolean;
}): SupportCaseCommentKind {
  if (input.isInternal) return "internal";
  if (input.body.startsWith(MAIL_OUT_PREFIX)) return "mail_out";
  if (input.body.startsWith(MAIL_IN_PREFIX)) return "mail_in";
  return "comment";
}

function descriptionKind(
  description: string
): "mail_in" | "description" {
  const trimmed = description.trim();
  if (trimmed.startsWith("From:") || trimmed.startsWith("From ")) {
    return "mail_in";
  }
  return "description";
}

export async function getSupportCaseDetail(
  customerId: string,
  issueId: string
): Promise<SupportCaseDetail> {
  const { actor, projectId } = await requireIssueCasesContext(
    customerId,
    issueId
  );
  const statuses = await fetchWorkBoardStatuses(projectId);
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const hideInternal = actor.role === "customer";
  const canChangeStatus = isStaffSupportRole(actor.role);
  const canDelete = canChangeStatus;

  const { rows } = await cloudSqlPool.query<{
    id: string;
    number: number;
    title: string;
    description: string;
    status: string;
    created_at: Date;
    prefix: string;
    support_awaiting_staff_at: Date | null;
    support_case_number: string | number | null;
    owner_id: string | null;
    owner_name: string | null;
    owner_email: string | null;
    is_support_inbox: boolean;
  }>(
    `SELECT i.id, i.number, i.title, i.description, i.status, i.created_at, p.prefix,
            i.support_awaiting_staff_at, i.support_case_number,
            o.id AS owner_id, o.name AS owner_name, o.email AS owner_email,
            COALESCE(p.is_support_inbox, false) AS is_support_inbox
     FROM work_issues i
     JOIN work_projects p ON p.id = i.project_id
     LEFT JOIN app_users o ON o.id = i.owner_app_user_id
     WHERE i.project_id = $1 AND i.id = $2`,
    [projectId, issueId]
  );
  const row = rows[0];
  if (!row) throw new WorkInputError("Case not found.");

  const hasLoggedTime = await workIssueHasLoggedTime(issueId);
  const canAssign = canChangeStatus;

  const memberRows = await fetchWorkBoardMembers(projectId);
  const poolRows = row.is_support_inbox
    ? memberRows
    : await fetchWorkAssigneesForCustomer(customerId, projectId);
  const candidateRows = [...memberRows, ...poolRows];
  const staffIds = new Set(
    (
      await cloudSqlPool.query<{ id: string }>(
        `SELECT id FROM app_users
         WHERE id = ANY($1::uuid[]) AND role <> 'customer'`,
        [candidateRows.map((person) => person.id)]
      )
    ).rows.map((person) => person.id)
  );
  const peopleById = new Map<string, WorkPerson>();
  for (const person of candidateRows) {
    if (!staffIds.has(person.id)) continue;
    peopleById.set(person.id, workPersonFromUser(person));
  }

  const owner: WorkPerson | null = row.owner_id
    ? workPersonFromUser({
        id: row.owner_id,
        name: row.owner_name,
        email: row.owner_email ?? "",
      })
    : null;
  if (owner) peopleById.set(owner.id, owner);

  const { rows: issueAssigneeRows } = await cloudSqlPool.query<{
    id: string;
    name: string | null;
    email: string;
  }>(
    `SELECT u.id, u.name, u.email
     FROM work_issue_assignees a
     JOIN app_users u ON u.id = a.app_user_id
     WHERE a.issue_id = $1
     ORDER BY lower(COALESCE(NULLIF(trim(u.name), ''), u.email))`,
    [issueId]
  );
  const assignees = issueAssigneeRows.map((person) => {
    const mapped = workPersonFromUser(person);
    peopleById.set(mapped.id, mapped);
    return mapped;
  });
  const people = [...peopleById.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  const { rows: commentRows } = await cloudSqlPool.query<{
    id: string;
    body: string;
    created_at: Date;
    author_id: string;
    author_name: string | null;
    author_email: string;
    is_internal: boolean;
  }>(
    `SELECT c.id, c.body, c.created_at,
            u.id AS author_id, u.name AS author_name, u.email AS author_email,
            COALESCE(c.is_internal, false) AS is_internal
     FROM work_issue_comments c
     JOIN app_users u ON u.id = c.author_app_user_id
     WHERE c.issue_id = $1
       AND ($2::boolean = false OR COALESCE(c.is_internal, false) = false)
     ORDER BY c.created_at ASC, c.id ASC
     LIMIT 100`,
    [issueId, hideInternal]
  );

  const comments = commentRows.map((comment) => {
    const isInternal = comment.is_internal;
    return {
      id: comment.id,
      body: comment.body,
      createdAt: new Date(comment.created_at).toISOString(),
      authorId: comment.author_id,
      authorName:
        comment.author_name?.trim() || comment.author_email || "Unknown",
      isInternal,
      kind: commentKind({ body: comment.body, isInternal }),
    };
  });

  const { rows: mailRows } = await cloudSqlPool.query<{
    gmail_thread_id: string;
    gmail_message_id: string;
    from_email: string;
    subject: string;
    match_kind: string;
  }>(
    `SELECT gmail_thread_id, gmail_message_id, from_email, subject, match_kind
     FROM support_mail_messages
     WHERE work_issue_id = $1
     ORDER BY COALESCE(received_at, created_at) ASC, created_at ASC`,
    [issueId]
  );

  let mailThread: SupportCaseMailThread | null = null;
  if (mailRows.length > 0) {
    const inbound = [...mailRows]
      .reverse()
      .find((row) => row.match_kind !== "outbound");
    const first = mailRows[0];
    if (inbound && first) {
      mailThread = {
        threadId: first.gmail_thread_id,
        replyToEmail: inbound.from_email,
        subject: inbound.subject || first.subject,
        lastInboundMessageId: inbound.gmail_message_id,
        fromMailbox: supportMailboxAddress(),
      };
    }
  }

  const status = statusById.get(row.status);
  const description = row.description ?? "";
  const supportCaseNumber = Number(row.support_case_number);
  const supportCaseRef =
    Number.isFinite(supportCaseNumber) && supportCaseNumber > 0
      ? `SUP-${supportCaseNumber}`
      : null;
  return {
    id: row.id,
    key: `${row.prefix}-${row.number}`,
    supportCaseRef,
    title: row.title,
    description,
    descriptionKind: descriptionKind(description),
    statusId: row.status,
    statusName: status?.name ?? "Unknown",
    isDone: status?.isDone ?? false,
    createdAt: new Date(row.created_at).toISOString(),
    owner,
    assignees,
    people,
    statuses: statuses.map((item: WorkBoardStatus) => ({
      id: item.id,
      name: item.name,
      isDone: item.isDone,
    })),
    canChangeStatus,
    canAssign,
    canReplyByEmail: canChangeStatus && mailThread != null,
    canDelete,
    hasLoggedTime,
    awaitingStaff: row.support_awaiting_staff_at != null,
    mailThread,
    comments,
  };
}

/** Staff permanently deletes a Support case (and cascaded mail rows). */
export async function deleteSupportCase(
  customerId: string,
  issueId: string
): Promise<void> {
  const { actor, projectId } = await requireIssueCasesContext(
    customerId,
    issueId
  );
  if (!isStaffSupportRole(actor.role)) {
    throw new WorkInputError("Only staff can delete support cases.");
  }
  if (await workIssueHasLoggedTime(issueId)) {
    throw new WorkInputError(
      "This case has logged time and cannot be deleted."
    );
  }
  const ok = await deleteWorkIssueRow(projectId, issueId);
  if (!ok) throw new WorkInputError("Case not found.");
  revalidateSupportIncidents();
}

export async function setSupportCaseStatus(
  customerId: string,
  issueId: string,
  statusId: string
): Promise<void> {
  const { actor, projectId } = await requireIssueCasesContext(
    customerId,
    issueId
  );
  if (!isStaffSupportRole(actor.role)) {
    throw new WorkInputError("Only staff can change case status.");
  }
  const statuses = await fetchWorkBoardStatuses(projectId);
  const target = statuses.find((status) => status.id === statusId);
  if (!target) throw new WorkInputError("Unknown status.");

  const moved = await moveWorkIssue({
    boardId: projectId,
    issueId,
    status: statusId,
    actorAppUserId: actor.id,
    statusName: target.name,
    clearHiddenFromBoard: !target.isDone,
    prependIfNoOrder: target.isDone,
  });
  if (moved == null) throw new WorkInputError("Case not found.");
  revalidateSupportIncidents();
}

/** Set or clear the Work owner from Support (staff only). */
export async function setSupportCaseOwner(
  customerId: string,
  issueId: string,
  ownerAppUserId: string | null
): Promise<void> {
  const { actor, projectId } = await requireIssueCasesContext(
    customerId,
    issueId
  );
  if (!isStaffSupportRole(actor.role)) {
    throw new WorkInputError("Only staff can assign support cases.");
  }

  if (ownerAppUserId) {
    await requireStaffAssignee(ownerAppUserId);
    await ensureSupportBoardMember(projectId, ownerAppUserId);
  }

  const ok = await updateWorkIssueOwner(projectId, issueId, ownerAppUserId);
  if (!ok) throw new WorkInputError("Case not found.");
  revalidateSupportIncidents();
}

/** Add a Work assignee from Support (staff only). */
export async function addSupportCaseAssignee(
  customerId: string,
  issueId: string,
  appUserId: string
): Promise<void> {
  const { actor, projectId } = await requireIssueCasesContext(
    customerId,
    issueId
  );
  if (!isStaffSupportRole(actor.role)) {
    throw new WorkInputError("Only staff can assign support cases.");
  }
  await requireStaffAssignee(appUserId);
  await ensureSupportBoardMember(projectId, appUserId);
  await addWorkIssueAssignee(issueId, appUserId);
  revalidateSupportIncidents();
}

/** Remove a Work assignee from Support (staff only). */
export async function removeSupportCaseAssignee(
  customerId: string,
  issueId: string,
  appUserId: string
): Promise<void> {
  const { actor } = await requireIssueCasesContext(customerId, issueId);
  if (!isStaffSupportRole(actor.role)) {
    throw new WorkInputError("Only staff can assign support cases.");
  }
  await removeWorkIssueAssignee(issueId, appUserId);
  revalidateSupportIncidents();
}

export async function addSupportCaseComment(
  customerId: string,
  issueId: string,
  body: string,
  options?: { internal?: boolean }
): Promise<void> {
  const { actor, projectId } = await requireIssueCasesContext(
    customerId,
    issueId
  );
  const trimmed = body.trim();
  if (!trimmed) throw new WorkInputError("Comment is required.");
  const isInternal = Boolean(options?.internal) && actor.role !== "customer";

  const commentId = await insertWorkIssueComment({
    boardId: projectId,
    issueId,
    authorAppUserId: actor.id,
    body: trimmed,
  });
  if (!commentId) throw new WorkInputError("Case not found.");

  if (isInternal) {
    await cloudSqlPool.query(
      `UPDATE work_issue_comments SET is_internal = true WHERE id = $1`,
      [commentId]
    );
  } else if (isStaffSupportRole(actor.role)) {
    await clearSupportAwaitingStaff(issueId);
  } else if (actor.role === "customer") {
    const [customer, user, issueMeta] = await Promise.all([
      getCustomerById(customerId),
      getCurrentAppUser(),
      cloudSqlPool.query<{ title: string }>(
        `SELECT title FROM work_issues WHERE id = $1::uuid LIMIT 1`,
        [issueId]
      ),
    ]);
    const customerName = customer?.name?.trim() || "Unknown customer";
    const repliedByName = user?.name?.trim() || user?.email || "Customer";
    const title = issueMeta.rows[0]?.title?.trim() || "Support case";
    after(() => {
      void notifySupportCaseCustomerReply({
        customerId,
        customerName,
        issueId,
        title,
        repliedByName,
        channel: "comment",
        body: trimmed,
      });
    });
  }

  revalidateSupportIncidents();
}

/**
 * Staff reply via support@ into the linked Gmail thread.
 * Also stores a public case comment + support_mail_messages row.
 * Optional image/video attachments (max 8 MB each, same as Work files).
 */
export async function replySupportCaseEmail(
  customerId: string,
  issueId: string,
  body: string,
  attachments?: File[]
): Promise<void> {
  const { actor, projectId } = await requireIssueCasesContext(
    customerId,
    issueId
  );
  if (!isStaffSupportRole(actor.role)) {
    throw new WorkInputError("Only staff can send email replies.");
  }
  const trimmed = body.trim();
  if (!trimmed) throw new WorkInputError("Reply body is required.");

  const files = attachments ?? [];
  if (files.length > 8) {
    throw new WorkInputError("You can attach at most 8 files to an email reply.");
  }
  const outgoing: {
    fileName: string;
    mimeType: string;
    content: Buffer;
  }[] = [];
  for (const file of files) {
    const mime = (file.type || "application/octet-stream").toLowerCase();
    if (!isImageMime(mime) && !isVideoMime(mime)) {
      throw new WorkInputError("Email attachments must be images or videos.");
    }
    if (file.size <= 0) continue;
    if (file.size > WORK_FILE_MAX_BYTES) {
      throw new WorkInputError("Each attachment must be 8 MB or smaller.");
    }
    outgoing.push({
      fileName: file.name.trim() || (isVideoMime(mime) ? "video.mp4" : "image.png"),
      mimeType: mime,
      content: Buffer.from(await file.arrayBuffer()),
    });
  }

  const { rows: mailRows } = await cloudSqlPool.query<{
    gmail_thread_id: string;
    gmail_message_id: string;
    from_email: string;
    subject: string;
    match_kind: string;
    customer_id: string | null;
  }>(
    `SELECT gmail_thread_id, gmail_message_id, from_email, subject, match_kind, customer_id
     FROM support_mail_messages
     WHERE work_issue_id = $1
     ORDER BY COALESCE(received_at, created_at) ASC, created_at ASC`,
    [issueId]
  );
  if (mailRows.length === 0) {
    throw new WorkInputError("This case has no linked email thread.");
  }

  const inbound = [...mailRows]
    .reverse()
    .find((row) => row.match_kind !== "outbound");
  const first = mailRows[0];
  if (!inbound || !first) {
    throw new WorkInputError("No inbound email to reply to.");
  }

  const headers = await getGmailMessageHeaders(inbound.gmail_message_id);
  const toEmail = inbound.from_email || headers.fromEmail;
  if (!toEmail) throw new WorkInputError("Missing reply recipient.");

  const supportCaseRef = await fetchSupportCaseRef(issueId);
  const rawSubject = inbound.subject || headers.subject || "(no subject)";
  const subject = supportCaseRef
    ? withSupportCaseRefInSubject(rawSubject, supportCaseRef)
    : rawSubject;
  const caseUrl = supportCaseViewUrl(customerId, issueId);
  const bodyText = withSupportCaseViewLink(trimmed, caseUrl);
  const sent = await sendGmailThreadReply({
    threadId: first.gmail_thread_id,
    toEmail,
    subject,
    bodyText,
    inReplyToMessageId: headers.messageIdHeader,
    references: headers.references,
    attachments: outgoing,
  });

  const attachNote =
    outgoing.length > 0
      ? `\n\nAttachments: ${outgoing.map((f) => f.fileName).join(", ")}`
      : "";
  const commentBody = [
    `${MAIL_OUT_PREFIX}${toEmail}`,
    `Subject: ${/^re:/i.test(subject) ? subject : `Re: ${subject}`}`,
    `From: ${supportMailboxAddress()}`,
    "",
    bodyText + attachNote,
  ].join("\n");

  const commentId = await insertWorkIssueComment({
    boardId: projectId,
    issueId,
    authorAppUserId: actor.id,
    body: commentBody.slice(0, 20_000),
  });
  if (!commentId) throw new WorkInputError("Case not found.");

  await cloudSqlPool.query(
    `INSERT INTO support_mail_messages (
       gmail_message_id, gmail_thread_id, from_email, subject, received_at,
       customer_id, match_kind, work_issue_id
     ) VALUES ($1, $2, $3, $4, now(), $5, 'outbound', $6)
     ON CONFLICT (gmail_message_id) DO NOTHING`,
    [
      sent.id,
      sent.threadId,
      supportMailboxAddress(),
      subject.slice(0, 500),
      inbound.customer_id ?? customerId,
      issueId,
    ]
  );

  await clearSupportAwaitingStaff(issueId);

  revalidateSupportIncidents();
}
