import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { supportIncidentsHref } from "@/lib/routes";

function appOrigin(): string | null {
  const raw = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (!raw?.trim()) return null;
  try {
    return new URL(raw.trim()).origin;
  } catch {
    return null;
  }
}

/** Absolute URL to the Support incidents list focused on a case (requires login). */
export function supportCaseViewUrl(
  customerId: string,
  issueId: string
): string | null {
  const origin = appOrigin();
  if (!origin || !customerId || !issueId) return null;
  const base = supportIncidentsHref(customerId);
  const sep = base.includes("?") ? "&" : "?";
  return `${origin}${base}${sep}case=${encodeURIComponent(issueId)}`;
}

/** Append a "View your case" line when a URL is available. */
export function withSupportCaseViewLink(
  body: string,
  caseUrl: string | null | undefined
): string {
  const trimmed = body.trimEnd();
  if (!caseUrl?.trim()) return trimmed;
  return `${trimmed}\n\nView your case: ${caseUrl.trim()}`;
}

/** Display form for a stable Support case number. */
export function formatSupportCaseRef(number: number): string {
  return `SUP-${number}`;
}

export function parseSupportCaseRef(
  value: string | null | undefined
): number | null {
  if (!value) return null;
  const match = value.trim().match(/^SUP-(\d+)$/i);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Append [SUP-n] to a subject once. */
export function withSupportCaseRefInSubject(
  subject: string,
  ref: string
): string {
  const base = subject.trim() || "(no subject)";
  const token = `[${ref}]`;
  if (base.includes(token)) return base;
  return `${base} ${token}`;
}

/**
 * Allocate a new SUP number on an issue (no-op if already set).
 * Returns the display ref (SUP-n).
 */
export async function assignSupportCaseRef(issueId: string): Promise<string> {
  const { rows } = await cloudSqlPool.query<{
    support_case_number: string | number | null;
  }>(
    `UPDATE work_issues
     SET support_case_number = COALESCE(
       support_case_number,
       nextval('support_case_ref_seq')
     )
     WHERE id = $1
     RETURNING support_case_number`,
    [issueId]
  );
  const n = Number(rows[0]?.support_case_number);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Failed to allocate support case reference");
  }
  return formatSupportCaseRef(n);
}

export async function fetchSupportCaseRef(
  issueId: string
): Promise<string | null> {
  const { rows } = await cloudSqlPool.query<{
    support_case_number: string | number | null;
  }>(`SELECT support_case_number FROM work_issues WHERE id = $1`, [issueId]);
  const n = Number(rows[0]?.support_case_number);
  if (!Number.isFinite(n) || n <= 0) return null;
  return formatSupportCaseRef(n);
}

/** Claim the ack slot (returns false if already claimed). */
export async function markSupportAckSent(issueId: string): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `UPDATE work_issues
     SET support_ack_sent_at = COALESCE(support_ack_sent_at, now())
     WHERE id = $1
       AND support_ack_sent_at IS NULL`,
    [issueId]
  );
  return (result.rowCount ?? 0) === 1;
}

/** Clear claim after a failed send so sync can retry. */
export async function clearSupportAckSent(issueId: string): Promise<void> {
  await cloudSqlPool.query(
    `UPDATE work_issues SET support_ack_sent_at = NULL WHERE id = $1`,
    [issueId]
  );
}

export function buildSupportCaseAckBody(
  ref: string,
  caseUrl?: string | null
): string {
  const lines = [
    "Thank you for your email.",
    "",
    `We have registered your request as ${ref}.`,
    "We will get back to you as soon as we can.",
  ];
  if (caseUrl?.trim()) {
    lines.push("", `View your case: ${caseUrl.trim()}`);
  }
  lines.push("", "—", "Rove Support");
  return lines.join("\n");
}
