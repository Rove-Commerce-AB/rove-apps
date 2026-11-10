import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";

/** Mark case as awaiting staff after customer follow-up mail. */
export async function markSupportAwaitingStaff(
  issueId: string,
  at: Date = new Date()
): Promise<void> {
  await cloudSqlPool.query(
    `UPDATE work_issues
     SET support_awaiting_staff_at = GREATEST(
       COALESCE(support_awaiting_staff_at, '-infinity'::timestamptz),
       $2::timestamptz
     )
     WHERE id = $1`,
    [issueId, at.toISOString()]
  );
}

/** Clear awaiting-staff after staff email reply or visible comment. */
export async function clearSupportAwaitingStaff(
  issueId: string
): Promise<void> {
  await cloudSqlPool.query(
    `UPDATE work_issues
     SET support_awaiting_staff_at = NULL
     WHERE id = $1
       AND support_awaiting_staff_at IS NOT NULL`,
    [issueId]
  );
}
