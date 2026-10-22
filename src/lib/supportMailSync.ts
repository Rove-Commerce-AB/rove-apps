import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { getCustomerById } from "@/lib/customers";
import { ensureSupportWorkProject } from "@/lib/supportBoard";
import { notifySupportCaseCreated } from "@/lib/supportCaseSlack";
import { fetchActiveSupportContractForCustomer } from "@/lib/supportContractsQueries";
import {
  applySupportMailLabel,
  ensureSupportMailLabelId,
  getGmailMessage,
  listUnprocessedInboxMessages,
  type GmailParsedMessage,
} from "@/lib/supportMailGmail";
import { ensureSupportInboxBoard } from "@/lib/supportMailInbox";
import {
  matchCustomerForSupportMail,
  shouldSkipSender,
} from "@/lib/supportMailMatch";
import { fetchWorkBoardStatuses } from "@/lib/workBoardsQueries";
import {
  insertWorkIssue,
  insertWorkIssueComment,
  insertWorkIssueReference,
} from "@/lib/workIssuesQueries";

export type SupportMailSyncResult = {
  dryRun: boolean;
  scanned: number;
  created: number;
  threaded: number;
  skipped: number;
  labeled: number;
  errors: { messageId: string; error: string }[];
  details: {
    messageId: string;
    action: string;
    fromEmail?: string;
    subject?: string;
    customerId?: string | null;
    matchKind?: string;
    issueId?: string;
  }[];
};

function mailActorAppUserId(): string {
  const fromEnv = process.env.SUPPORT_MAIL_ACTOR_APP_USER_ID?.trim();
  if (fromEnv) return fromEnv;
  throw new Error("SUPPORT_MAIL_ACTOR_APP_USER_ID is required for mail sync");
}

function caseTitleFromSubject(subject: string): string {
  const cleaned = subject
    .replace(/^(re|fw|fwd)\s*:\s*/gi, "")
    .replace(/^(re|fw|fwd)\s*:\s*/gi, "")
    .trim();
  const title = cleaned || "(no subject)";
  return title.length > 200 ? `${title.slice(0, 197)}...` : title;
}

function caseDescription(msg: GmailParsedMessage): string {
  const lines = [
    `From: ${msg.fromName ? `${msg.fromName} <${msg.fromEmail}>` : msg.fromEmail}`,
    `Subject: ${msg.subject}`,
    msg.receivedAt ? `Received: ${msg.receivedAt.toISOString()}` : null,
    "",
    msg.bodyText || msg.snippet || "",
  ].filter((x) => x !== null);
  return lines.join("\n").slice(0, 50_000);
}

async function findIssueForThread(
  threadId: string
): Promise<{ issueId: string; boardId: string } | null> {
  const { rows } = await cloudSqlPool.query<{
    work_issue_id: string;
    project_id: string;
  }>(
    `SELECT m.work_issue_id, i.project_id
     FROM support_mail_messages m
     JOIN work_issues i ON i.id = m.work_issue_id
     WHERE m.gmail_thread_id = $1
     ORDER BY m.created_at ASC
     LIMIT 1`,
    [threadId]
  );
  if (!rows[0]) return null;
  return { issueId: rows[0].work_issue_id, boardId: rows[0].project_id };
}

async function messageAlreadyProcessed(messageId: string): Promise<boolean> {
  const { rows } = await cloudSqlPool.query<{ id: string }>(
    `SELECT id FROM support_mail_messages WHERE gmail_message_id = $1 LIMIT 1`,
    [messageId]
  );
  return rows.length > 0;
}

