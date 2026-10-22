import "server-only";

import { withCloudSqlTransaction } from "@/lib/cloudSqlPool";
import {
  fetchStaffAppUserIdsForCustomer,
  setSupportContractWorkProject,
} from "@/lib/supportContractsQueries";
import { SUPPORT_WORK_PROJECT_STATUSES } from "@/lib/workStatuses";

const SUPPORT_TITLE = "Support";
const SUPPORT_PREFIX = "SUP";

type QueryClient = {
  query: <T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: T[] }>;
};

/**
 * Ensure exactly one support Work project for the customer, linked to a
 * customer master-data project named "Support" (for time reporting).
 * Reuses / restores the support Work board; never creates a second one.
 * Status columns stay aligned with SUPPORT_WORK_PROJECT_STATUSES.
 */
export async function ensureSupportWorkProject(input: {
  customerId: string;
  actorAppUserId: string;
  contractId: string;
}): Promise<string> {
  const staffIds = await fetchStaffAppUserIdsForCustomer(input.customerId);
  const memberIds = [...new Set([input.actorAppUserId, ...staffIds])];

  return withCloudSqlTransaction("support-board-ensure", async (client) => {
    const { rows: active } = await client.query<{ id: string }>(
      `SELECT id
       FROM work_projects
       WHERE customer_id = $1
         AND is_support_board
         AND archived_at IS NULL
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE`,
      [input.customerId]
    );
    if (active[0]) {
      await syncSupportBoardStatuses(client, active[0].id);
      await ensureLinkedPlannerSupportProject(client, input.customerId, active[0].id);
      await setSupportContractWorkProject(
        input.contractId,
        active[0].id,
        client
      );
      return active[0].id;
    }

    const { rows: archived } = await client.query<{ id: string }>(
      `SELECT id
       FROM work_projects
       WHERE customer_id = $1
         AND is_support_board
         AND archived_at IS NOT NULL
       ORDER BY archived_at DESC
       LIMIT 1
       FOR UPDATE`,
      [input.customerId]
    );
    if (archived[0]) {
      await client.query(
        `UPDATE work_projects
         SET archived_at = NULL, updated_at = now()
         WHERE id = $1`,
        [archived[0].id]
      );
      await syncSupportBoardStatuses(client, archived[0].id);
      await ensureLinkedPlannerSupportProject(
        client,
        input.customerId,
        archived[0].id
      );
      await setSupportContractWorkProject(
        input.contractId,
        archived[0].id,
        client
      );
      return archived[0].id;
    }

    const plannerProjectId = await ensurePlannerSupportProject(
      client,
      input.customerId
    );
    const prefix = await nextSupportPrefix(client, input.customerId);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO work_projects (
         customer_id, title, prefix, created_by_app_user_id, is_support_board,
         planner_project_id
       ) VALUES ($1, $2, $3, $4, true, $5)
       RETURNING id`,
      [
        input.customerId,
        SUPPORT_TITLE,
        prefix,
        input.actorAppUserId,
        plannerProjectId,
      ]
    );
    const boardId = rows[0]?.id;
    if (!boardId) throw new Error("Failed to create support project");

    if (memberIds.length > 0) {
      await client.query(
        `INSERT INTO work_project_members (project_id, app_user_id)
         SELECT $1, unnest($2::uuid[])
         ON CONFLICT DO NOTHING`,
        [boardId, memberIds]
      );
    }

    await insertSupportStatuses(client, boardId);
    await setSupportContractWorkProject(input.contractId, boardId, client);
    return boardId;
  });
}

/**
 * Reuse an existing customer project named Support when free to link;
 * otherwise create one (hourly). No-op if the Work board is already linked (3C).
 */
async function ensureLinkedPlannerSupportProject(
  client: QueryClient,
  customerId: string,
  workBoardId: string
): Promise<void> {
  const { rows: boardRows } = await client.query<{
    planner_project_id: string | null;
  }>(`SELECT planner_project_id FROM work_projects WHERE id = $1`, [
    workBoardId,
  ]);
  if (boardRows[0]?.planner_project_id) return;

  const plannerProjectId = await ensurePlannerSupportProject(client, customerId);
  await client.query(
    `UPDATE work_projects
     SET planner_project_id = $2, updated_at = now()
     WHERE id = $1
       AND planner_project_id IS NULL`,
    [workBoardId, plannerProjectId]
  );
}

async function ensurePlannerSupportProject(
  client: QueryClient,
  customerId: string
): Promise<string> {
  const { rows: existing } = await client.query<{ id: string; is_active: boolean }>(
    `SELECT p.id, p.is_active
     FROM projects p
     WHERE p.customer_id = $1
       AND lower(btrim(p.name)) = lower($2)
       AND p.type <> 'absence'
       AND NOT EXISTS (
         SELECT 1
         FROM work_projects wp
         WHERE wp.planner_project_id = p.id
       )
     ORDER BY p.is_active DESC, p.created_at ASC
     LIMIT 1
     FOR UPDATE`,
    [customerId, SUPPORT_TITLE]
  );

  if (existing[0]) {
    if (!existing[0].is_active) {
      await client.query(
        `UPDATE projects SET is_active = true WHERE id = $1`,
        [existing[0].id]
      );
    }
    return existing[0].id;
  }

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO projects (
       name, customer_id, is_active, type, billing_type, probability
     ) VALUES ($1, $2, true, 'customer', 'hourly', 100)
     RETURNING id`,
    [SUPPORT_TITLE, customerId]
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("Failed to create Support customer project");
  return id;
}

async function insertSupportStatuses(client: QueryClient, projectId: string) {
  for (const [index, status] of SUPPORT_WORK_PROJECT_STATUSES.entries()) {
    await client.query(
      `INSERT INTO work_project_statuses (project_id, name, sort_order, is_done)
       VALUES ($1, $2, $3, $4)`,
      [projectId, status.name, index, status.isDone]
    );
  }
}

async function syncSupportBoardStatuses(
  client: QueryClient,
  projectId: string
) {
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
  const issueCount = issueRows[0]?.n ?? 0;

  if (issueCount === 0) {
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

async function nextSupportPrefix(
  client: QueryClient,
  customerId: string
): Promise<string> {
  const { rows } = await client.query<{ prefix: string }>(
    `SELECT prefix FROM work_projects WHERE customer_id = $1`,
    [customerId]
  );
  const taken = new Set(rows.map((row) => row.prefix.toUpperCase()));
  if (!taken.has(SUPPORT_PREFIX)) return SUPPORT_PREFIX;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${SUPPORT_PREFIX}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("Could not allocate a Support issue prefix for this customer");
}
