import { cloudSqlPool, withCloudSqlTransaction } from "@/lib/cloudSqlPool";
import { pgDateToDateOnly } from "@/lib/pgDateOnly";

export type WorkSprintRow = {
  id: string;
  project_id: string;
  number: number;
  title: string;
  starts_on: Date | string;
  ends_on: Date | string;
  status: "current" | "next" | "completed";
  capacity_hours: string | number | null;
};

function toDateOnly(value: Date | string): string {
  return pgDateToDateOnly(value);
}

export function mapWorkSprintRow(row: WorkSprintRow) {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    startsOn: toDateOnly(row.starts_on),
    endsOn: toDateOnly(row.ends_on),
    status: row.status,
    capacityHours:
      row.capacity_hours == null ? null : Number(row.capacity_hours),
  };
}

export async function fetchWorkSprintsForBoard(
  boardId: string
): Promise<WorkSprintRow[]> {
  const { rows } = await cloudSqlPool.query<WorkSprintRow>(
    `SELECT id, project_id, number, title, starts_on, ends_on, status, capacity_hours
     FROM work_sprints
     WHERE project_id = $1
     ORDER BY
       CASE status
         WHEN 'current' THEN 0
         WHEN 'next' THEN 1
         ELSE 2
       END,
       starts_on ASC,
       number ASC`,
    [boardId]
  );
  return rows;
}

export async function fetchWorkSprintById(
  sprintId: string
): Promise<WorkSprintRow | null> {
  const { rows } = await cloudSqlPool.query<WorkSprintRow>(
    `SELECT id, project_id, number, title, starts_on, ends_on, status, capacity_hours
     FROM work_sprints
     WHERE id = $1`,
    [sprintId]
  );
  return rows[0] ?? null;
}

