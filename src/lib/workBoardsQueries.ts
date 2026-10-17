import { cloudSqlPool, withCloudSqlTransaction } from "@/lib/cloudSqlPool";
import { DEFAULT_WORK_PROJECT_STATUSES } from "@/lib/workStatuses";
import type { WorkBoardStatus } from "@/lib/workStatuses";

export type WorkBoardRow = {
  id: string;
  customer_id: string;
  title: string;
  prefix: string;
  planner_project_id: string | null;
  created_by_app_user_id: string;
  created_at: Date;
  updated_at: Date;
  member_ids: string[];
};

export type WorkCustomerRow = {
  id: string;
  name: string;
  color: string | null;
  url: string | null;
  is_internal: boolean;
  is_active: boolean;
};

export async function fetchActiveCustomersByIds(
  customerIds: string[]
): Promise<WorkCustomerRow[]> {
  const unique = [...new Set(customerIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const { rows } = await cloudSqlPool.query<WorkCustomerRow>(
    `SELECT id, name, color, url, is_internal, is_active
     FROM customers
     WHERE id = ANY($1::uuid[])
       AND is_active = true
     ORDER BY is_internal DESC, lower(name)`,
    [unique]
  );
  return rows;
}

export async function fetchActiveCustomers(): Promise<WorkCustomerRow[]> {
  const { rows } = await cloudSqlPool.query<WorkCustomerRow>(
    `SELECT id, name, color, url, is_internal, is_active
     FROM customers
     WHERE is_active = true
     ORDER BY is_internal DESC, lower(name)`
  );
  return rows;
}

export async function fetchWorkBoardsForCustomerIds(
  customerIds: string[],
  options?: { archived?: boolean }
): Promise<WorkBoardRow[]> {
  const unique = [...new Set(customerIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const archived = options?.archived === true;
  const { rows } = await cloudSqlPool.query<
    Omit<WorkBoardRow, "member_ids"> & { member_ids: string[] | null }
  >(
    `SELECT
       b.id,
       b.customer_id,
       b.title,
       b.prefix,
       b.planner_project_id,
       b.created_by_app_user_id,
       b.created_at,
       b.updated_at,
       COALESCE(
         array_agg(m.app_user_id::text) FILTER (WHERE m.app_user_id IS NOT NULL),
         ARRAY[]::text[]
       ) AS member_ids
     FROM work_projects b
     LEFT JOIN work_project_members m ON m.project_id = b.id
     WHERE b.customer_id = ANY($1::uuid[])
       AND ${archived ? "b.archived_at IS NOT NULL" : "b.archived_at IS NULL"}
     GROUP BY b.id
     ORDER BY lower(b.title)`,
    [unique]
  );
  return rows.map((row) => ({
    ...row,
    member_ids: row.member_ids ?? [],
  }));
}

/** Active Work project linked to a planner project, if any. */
export async function fetchWorkProjectByPlannerProjectId(
  plannerProjectId: string
): Promise<{ id: string; customerId: string } | null> {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    customer_id: string;
  }>(
    `SELECT id, customer_id
     FROM work_projects
     WHERE planner_project_id = $1
       AND archived_at IS NULL
     LIMIT 1`,
    [plannerProjectId]
  );
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, customerId: row.customer_id };
}

export async function fetchWorkBoardById(
  boardId: string
): Promise<
  (WorkBoardRow & {
    agents_md: string;
    customer_name: string;
    customer_is_internal: boolean;
    work_show_time_to_customer_users: boolean;
    planner_project_name: string | null;
  }) | null
> {
  const { rows } = await cloudSqlPool.query<
    Omit<WorkBoardRow, "member_ids"> & {
      agents_md: string;
      member_ids: string[] | null;
      customer_name: string;
      customer_is_internal: boolean;
      work_show_time_to_customer_users: boolean;
      planner_project_name: string | null;
    }
  >(
    `SELECT
       b.id,
       b.customer_id,
       b.title,
       b.prefix,
       b.planner_project_id,
       b.created_by_app_user_id,
       b.created_at,
       b.updated_at,
       b.agents_md,
       c.name AS customer_name,
       c.is_internal AS customer_is_internal,
       c.work_show_time_to_customer_users,
       p.name AS planner_project_name,
       COALESCE(
         array_agg(m.app_user_id::text) FILTER (WHERE m.app_user_id IS NOT NULL),
         ARRAY[]::text[]
       ) AS member_ids
     FROM work_projects b
     JOIN customers c ON c.id = b.customer_id
     LEFT JOIN projects p ON p.id = b.planner_project_id
     LEFT JOIN work_project_members m ON m.project_id = b.id
     WHERE b.id = $1
       AND b.archived_at IS NULL
     GROUP BY b.id, c.name, c.is_internal, c.work_show_time_to_customer_users, p.name`,
    [boardId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    member_ids: row.member_ids ?? [],
  };
}

export async function linkWorkBoardToPlannerProject(
  boardId: string,
  plannerProjectId: string
): Promise<{ plannerProjectId: string; plannerProjectName: string }> {
  const { rows } = await cloudSqlPool.query<{
    planner_project_id: string;
    planner_project_name: string;
  }>(
    `UPDATE work_projects wp
     SET planner_project_id = p.id
     FROM projects p
     WHERE wp.id = $1
       AND wp.archived_at IS NULL
       AND wp.planner_project_id IS NULL
       AND p.id = $2
       AND p.customer_id = wp.customer_id
       AND p.is_active = true
       AND p.type <> 'absence'
     RETURNING wp.planner_project_id, p.name AS planner_project_name`,
    [boardId, plannerProjectId]
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Could not link project");
  }
  return {
    plannerProjectId: row.planner_project_id,
    plannerProjectName: row.planner_project_name,
  };
}

export async function insertWorkBoard(input: {
  customerId: string;
  title: string;
  prefix: string;
  createdByAppUserId: string;
  memberAppUserIds: string[];
  plannerProjectId?: string | null;
}): Promise<string> {
  const memberIds = [...new Set([input.createdByAppUserId, ...input.memberAppUserIds])].filter(
    Boolean
  );
  return withCloudSqlTransaction("work-create-board", async (client) => {
    if (input.plannerProjectId) {
      const { rows: plannerRows } = await client.query<{
        id: string;
        customer_id: string;
      }>(
        `SELECT id, customer_id FROM projects WHERE id = $1`,
        [input.plannerProjectId]
      );
      const planner = plannerRows[0];
      if (!planner || planner.customer_id !== input.customerId) {
        throw new Error("Customer project not found");
      }
      const { rows: linked } = await client.query<{ id: string }>(
        `SELECT id FROM work_projects
         WHERE planner_project_id = $1
         LIMIT 1`,
        [input.plannerProjectId]
      );
      if (linked[0]) {
        throw new Error("That customer project already has a Work project");
      }
    }

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO work_projects (
         customer_id, title, prefix, created_by_app_user_id, planner_project_id
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        input.customerId,
        input.title,
        input.prefix,
        input.createdByAppUserId,
        input.plannerProjectId ?? null,
      ]
    );
    const boardId = rows[0]?.id;
    if (!boardId) throw new Error("Failed to create project");
    if (memberIds.length > 0) {
      await client.query(
        `INSERT INTO work_project_members (project_id, app_user_id)
         SELECT $1, unnest($2::uuid[])`,
        [boardId, memberIds]
      );
    }
    await insertDefaultWorkBoardStatuses(client, boardId);
    return boardId;
  });
}

export async function renameWorkBoard(
  boardId: string,
  title: string
): Promise<string> {
  const { rows } = await cloudSqlPool.query<{ title: string }>(
    `UPDATE work_projects
     SET title = $2
     WHERE id = $1 AND archived_at IS NULL
     RETURNING title`,
    [boardId, title]
  );
  const next = rows[0]?.title;
  if (!next) throw new Error("Project not found");
  return next;
}

export async function updateWorkProjectInstructions(projectId: string, agentsMd: string): Promise<string> {
  const { rows } = await cloudSqlPool.query<{ agents_md: string }>(
    `UPDATE work_projects
     SET agents_md = $2
     WHERE id = $1 AND archived_at IS NULL
     RETURNING agents_md`,
    [projectId, agentsMd]
  );
  const project = rows[0];

  if (!project) {
    throw new Error("Project not found");
  }

  return project.agents_md;
}

export async function archiveWorkBoard(boardId: string): Promise<void> {
  const { rowCount } = await cloudSqlPool.query(
    `UPDATE work_projects
     SET archived_at = now()
     WHERE id = $1 AND archived_at IS NULL`,
    [boardId]
  );
  if (!rowCount) throw new Error("Project not found");
}

export async function restoreWorkBoard(boardId: string): Promise<void> {
  const { rowCount } = await cloudSqlPool.query(
    `UPDATE work_projects
     SET archived_at = NULL
     WHERE id = $1 AND archived_at IS NOT NULL`,
    [boardId]
  );
  if (!rowCount) throw new Error("Project not found");
}

export async function fetchArchivedWorkBoardById(
  boardId: string
): Promise<
  | (WorkBoardRow & {
      customer_name: string;
      customer_is_internal: boolean;
    })
  | null
> {
  const { rows } = await cloudSqlPool.query<
    Omit<WorkBoardRow, "member_ids"> & {
      member_ids: string[] | null;
      customer_name: string;
      customer_is_internal: boolean;
    }
  >(
    `SELECT
       b.id,
       b.customer_id,
       b.title,
       b.prefix,
       b.planner_project_id,
       b.created_by_app_user_id,
       b.created_at,
       b.updated_at,
       c.name AS customer_name,
       c.is_internal AS customer_is_internal,
       COALESCE(
         array_agg(m.app_user_id::text) FILTER (WHERE m.app_user_id IS NOT NULL),
         ARRAY[]::text[]
       ) AS member_ids
     FROM work_projects b
     JOIN customers c ON c.id = b.customer_id
     LEFT JOIN work_project_members m ON m.project_id = b.id
     WHERE b.id = $1
       AND b.archived_at IS NOT NULL
     GROUP BY b.id, c.name, c.is_internal`,
    [boardId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    member_ids: row.member_ids ?? [],
  };
}

async function insertDefaultWorkBoardStatuses(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  boardId: string
) {
  for (const [index, status] of DEFAULT_WORK_PROJECT_STATUSES.entries()) {
    await client.query(
      `INSERT INTO work_project_statuses (project_id, name, sort_order, is_done)
       VALUES ($1, $2, $3, $4)`,
      [boardId, status.name, index, status.isDone]
    );
  }
}

export async function fetchWorkBoardStatuses(
  boardId: string
): Promise<WorkBoardStatus[]> {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    name: string;
    sort_order: number;
    is_done: boolean;
  }>(
    `SELECT id, name, sort_order, is_done
     FROM work_project_statuses
     WHERE project_id = $1
     ORDER BY sort_order, name`,
    [boardId]
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    isDone: row.is_done,
  }));
}

