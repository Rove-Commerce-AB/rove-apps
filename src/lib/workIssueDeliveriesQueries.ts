import type { PoolClient } from "pg";

/**
 * When a fixed-price (t-shirt) issue enters Done: snapshot size + resolved price.
 * When it leaves Done: reverse the active delivery so re-Done can deliver again.
 * No-op when project is not tshirt+fixed_price, size/price missing, or status
 * did not cross the Done boundary.
 */
export async function syncWorkIssueDeliveryOnStatusChange(
  client: PoolClient,
  input: {
    boardId: string;
    issueId: string;
    previousStatusId: string;
    nextStatusId: string;
  }
): Promise<"delivered" | "reversed" | "noop"> {
  if (input.previousStatusId === input.nextStatusId) return "noop";

  const { rows: meta } = await client.query<{
    estimate_unit: string;
    fixed_price_enabled: boolean;
    prev_done: boolean;
    next_done: boolean;
  }>(
    `SELECT
       wp.estimate_unit,
       COALESCE(wp.fixed_price_enabled, false) AS fixed_price_enabled,
       COALESCE(prev.is_done, false) AS prev_done,
       COALESCE(next.is_done, false) AS next_done
     FROM work_projects wp
     LEFT JOIN work_project_statuses prev
       ON prev.id = $2 AND prev.project_id = wp.id
     LEFT JOIN work_project_statuses next
       ON next.id = $3 AND next.project_id = wp.id
     WHERE wp.id = $1`,
    [input.boardId, input.previousStatusId, input.nextStatusId]
  );

  const board = meta[0];
  if (
    !board ||
    board.estimate_unit !== "tshirt" ||
    board.fixed_price_enabled !== true
  ) {
    return "noop";
  }

  const enteringDone = !board.prev_done && board.next_done;
  const leavingDone = board.prev_done && !board.next_done;

  if (enteringDone) {
    return (await insertDeliveryIfPriced(client, input.boardId, input.issueId))
      ? "delivered"
      : "noop";
  }

  if (leavingDone) {
    return (await reverseActiveDelivery(client, input.issueId))
      ? "reversed"
      : "noop";
  }

  return "noop";
}

/** Reverse any active delivery (e.g. issue moved to another Work project). */
export async function reverseActiveWorkIssueDelivery(
  client: PoolClient,
  issueId: string
): Promise<boolean> {
  return reverseActiveDelivery(client, issueId);
}

async function insertDeliveryIfPriced(
  client: PoolClient,
  boardId: string,
  issueId: string
): Promise<boolean> {
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

  // Unique partial index enforces one active delivery; ignore races.
  const inserted = await client.query(
    `INSERT INTO work_issue_deliveries (
       issue_id, work_project_id, size, amount, currency
     )
     SELECT $1, $2, $3, $4, $5
     WHERE NOT EXISTS (
       SELECT 1 FROM work_issue_deliveries
       WHERE issue_id = $1 AND reversed_at IS NULL
     )`,
    [issueId, boardId, row.size, Number(row.amount), row.currency]
  );

  return (inserted.rowCount ?? 0) > 0;
}

async function reverseActiveDelivery(
  client: PoolClient,
  issueId: string
): Promise<boolean> {
  const result = await client.query(
    `UPDATE work_issue_deliveries
     SET reversed_at = now()
     WHERE issue_id = $1
       AND reversed_at IS NULL`,
    [issueId]
  );
  return (result.rowCount ?? 0) > 0;
}
