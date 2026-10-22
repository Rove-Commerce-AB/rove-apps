import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { supportCustomerCasesHref } from "@/lib/routes";
import { workIssueKey } from "@/lib/workIssueKey";

/** Matches monitoring.slack_notifications.name in prod (Support Slack Alert). */
export const SUPPORT_SLACK_ALERT_NAME = "Support Slack Alert";

function appOrigin(): string | null {
  const raw = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (!raw?.trim()) return null;
  try {
    return new URL(raw.trim()).origin;
  } catch {
    return null;
  }
}

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
    lines.push(`<${input.casesUrl}|Open cases>`);
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
    const webhookUrl = await fetchSupportSlackWebhookUrl();
    if (!webhookUrl) {
      console.warn(
        "[supportCaseSlack] No Support Slack Alert webhook row; skipping notify",
        { customerId: input.customerId }
      );
      return;
    }

    const { rows } = await cloudSqlPool.query<{
      number: number;
      prefix: string;
    }>(
      `SELECT i.number, p.prefix
       FROM work_issues i
       JOIN work_projects p ON p.id = i.project_id
       WHERE i.id = $1::uuid`,
      [input.issueId]
    );
    const row = rows[0];
    if (!row) {
      console.warn(
        "[supportCaseSlack] Issue missing after create; skipping notify",
        { issueId: input.issueId }
      );
      return;
    }

    const origin = appOrigin();
    const casesPath = supportCustomerCasesHref(input.customerId);
    const casesUrl = origin ? `${origin}${casesPath}` : null;

    const text = buildCaseCreatedText({
      customerName: input.customerName,
      caseKey: workIssueKey(row.prefix, row.number),
      title: input.title,
      createdByName: input.createdByName,
      casesUrl,
    });

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      console.error("[supportCaseSlack] Slack webhook HTTP error", {
        status: res.status,
        customerId: input.customerId,
      });
    }
  } catch (error) {
    console.error("[supportCaseSlack] Slack notify failed", {
      customerId: input.customerId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