export async function insertWorkSprint(input: {
  boardId: string;
  title: string;
  startsOn: string;
  endsOn: string;
  status: "current" | "next";
  capacityHours: number | null;
}): Promise<WorkSprintRow> {
  return withCloudSqlTransaction("work-create-sprint", async (client) => {
    if (input.status === "current") {
      const { rows: existing } = await client.query<{ id: string }>(
        `SELECT id FROM work_sprints WHERE project_id = $1 AND status = 'current'`,
        [input.boardId]
      );
      if (existing[0]) {
        throw new Error("This board already has a current sprint");
      }
    }
    const { rows: numberRows } = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(number), 0) + 1 AS next
       FROM work_sprints
       WHERE project_id = $1`,
      [input.boardId]
    );
    const number = numberRows[0]?.next ?? 1;

    const { rows } = await client.query<WorkSprintRow>(
      `INSERT INTO work_sprints (
         project_id, number, title, starts_on, ends_on, status, capacity_hours
       ) VALUES ($1, $2, $3, $4::date, $5::date, $6, $7)
       RETURNING id, project_id, number, title, starts_on, ends_on, status, capacity_hours`,
      [
        input.boardId,
        number,
        input.title,
        input.startsOn,
        input.endsOn,
        input.status,
        input.capacityHours,
      ]
    );
    const row = rows[0];
    if (!row) throw new Error("Failed to create sprint");
    return row;
  });
}

export async function updateWorkSprint(
  boardId: string,
  sprintId: string,
  patch: {
    title?: string;
    startsOn?: string;
    endsOn?: string;
    capacityHours?: number | null;
  }
): Promise<WorkSprintRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [boardId, sprintId];
  let i = 3;
  if (patch.title !== undefined) {
    sets.push(`title = $${i++}`);
    values.push(patch.title);
  }
  if (patch.startsOn !== undefined) {
    sets.push(`starts_on = $${i++}::date`);
    values.push(patch.startsOn);
  }
  if (patch.endsOn !== undefined) {
    sets.push(`ends_on = $${i++}::date`);
    values.push(patch.endsOn);
  }
  if (patch.capacityHours !== undefined) {
    sets.push(`capacity_hours = $${i++}`);
    values.push(patch.capacityHours);
  }
  if (sets.length === 0) {
    return fetchWorkSprintById(sprintId);
  }
  sets.push(`updated_at = now()`);
  const { rows } = await cloudSqlPool.query<WorkSprintRow>(
    `UPDATE work_sprints
     SET ${sets.join(", ")}
     WHERE id = $2 AND project_id = $1
     RETURNING id, project_id, number, title, starts_on, ends_on, status, capacity_hours`,
    values
  );
  return rows[0] ?? null;
}

/** Delete a sprint. Linked issues get `sprint_id` cleared (ON DELETE SET NULL). */
export async function deleteWorkSprint(
  boardId: string,
  sprintId: string
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `DELETE FROM work_sprints
     WHERE id = $2 AND project_id = $1`,
    [boardId, sprintId]
  );
  return (result.rowCount ?? 0) === 1;
}

/** Promote a planned (`next`) sprint to `current`. Fails if one is already current. */
export async function startWorkSprint(
  boardId: string,
  sprintId: string
): Promise<WorkSprintRow> {
  return withCloudSqlTransaction("work-start-sprint", async (client) => {
    const { rows: currentRows } = await client.query<{ id: string }>(
      `SELECT id FROM work_sprints
       WHERE project_id = $1 AND status = 'current'
       FOR UPDATE`,
      [boardId]
    );
    if (currentRows[0]) {
      throw new Error("This board already has a current sprint");
    }

    const { rows: sprintRows } = await client.query<WorkSprintRow>(
      `SELECT id, project_id, number, title, starts_on, ends_on, status, capacity_hours
       FROM work_sprints
       WHERE id = $1 AND project_id = $2
       FOR UPDATE`,
      [sprintId, boardId]
    );
    const sprint = sprintRows[0];
    if (!sprint) throw new Error("Sprint not found");
    if (sprint.status !== "next") {
      throw new Error("Only a planned sprint can be started");
    }
    const today = new Date().toISOString().slice(0, 10);
    const startsOn = String(sprint.starts_on).slice(0, 10);
    const endsOn = String(sprint.ends_on).slice(0, 10);
    if (today < startsOn || today > endsOn) {
      throw new Error(
        "Today must fall within the sprint dates to start it"
      );
    }

    const { rows } = await client.query<WorkSprintRow>(
      `UPDATE work_sprints
       SET status = 'current', updated_at = now()
       WHERE id = $1
       RETURNING id, project_id, number, title, starts_on, ends_on, status, capacity_hours`,
      [sprintId]
    );
    const row = rows[0];
    if (!row) throw new Error("Failed to start sprint");
    return row;
  });
}

export async function closeWorkSprint(
  boardId: string,
  sprintId: string,
  unfinishedAction: "next" | "backlog" | "leave"
): Promise<{ closedId: string; promotedId: string | null }> {
  return withCloudSqlTransaction("work-close-sprint", async (client) => {
    const { rows: sprintRows } = await client.query<WorkSprintRow>(
      `SELECT id, project_id, number, title, starts_on, ends_on, status, capacity_hours
       FROM work_sprints
       WHERE id = $1 AND project_id = $2
       FOR UPDATE`,
      [sprintId, boardId]
    );
    const sprint = sprintRows[0];
    if (!sprint) throw new Error("Sprint not found");
    if (sprint.status !== "current") {
      throw new Error("Only the current sprint can be closed");
    }

    // Promote the soonest upcoming sprint (supports planning many ahead).
    const { rows: nextRows } = await client.query<{ id: string }>(
      `SELECT id FROM work_sprints
       WHERE project_id = $1 AND status = 'next'
       ORDER BY starts_on ASC, number ASC
       FOR UPDATE`,
      [boardId]
    );
    const nextId = nextRows[0]?.id ?? null;

    if (unfinishedAction === "next") {
      if (!nextId) {
        throw new Error("Create a next sprint before moving unfinished work there");
      }
      await client.query(
        `UPDATE work_issues
         SET sprint_id = $3
         WHERE project_id = $1
           AND sprint_id = $2
           AND status NOT IN (
             SELECT id FROM work_project_statuses
             WHERE project_id = $1 AND is_done = true
           )`,
        [boardId, sprintId, nextId]
      );
    } else if (unfinishedAction === "backlog") {
      await client.query(
        `UPDATE work_issues
         SET sprint_id = NULL
         WHERE project_id = $1
           AND sprint_id = $2
           AND status NOT IN (
             SELECT id FROM work_project_statuses
             WHERE project_id = $1 AND is_done = true
           )`,
        [boardId, sprintId]
      );
    }

    await client.query(
      `UPDATE work_sprints
       SET status = 'completed', updated_at = now()
       WHERE id = $1`,
      [sprintId]
    );

    if (nextId) {
      await client.query(
        `UPDATE work_sprints
         SET status = 'current', updated_at = now()
         WHERE id = $1`,
        [nextId]
      );
    }

    return { closedId: sprintId, promotedId: nextId };
  });
}

export async function updateWorkIssueSprint(
  boardId: string,
  issueId: string,
  sprintId: string | null
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `UPDATE work_issues
     SET sprint_id = $3
     WHERE id = $2 AND project_id = $1`,
    [boardId, issueId, sprintId]
  );
  return (result.rowCount ?? 0) === 1;
}

export async function updateWorkIssueSchedule(
  boardId: string,
  issueId: string,
  startDate: string | null,
  dueDate: string | null
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `UPDATE work_issues
     SET start_date = $3::date, due_date = $4::date
     WHERE id = $2 AND project_id = $1`,
    [boardId, issueId, startDate, dueDate]
  );
  return (result.rowCount ?? 0) === 1;
}

export async function applyDefaultSprintDates(
  boardId: string,
  issueId: string,
  sprintId: string
): Promise<void> {
  const sprint = await fetchWorkSprintById(sprintId);
  if (!sprint || sprint.project_id !== boardId) return;
  const today = new Date().toISOString().slice(0, 10);
  const startsOn = toDateOnly(sprint.starts_on);
  const endsOn = toDateOnly(sprint.ends_on);
  const startDate = today > startsOn && today <= endsOn ? today : startsOn;
  await cloudSqlPool.query(
    `UPDATE work_issues
     SET start_date = COALESCE(start_date, $3::date),
         due_date = COALESCE(due_date, $4::date)
     WHERE id = $2 AND project_id = $1`,
    [boardId, issueId, startDate, endsOn]
  );
}
