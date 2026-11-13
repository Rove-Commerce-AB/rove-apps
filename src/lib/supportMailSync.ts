import "server-only";

import { cloudSqlPool, withCloudSqlClient } from "@/lib/cloudSqlPool";
import { getCustomerById } from "@/lib/customers";
import { ensureSupportWorkProject } from "@/lib/supportBoard";
import {
  notifySupportCaseCreated,
  notifySupportCaseCustomerReply,
} from "@/lib/supportCaseSlack";
import { fetchActiveSupportContractForCustomer } from "@/lib/supportContractsQueries";
import {
  applySupportMailLabel,
  ensureSupportMailLabelId,
  getGmailMessage,
  getGmailMessageHeaders,
  listUnprocessedInboxMessages,
  sendGmailThreadReply,
  supportMailboxAddress,
  type GmailParsedMessage,
} from "@/lib/supportMailGmail";
import { ensureSupportInboxBoard } from "@/lib/supportMailInbox";
import {
  matchCustomerForSupportMail,
  shouldSkipSender,
} from "@/lib/supportMailMatch";
import { markSupportAwaitingStaff } from "@/lib/supportAwaitingStaff";
import {
  assignSupportCaseRef,
  buildSupportCaseAckBody,
  clearSupportAckSent,
  markSupportAckSent,
  supportCaseViewUrl,
  withSupportCaseRefInSubject,
} from "@/lib/supportCaseRef";
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

async function findIssueForThread(threadId: string): Promise<{
  issueId: string;
  boardId: string;
  customerId: string;
  customerName: string;
  title: string;
} | null> {
  const { rows } = await cloudSqlPool.query<{
    work_issue_id: string;
    project_id: string;
    customer_id: string;
    customer_name: string | null;
    title: string;
  }>(
    `SELECT m.work_issue_id, i.project_id, p.customer_id, c.name AS customer_name, i.title
     FROM support_mail_messages m
     JOIN work_issues i ON i.id = m.work_issue_id
     JOIN work_projects p ON p.id = i.project_id
     LEFT JOIN customers c ON c.id = p.customer_id
     WHERE m.gmail_thread_id = $1
     ORDER BY m.created_at ASC
     LIMIT 1`,
    [threadId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    issueId: row.work_issue_id,
    boardId: row.project_id,
    customerId: row.customer_id,
    customerName: row.customer_name?.trim() || "Unknown customer",
    title: row.title,
  };
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

async function sendNewCaseAck(input: {
  issueId: string;
  message: GmailParsedMessage;
  mappedCustomerId: string | null;
  /** Customer id for the Support app case link (mapped or board/inbox). */
  linkCustomerId: string;
  supportCaseRef: string;
  actorAppUserId: string;
  boardId: string;
}): Promise<void> {
  if (input.message.suppressAutoReply) return;
  if (shouldSkipSender(input.message.fromEmail)) return;

  const claimed = await markSupportAckSent(input.issueId);
  if (!claimed) return;

  try {
    const headers = await getGmailMessageHeaders(input.message.id);
    const subject = withSupportCaseRefInSubject(
      input.message.subject || headers.subject || "(no subject)",
      input.supportCaseRef
    );
    const caseUrl = supportCaseViewUrl(input.linkCustomerId, input.issueId);
    const bodyText = buildSupportCaseAckBody(input.supportCaseRef, caseUrl);

    const sent = await sendGmailThreadReply({
      threadId: input.message.threadId,
      toEmail: input.message.fromEmail,
      subject,
      bodyText,
      inReplyToMessageId: headers.messageIdHeader,
      references: headers.references,
      autoSubmitted: "auto-replied",
    });

    const replySubject = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
    const commentBody = [
      `Email reply to ${input.message.fromEmail}`,
      `Subject: ${replySubject}`,
      `From: ${supportMailboxAddress()}`,
      "",
      bodyText,
    ].join("\n");

    await insertWorkIssueComment({
      boardId: input.boardId,
      issueId: input.issueId,
      authorAppUserId: input.actorAppUserId,
      body: commentBody.slice(0, 20_000),
    });

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
        input.mappedCustomerId,
        input.issueId,
      ]
    );
  } catch (err) {
    await clearSupportAckSent(input.issueId);
    throw err;
  }
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

  const supportCaseRef = await assignSupportCaseRef(issueId);

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

  try {
    await sendNewCaseAck({
      issueId,
      message: input.message,
      mappedCustomerId: input.mappedCustomerId,
      linkCustomerId: input.mappedCustomerId ?? input.customerId,
      supportCaseRef,
      actorAppUserId: input.actorAppUserId,
      boardId: input.boardId,
    });
  } catch (err) {
    console.error(
      `[supportMailSync] ack failed for ${supportCaseRef}:`,
      err instanceof Error ? err.message : err
    );
  }

  await notifySupportCaseCreated({
    customerId: input.customerId,
    customerName: input.customerName,
    issueId,
    title: `${supportCaseRef}: ${title}`,
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

  const run = async (): Promise<SupportMailSyncResult> => {
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
          await markSupportAwaitingStaff(
            existingThread.issueId,
            message.receivedAt ?? new Date()
          );
          await notifySupportCaseCustomerReply({
            customerId: existingThread.customerId,
            customerName: existingThread.customerName,
            issueId: existingThread.issueId,
            title: existingThread.title,
            repliedByName: `Mail (${message.fromEmail})`,
            channel: "mail",
            body: message.bodyText || message.snippet || message.subject,
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
  };

  // Hold one pooled connection for the advisory lock so unlock hits the same session.
  if (dryRun) {
    return run();
  }

  return withCloudSqlClient("support-mail-sync-lock", async (lockClient) => {
    const { rows: lockRows } = await lockClient.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock(hashtext('support_mail_sync')) AS locked`
    );
    if (!lockRows[0]?.locked) {
      throw new Error("Support mail sync is already running");
    }
    try {
      return await run();
    } finally {
      await lockClient.query(
        `SELECT pg_advisory_unlock(hashtext('support_mail_sync'))`
      );
    }
  });
}
