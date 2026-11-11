import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";

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

export function buildSupportCaseAckBody(ref: string): string {
  return [
    "Thank you for your email.",
    "",
    `We have registered your request as ${ref}.`,
    "We will get back to you as soon as we can.",
    "",
    "—",
    "Rove Support",
  ].join("\n");
}