async function recordMailMessage(input: {
  message: GmailParsedMessage;
  customerId: string | null;
  matchKind: "exact" | "domain" | "inbox" | "thread";
  workIssueId: string;
}): Promise<void> {
  await cloudSqlPool.query(
    `INSERT INTO support_mail_messages (
       gmail_message_id, gmail_thread_id, from_email, subject, received_at,
       customer_id, match_kind, work_issue_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (gmail_message_id) DO NOTHING`,
    [
      input.message.id,
      input.message.threadId,
      input.message.fromEmail,
      input.message.subject.slice(0, 500),
      input.message.receivedAt,
      input.customerId,
      input.matchKind,
      input.workIssueId,
    ]
  );
}

async function resolveTargetBoard(input: {
  actorAppUserId: string;
  fromEmail: string;
}): Promise<{
  boardId: string;
  customerId: string;
  mappedCustomerId: string | null;
  matchKind: "exact" | "domain" | "inbox";
  customerName: string;
}> {
  const match = await matchCustomerForSupportMail(input.fromEmail);
  if (match) {
    const contract = await fetchActiveSupportContractForCustomer(
      match.customerId
    );
    if (contract) {
      const boardId = await ensureSupportWorkProject({
        customerId: match.customerId,
        actorAppUserId: input.actorAppUserId,
        contractId: contract.id,
      });
      const customer = await getCustomerById(match.customerId);
      return {
        boardId,
        customerId: match.customerId,
        mappedCustomerId: match.customerId,
        matchKind: match.kind,
        customerName: customer?.name?.trim() || "Unknown customer",
      };
    }
  }

  const inbox = await ensureSupportInboxBoard({
    actorAppUserId: input.actorAppUserId,
  });
  if (match) {
    const customer = await getCustomerById(match.customerId);
    return {
      boardId: inbox.boardId,
      customerId: inbox.customerId,
      mappedCustomerId: match.customerId,
      matchKind: "inbox",
      customerName: customer?.name?.trim()
        ? `${customer.name.trim()} (inbox)`
        : "Support Inbox",
    };
  }

  return {
    boardId: inbox.boardId,
    customerId: inbox.customerId,
    mappedCustomerId: null,
    matchKind: "inbox",
    customerName: "Support Inbox",
  };
}

async function createCaseFromMessage(input: {
  actorAppUserId: string;
  message: GmailParsedMessage;
  boardId: string;
  customerId: string;
  mappedCustomerId: string | null;
  matchKind: "exact" | "domain" | "inbox";
  customerName: string;
}): Promise<string> {
  const statuses = await fetchWorkBoardStatuses(input.boardId);
  const status = statuses[0]?.id;
  if (!status) throw new Error("Target support board has no columns");

  const title = caseTitleFromSubject(input.message.subject);
  const issueId = await insertWorkIssue({
    boardId: input.boardId,
    title,
    status,
    createdByAppUserId: input.actorAppUserId,
    description: caseDescription(input.message),
    issueType: "issue",
    ownerAppUserId: null,
  });

  await insertWorkIssueReference({
    boardId: input.boardId,
    issueId,
    url: input.message.permalink,
    label: "Gmail",
    actorAppUserId: input.actorAppUserId,
  });

  await recordMailMessage({
    message: input.message,
    customerId: input.mappedCustomerId,
    matchKind: input.matchKind,
    workIssueId: issueId,
  });

  await notifySupportCaseCreated({
    customerId: input.customerId,
    customerName: input.customerName,
    issueId,
    title,
    createdByName: `Mail (${input.message.fromEmail})`,
  });

  return issueId;
}

/**
 * Poll support@ inbox → create Work support cases (or append to thread).
 */
