import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { supportCaseViewUrl } from "@/lib/supportCaseRef";
import { workIssueKey } from "@/lib/workIssueKey";

/** Matches monitoring.slack_notifications.name in prod (Support Slack Alert). */
export const SUPPORT_SLACK_ALERT_NAME = "Support Slack Alert";

async function fetchSupportSlackWebhookUrl(): Promise<string | null> {
  const { rows } = await cloudSqlPool.query<{ webhook_url: string }>(
    `SELECT webhook_url
     FROM monitoring.slack_notifications
     WHERE lower(btrim(name)) = lower(btrim($1))
     LIMIT 1`,
    [SUPPORT_SLACK_ALERT_NAME]
  );
  const url = rows[0]?.webhook_url?.trim();
  return url || null;
}

async function fetchCaseKey(issueId: string): Promise<string | null> {
  const { rows } = await cloudSqlPool.query<{
    number: number;
    prefix: string;
  }>(
    `SELECT i.number, p.prefix
     FROM work_issues i
     JOIN work_projects p ON p.id = i.project_id
     WHERE i.id = $1::uuid`,
    [issueId]
  );
  const row = rows[0];
  if (!row) return null;
  return workIssueKey(row.prefix, row.number);
}

function snippetText(raw: string | undefined, max = 160): string | null {
  const cleaned = (raw || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

async function postSupportSlackText(input: {
  customerId: string;
  text: string;
  logLabel: string;
}): Promise<void> {
  const webhookUrl = await fetchSupportSlackWebhookUrl();
  if (!webhookUrl) {
    console.warn(
      `[supportCaseSlack] No Support Slack Alert webhook row; skipping ${input.logLabel}`,
      { customerId: input.customerId }
    );
    return;
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: input.text }),
  });

  if (!res.ok) {
    console.error("[supportCaseSlack] Slack webhook HTTP error", {
      status: res.status,
      customerId: input.customerId,
      logLabel: input.logLabel,
    });
  }
}

function buildCaseCreatedText(input: {
  customerName: string;
  caseKey: string;
  title: string;
  createdByName: string;
  casesUrl: string | null;
}): string {
  const lines = [
    `*New support case*`,
    `*Customer:* ${input.customerName}`,
    `*Case:* ${input.caseKey}`,
    `*Title:* ${input.title}`,
    `*Created by:* ${input.createdByName}`,
  ];
  if (input.casesUrl) {
    lines.push(`<${input.casesUrl}|Open incidents>`);
  }
  return lines.join("\n");
}

function buildCustomerReplyText(input: {
  customerName: string;
  caseKey: string;
  title: string;
  repliedByName: string;
  channel: "mail" | "comment";
  snippet: string | null;
  casesUrl: string | null;
}): string {
  const via = input.channel === "mail" ? "email" : "comment";
  const lines = [
    `*Customer reply* (${via})`,
    `*Customer:* ${input.customerName}`,
    `*Case:* ${input.caseKey}`,
    `*Title:* ${input.title}`,
    `*From:* ${input.repliedByName}`,
  ];
  if (input.snippet) {
    lines.push(`*Message:* ${input.snippet}`);
  }
  if (input.casesUrl) {
    lines.push(`<${input.casesUrl}|Open incidents>`);
  }
  return lines.join("\n");
}

/**
 * Fire-and-forget Slack ping for a new support case.
 * Uses the shared Support Slack Alert webhook row (same destination as monitor Support alerts).
 * Failures are logged only — never thrown to the caller.
 */
export async function notifySupportCaseCreated(input: {
  customerId: string;
  customerName: string;
  issueId: string;
  title: string;
  createdByName: string;
}): Promise<void> {
  try {
    const caseKey = await fetchCaseKey(input.issueId);
    if (!caseKey) {
      console.warn(
        "[supportCaseSlack] Issue missing after create; skipping notify",
        { issueId: input.issueId }
      );
      return;
    }

    const text = buildCaseCreatedText({
      customerName: input.customerName,
      caseKey,
      title: input.title,
      createdByName: input.createdByName,
      casesUrl: supportCaseViewUrl(input.customerId, input.issueId),
    });

    await postSupportSlackText({
      customerId: input.customerId,
      text,
      logLabel: "created",
    });
  } catch (error) {
    console.error("[supportCaseSlack] Slack notify failed", {
      customerId: input.customerId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Slack ping when a customer replies on an existing case (mail follow-up or in-app comment).
 * Staff/internal replies must not call this. Failures are logged only.
 */
export async function notifySupportCaseCustomerReply(input: {
  customerId: string;
  customerName: string;
  issueId: string;
  title: string;
  repliedByName: string;
  channel: "mail" | "comment";
  body?: string;
}): Promise<void> {
  try {
    const caseKey = await fetchCaseKey(input.issueId);
    if (!caseKey) {
      console.warn(
        "[supportCaseSlack] Issue missing for customer reply; skipping notify",
        { issueId: input.issueId }
      );
      return;
    }

    const text = buildCustomerReplyText({
      customerName: input.customerName,
      caseKey,
      title: input.title,
      repliedByName: input.repliedByName,
      channel: input.channel,
      snippet: snippetText(input.body),
      casesUrl: supportCaseViewUrl(input.customerId, input.issueId),
    });

    await postSupportSlackText({
      customerId: input.customerId,
      text,
      logLabel: "customer-reply",
    });
  } catch (error) {
    console.error("[supportCaseSlack] Customer reply Slack notify failed", {
      customerId: input.customerId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