export async function insertWorkBoardStatus(input: {
  boardId: string;
  name: string;
}): Promise<WorkBoardStatus> {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    name: string;
    sort_order: number;
    is_done: boolean;
  }>(
    `INSERT INTO work_project_statuses (project_id, name, sort_order, is_done)
     VALUES (
       $1,
       $2,
       (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM work_project_statuses WHERE project_id = $1),
       false
     )
     RETURNING id, name, sort_order, is_done`,
    [input.boardId, input.name]
  );
  const row = rows[0];
  if (!row) throw new Error("Failed to create status");
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    isDone: row.is_done,
  };
}

export async function renameWorkBoardStatus(input: {
  boardId: string;
  statusId: string;
  name: string;
}): Promise<WorkBoardStatus> {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    name: string;
    sort_order: number;
    is_done: boolean;
  }>(
    `UPDATE work_project_statuses
     SET name = $3
     WHERE id = $2 AND project_id = $1
     RETURNING id, name, sort_order, is_done`,
    [input.boardId, input.statusId, input.name]
  );
  const row = rows[0];
  if (!row) throw new Error("Status not found");
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    isDone: row.is_done,
  };
}

export async function reorderWorkBoardStatuses(
  boardId: string,
  statusIds: string[]
): Promise<void> {
  await withCloudSqlTransaction("work-reorder-statuses", async (client) => {
    for (let index = 0; index < statusIds.length; index += 1) {
      await client.query(
        `UPDATE work_project_statuses
         SET sort_order = $3
         WHERE id = $2 AND project_id = $1`,
        [boardId, statusIds[index], index]
      );
    }
  });
}