export async function syncSupportMail(input?: {
  dryRun?: boolean;
  maxResults?: number;
}): Promise<SupportMailSyncResult> {
  const dryRun = Boolean(input?.dryRun);
  const actorAppUserId = mailActorAppUserId();
  const result: SupportMailSyncResult = {
    dryRun,
    scanned: 0,
    created: 0,
    threaded: 0,
    skipped: 0,
    labeled: 0,
    errors: [],
    details: [],
  };

  const listed = await listUnprocessedInboxMessages({
    maxResults: input?.maxResults ?? 25,
  });
  result.scanned = listed.length;

  let labelId: string | null = null;
  if (!dryRun) {
    labelId = await ensureSupportMailLabelId();
  }

  for (const item of listed) {
    try {
      if (await messageAlreadyProcessed(item.id)) {
        result.skipped += 1;
        result.details.push({
          messageId: item.id,
          action: "already_processed",
        });
        if (!dryRun && labelId) {
          await applySupportMailLabel(item.id, labelId);
          result.labeled += 1;
        }
        continue;
      }

      const message = await getGmailMessage(item.id);

      if (shouldSkipSender(message.fromEmail)) {
        result.skipped += 1;
        result.details.push({
          messageId: item.id,
          action: "skip_sender",
          fromEmail: message.fromEmail,
          subject: message.subject,
        });
        if (!dryRun && labelId) {
          await applySupportMailLabel(item.id, labelId);
          result.labeled += 1;
        }
        continue;
      }

      const existingThread = await findIssueForThread(message.threadId);
      if (existingThread) {
        if (dryRun) {
          result.threaded += 1;
          result.details.push({
            messageId: item.id,
            action: "would_append_thread",
            fromEmail: message.fromEmail,
            subject: message.subject,
            issueId: existingThread.issueId,
            matchKind: "thread",
          });
          continue;
        }

        const commentBody = [
          `Follow-up email from ${message.fromEmail}`,
          `Subject: ${message.subject}`,
          "",
          message.bodyText || message.snippet || "",
        ].join("\n");

        await insertWorkIssueComment({
          boardId: existingThread.boardId,
          issueId: existingThread.issueId,
          authorAppUserId: actorAppUserId,
          body: commentBody.slice(0, 20_000),
        });
        await recordMailMessage({
          message,
          customerId: null,
          matchKind: "thread",
          workIssueId: existingThread.issueId,
        });
        if (labelId) {
          await applySupportMailLabel(item.id, labelId);
          result.labeled += 1;
        }
        result.threaded += 1;
        result.details.push({
          messageId: item.id,
          action: "appended_thread",
          fromEmail: message.fromEmail,
          subject: message.subject,
          issueId: existingThread.issueId,
          matchKind: "thread",
        });
        continue;
      }

      if (dryRun) {
        const match = await matchCustomerForSupportMail(message.fromEmail);
        let matchKind: string = match?.kind ?? "inbox";
        if (match) {
          const contract = await fetchActiveSupportContractForCustomer(
            match.customerId
          );
          if (!contract) matchKind = "inbox";
        }
        result.created += 1;
        result.details.push({
          messageId: item.id,
          action: "would_create",
          fromEmail: message.fromEmail,
          subject: message.subject,
          customerId: match?.customerId ?? null,
          matchKind,
        });
        continue;
      }

      const target = await resolveTargetBoard({
        actorAppUserId,
        fromEmail: message.fromEmail,
      });

      const issueId = await createCaseFromMessage({
        actorAppUserId,
        message,
        boardId: target.boardId,
        customerId: target.customerId,
        mappedCustomerId: target.mappedCustomerId,
        matchKind: target.matchKind,
        customerName: target.customerName,
      });

      if (labelId) {
        await applySupportMailLabel(item.id, labelId);
        result.labeled += 1;
      }

      result.created += 1;
      result.details.push({
        messageId: item.id,
        action: "created",
        fromEmail: message.fromEmail,
        subject: message.subject,
        customerId: target.mappedCustomerId,
        matchKind: target.matchKind,
        issueId,
      });
    } catch (error) {
      const errMessage =
        error instanceof Error ? error.message : "Unknown sync error";
      result.errors.push({ messageId: item.id, error: errMessage });
      result.details.push({
        messageId: item.id,
        action: "error",
      });
      console.error("[supportMailSync]", item.id, error);
    }
  }

  return result;
}
