import "server-only";

import { withCloudSqlTransaction } from "@/lib/cloudSqlPool";
import { SUPPORT_WORK_PROJECT_STATUSES } from "@/lib/workStatuses";

const INBOX_TITLE = "Support Inbox";
const INBOX_PREFIX = "INBOX";

type QueryClient = {
  query: <T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: T[] }>;
};

async function insertSupportStatuses(client: QueryClient, projectId: string) {
  for (const [index, status] of SUPPORT_WORK_PROJECT_STATUSES.entries()) {
    await client.query(
      `INSERT INTO work_project_statuses (project_id, name, sort_order, is_done)
       VALUES ($1, $2, $3, $4)`,
      [projectId, status.name, index, status.isDone]
    );
  }
}

async function syncInboxStatuses(client: QueryClient, projectId: string) {
  const { rows: statuses } = await client.query<{
    id: string;
    name: string;
    is_done: boolean;
  }>(
    `SELECT id, name, is_done
     FROM work_project_statuses
     WHERE project_id = $1
     ORDER BY sort_order, name`,
    [projectId]
  );
  const expected = SUPPORT_WORK_PROJECT_STATUSES;
  const alreadyCorrect =
    statuses.length === expected.length &&
    statuses.every(
      (row, index) =>
        row.name === expected[index].name &&
        row.is_done === expected[index].isDone
    );
  if (alreadyCorrect) return;

  const { rows: issueRows } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM work_issues WHERE project_id = $1`,
    [projectId]
  );
  if ((issueRows[0]?.n ?? 0) === 0) {
    await client.query(
      `DELETE FROM work_project_statuses WHERE project_id = $1`,
      [projectId]
    );
    await insertSupportStatuses(client, projectId);
    return;
  }

  if (statuses.length === expected.length) {
    for (const [index, status] of expected.entries()) {
      await client.query(
        `UPDATE work_project_statuses
         SET name = $2, is_done = $3, sort_order = $4
         WHERE id = $1`,
        [statuses[index].id, status.name, status.isDone, index]
      );
    }
  }
}

async function resolveInternalCustomerId(client: QueryClient): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id
     FROM customers
     WHERE is_internal
       AND is_active
     ORDER BY created_at ASC
     LIMIT 1`
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("No internal customer found for Support Inbox");
  return id;
}

async function fetchSupportStaffIds(client: QueryClient): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT DISTINCT u.id
     FROM app_users u
     JOIN app_user_apps aua ON aua.app_user_id = u.id
     JOIN apps a ON a.id = aua.app_id
     WHERE a.key = 'support'
       AND u.role IN ('admin', 'member')
     ORDER BY u.id`
  );
  return rows.map((r) => r.id);
}

/**
 * Ensure the shared Support Inbox Work board on the internal customer.
 * Unmatched (and unmatched-contract) mail lands here.
 */
export async function ensureSupportInboxBoard(input: {
  actorAppUserId: string;
}): Promise<{ boardId: string; customerId: string }> {
  return withCloudSqlTransaction("support-inbox-ensure", async (client) => {
    const { rows: existing } = await client.query<{
      id: string;
      customer_id: string;
    }>(
      `SELECT id, customer_id
       FROM work_projects
       WHERE is_support_inbox
         AND archived_at IS NULL
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE`
    );
    if (existing[0]) {
      await syncInboxStatuses(client, existing[0].id);
      return {
        boardId: existing[0].id,
        customerId: existing[0].customer_id,
      };
    }

    const customerId = await resolveInternalCustomerId(client);
    const staffIds = await fetchSupportStaffIds(client);
    const memberIds = [...new Set([input.actorAppUserId, ...staffIds])];

    const { rows: prefixRows } = await client.query<{ prefix: string }>(
      `SELECT prefix FROM work_projects WHERE customer_id = $1`,
      [customerId]
    );
    const taken = new Set(prefixRows.map((r) => r.prefix.toUpperCase()));
    let prefix = INBOX_PREFIX;
    if (taken.has(prefix)) {
      for (let n = 2; n < 100; n += 1) {
        const candidate = `${INBOX_PREFIX}${n}`;
        if (!taken.has(candidate)) {
          prefix = candidate;
          break;
        }
      }
    }

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO work_projects (
         customer_id, title, prefix, created_by_app_user_id,
         is_support_board, is_support_inbox
       ) VALUES ($1, $2, $3, $4, true, true)
       RETURNING id`,
      [customerId, INBOX_TITLE, prefix, input.actorAppUserId]
    );
    const boardId = rows[0]?.id;
    if (!boardId) throw new Error("Failed to create Support Inbox board");

    if (memberIds.length > 0) {
      await client.query(
        `INSERT INTO work_project_members (project_id, app_user_id)
         SELECT $1, unnest($2::uuid[])
         ON CONFLICT DO NOTHING`,
        [boardId, memberIds]
      );
    }

    await insertSupportStatuses(client, boardId);
    return { boardId, customerId };
  });
}
