import type { PoolClient } from "pg";

/**
 * Snapshot size + resolved price when scope is approved on a fixed-price
 * t-shirt board. One active row per issue (partial unique index).
 */
export async function insertWorkIssueScopeApprovalIfPriced(
  client: PoolClient,
  boardId: string,
  issueId: string,
  approvedAt?: Date
): Promise<boolean> {
  const { rows: boardRows } = await client.query<{
    estimate_unit: string;
    fixed_price_enabled: boolean;
  }>(
    `SELECT estimate_unit, COALESCE(fixed_price_enabled, false) AS fixed_price_enabled
     FROM work_projects
     WHERE id = $1`,
    [boardId]
  );
  const board = boardRows[0];
  if (
    !board ||
    board.estimate_unit !== "tshirt" ||
    board.fixed_price_enabled !== true
  ) {
    return false;
  }

  const { rows } = await client.query<{
    size: string;
    amount: string | number;
    currency: string;
  }>(
    `SELECT
       i.estimate_size AS size,
       COALESCE(psp.amount, csp.amount) AS amount,
       COALESCE(psp.currency, csp.currency, c.billing_currency, 'SEK') AS currency
     FROM work_issues i
     JOIN work_projects wp ON wp.id = i.project_id
     JOIN customers c ON c.id = wp.customer_id
     LEFT JOIN project_size_prices psp
       ON psp.project_id = wp.planner_project_id
      AND psp.size = i.estimate_size
     LEFT JOIN customer_size_prices csp
       ON csp.customer_id = wp.customer_id
      AND csp.size = i.estimate_size
     WHERE i.id = $1
       AND i.project_id = $2
       AND i.estimate_size IS NOT NULL
       AND COALESCE(psp.amount, csp.amount) IS NOT NULL`,
    [issueId, boardId]
  );

  const row = rows[0];
  if (!row) return false;

  const inserted = await client.query(
    `INSERT INTO work_issue_scope_approvals (
       issue_id, work_project_id, size, amount, currency, approved_at
     )
     SELECT $1, $2, $3, $4, $5, COALESCE($6::timestamptz, now())
     WHERE NOT EXISTS (
       SELECT 1 FROM work_issue_scope_approvals
       WHERE issue_id = $1 AND reversed_at IS NULL
     )`,
    [
      issueId,
      boardId,
      row.size,
      Number(row.amount),
      row.currency,
      approvedAt ?? null,
    ]
  );

  return (inserted.rowCount ?? 0) > 0;
}

/** Reverse the active scope-approval commitment (Looker EventType unapproved). */
export async function reverseActiveWorkIssueScopeApproval(
  client: PoolClient,
  issueId: string
): Promise<boolean> {
  const result = await client.query(
    `UPDATE work_issue_scope_approvals
     SET reversed_at = now()
     WHERE issue_id = $1
       AND reversed_at IS NULL`,
    [issueId]
  );
  return (result.rowCount ?? 0) > 0;
}