export async function deleteWorkBoardStatus(input: {
  boardId: string;
  statusId: string;
  moveToStatusId: string | null;
  actorAppUserId: string;
}): Promise<void> {
  await withCloudSqlTransaction("work-delete-status", async (client) => {
    const { rows: statuses } = await client.query<{
      id: string;
      name: string;
    }>(
      `SELECT id, name
       FROM work_project_statuses
       WHERE project_id = $1
       ORDER BY sort_order
       FOR UPDATE`,
      [input.boardId]
    );
    if (statuses.length <= 1) {
      throw new Error("A board needs at least one status");
    }
    const current = statuses.find((row) => row.id === input.statusId);
    if (!current) throw new Error("Status not found");
    const moveTo = input.moveToStatusId
      ? statuses.find((row) => row.id === input.moveToStatusId)
      : null;
    if (input.moveToStatusId && !moveTo) {
      throw new Error("Choose a status to move issues to");
    }
    if (moveTo && moveTo.id === current.id) {
      throw new Error("Choose a different status");
    }

    const { rows: issueRows } = await client.query<{ id: string }>(
      `SELECT id
       FROM work_issues
       WHERE project_id = $1 AND status = $2`,
      [input.boardId, input.statusId]
    );
    if (issueRows.length > 0) {
      if (!moveTo) throw new Error("Choose a status to move issues to");
      await client.query(
        `INSERT INTO work_issue_events (issue_id, actor_app_user_id, kind, summary)
         SELECT i.id, $3, 'status', $4
         FROM work_issues i
         WHERE i.project_id = $1 AND i.status = $2`,
        [
          input.boardId,
          input.statusId,
          input.actorAppUserId,
          `changed status to ${moveTo.name}`,
        ]
      );
      const { rows: orderRows } = await client.query<{ next: number }>(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
         FROM work_issues
         WHERE project_id = $1 AND status = $2`,
        [input.boardId, moveTo.id]
      );
      await client.query(
        `UPDATE work_issues AS i
         SET status = $3,
             sort_order = $4 + sub.rn
         FROM (
           SELECT id,
                  ROW_NUMBER() OVER (ORDER BY sort_order, number) - 1 AS rn
           FROM work_issues
           WHERE project_id = $1 AND status = $2
         ) sub
         WHERE i.id = sub.id`,
        [input.boardId, input.statusId, moveTo.id, orderRows[0]?.next ?? 0]
      );
    }

    await client.query(
      `DELETE FROM work_project_statuses
       WHERE id = $1 AND project_id = $2`,
      [input.statusId, input.boardId]
    );

    const remaining = statuses.filter((row) => row.id !== input.statusId);
    for (let index = 0; index < remaining.length; index += 1) {
      await client.query(
        `UPDATE work_project_statuses
         SET sort_order = $3
         WHERE id = $2 AND project_id = $1`,
        [input.boardId, remaining[index].id, index]
      );
    }
  });
}

export async function insertWorkBoardMember(
  boardId: string,
  appUserId: string
): Promise<void> {
  await cloudSqlPool.query(
    `INSERT INTO work_project_members (project_id, app_user_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [boardId, appUserId]
  );
}

export async function deleteWorkBoardMember(
  boardId: string,
  appUserId: string
): Promise<void> {
  await cloudSqlPool.query(
    `DELETE FROM work_project_members
     WHERE project_id = $1 AND app_user_id = $2`,
    [boardId, appUserId]
  );
}

export async function fetchLinkablePlannerProjects(
  customerId: string
): Promise<{ id: string; name: string }[]> {
  const { rows } = await cloudSqlPool.query<{ id: string; name: string }>(
    `SELECT p.id, p.name
     FROM projects p
     WHERE p.customer_id = $1
       AND p.is_active = true
       AND p.type <> 'absence'
       AND NOT EXISTS (
         SELECT 1 FROM work_projects wp
         WHERE wp.planner_project_id = p.id
       )
     ORDER BY lower(p.name)`,
    [customerId]
  );
  return rows;
}

export async function fetchMemberPreferredView(
  projectId: string,
  appUserId: string
): Promise<"board" | "sprint" | "timeline" | null> {
  const { rows } = await cloudSqlPool.query<{ preferred_view: string | null }>(
    `SELECT preferred_view
     FROM work_project_members
     WHERE project_id = $1 AND app_user_id = $2`,
    [projectId, appUserId]
  );
  const view = rows[0]?.preferred_view;
  if (view === "board" || view === "sprint" || view === "timeline") return view;
  return null;
}

export async function updateMemberPreferredView(
  projectId: string,
  appUserId: string,
  view: "board" | "sprint" | "timeline"
): Promise<void> {
  await cloudSqlPool.query(
    `UPDATE work_project_members
     SET preferred_view = $3
     WHERE project_id = $1 AND app_user_id = $2`,
    [projectId, appUserId, view]
  );
}
