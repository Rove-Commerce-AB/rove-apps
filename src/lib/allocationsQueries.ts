import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { notifyAllocationInserts } from "@/lib/userNotifications";
import { isoWeeksInYear, addWeeksToYearWeek } from "./dateUtils";
import { buildWeeksArray } from "./allocationWeekParams";
import { timedDebug } from "@/lib/debugLogs";
import { allocationIdentityKey, resolveAllocationIdentity } from "./billingItem";

export type AllocationRecord = {
  id: string;
  consultant_id: string | null;
  project_id: string;
  role_id: string | null;
  customer_rate_id: string | null;
  project_rate_id: string | null;
  custom_task_name: string | null;
  year: number;
  week: number;
  hours: number;
};

const ALLOCATION_SELECT = `a.id, a.consultant_id, a.project_id, a.role_id, a.customer_rate_id, a.project_rate_id,
       a.year, a.week, a.hours, COALESCE(pr.name, cr.name) AS custom_task_name`;

const ALLOCATION_FROM = `allocations a
     LEFT JOIN customer_rates cr ON cr.id = a.customer_rate_id
     LEFT JOIN project_rates pr ON pr.id = a.project_rate_id`;

function mapAllocation(r: {
  id: string;
  consultant_id: string | null;
  project_id: string;
  role_id: string | null;
  customer_rate_id?: string | null;
  project_rate_id?: string | null;
  custom_task_name?: string | null;
  year: number;
  week: number;
  hours: string | number;
}): AllocationRecord {
  return {
    id: r.id,
    consultant_id: r.consultant_id ?? null,
    project_id: r.project_id,
    role_id: r.role_id ?? null,
    customer_rate_id: r.customer_rate_id ?? null,
    project_rate_id: r.project_rate_id ?? null,
    custom_task_name: r.custom_task_name ?? null,
    year: r.year,
    week: r.week,
    hours: Number(r.hours),
  };
}

export async function getAllocationsForWeek(
  consultantIds: string[],
  year: number,
  week: number
): Promise<Pick<AllocationRecord, "id" | "consultant_id" | "project_id" | "hours">[]> {
  if (consultantIds.length === 0) return [];

  const { rows } = await cloudSqlPool.query(
    `SELECT id, consultant_id, project_id, hours
     FROM allocations
     WHERE consultant_id = ANY($1::uuid[])
       AND year = $2 AND week = $3`,
    [consultantIds, year, week]
  );

  return rows.map((r: { id: string; consultant_id: string | null; project_id: string; hours: string | number }) => ({
    id: r.id,
    consultant_id: r.consultant_id,
    project_id: r.project_id,
    hours: Number(r.hours),
  }));
}

export async function getAllocationsByProjectIds(
  projectIds: string[]
): Promise<Pick<AllocationRecord, "id" | "consultant_id" | "project_id" | "hours">[]> {
  if (projectIds.length === 0) return [];

  const { rows } = await cloudSqlPool.query(
    `SELECT id, consultant_id, project_id, hours
     FROM allocations WHERE project_id = ANY($1::uuid[])`,
    [projectIds]
  );

  return rows.map((r: { id: string; consultant_id: string | null; project_id: string; hours: string | number }) => ({
    id: r.id,
    consultant_id: r.consultant_id,
    project_id: r.project_id,
    hours: Number(r.hours),
  }));
}

export async function getAllocationsForProjectWithWeeks(
  projectId: string
): Promise<AllocationRecord[]> {
  const { rows } = await timedDebug(
    "allocations-query",
    "getAllocationsForProjectWithWeeks",
    () =>
      cloudSqlPool.query(
        `SELECT ${ALLOCATION_SELECT}
         FROM ${ALLOCATION_FROM} WHERE a.project_id = $1`,
        [projectId]
      ),
    { projectId }
  );
  return rows.map(mapAllocation);
}

async function getAllocationsForYearWeekList(
  year: number,
  weeksInYear: { year: number; week: number }[]
): Promise<AllocationRecord[]> {
  if (weeksInYear.length === 0) return [];

  const weekNumbers = [...new Set(weeksInYear.map((w) => w.week))].sort(
    (a, b) => a - b
  );
  const isContiguous =
    weekNumbers.length > 0 &&
    weekNumbers.every(
      (w, i) => i === 0 || w === weekNumbers[i - 1]! + 1
    );

  if (isContiguous) {
    return getAllocationsForWeekRange(
      year,
      weekNumbers[0]!,
      weekNumbers[weekNumbers.length - 1]!
    );
  }

  const { rows } = await timedDebug(
    "allocations-query",
    "getAllocationsForYearWeekList",
    () =>
      cloudSqlPool.query(
        `SELECT ${ALLOCATION_SELECT}
         FROM ${ALLOCATION_FROM}
         WHERE a.year = $1 AND a.week = ANY($2::int[])
         ORDER BY year, week, consultant_id, project_id, id`,
        [year, weekNumbers]
      ),
    { year, weekCount: weekNumbers.length }
  );
  return rows.map(mapAllocation);
}

export async function getAllocationsForWeeks(
  weeks: { year: number; week: number }[]
): Promise<AllocationRecord[]> {
  if (weeks.length === 0) return [];
  const uniqueYears = [...new Set(weeks.map((w) => w.year))].sort((a, b) => a - b);
  const yearResults = await Promise.all(
    uniqueYears.map((y) =>
      getAllocationsForYearWeekList(
        y,
        weeks.filter((w) => w.year === y)
      )
    )
  );
  return yearResults.flat();
}

export async function getAllocationsForWeekRange(
  year: number,
  weekFrom: number,
  weekTo: number
): Promise<AllocationRecord[]> {
  if (weekFrom <= weekTo) {
    const { rows } = await cloudSqlPool.query(
      `SELECT ${ALLOCATION_SELECT}
       FROM ${ALLOCATION_FROM}
       WHERE a.year = $1 AND a.week >= $2 AND a.week <= $3`,
      [year, weekFrom, weekTo]
    );
    return rows.map(mapAllocation);
  }

  const maxWeek = isoWeeksInYear(year);
  const [r1, r2] = await Promise.all([
    cloudSqlPool.query(
      `SELECT ${ALLOCATION_SELECT}
       FROM ${ALLOCATION_FROM} WHERE a.year = $1 AND a.week >= $2 AND a.week <= $3`,
      [year, weekFrom, maxWeek]
    ),
    cloudSqlPool.query(
      `SELECT ${ALLOCATION_SELECT}
       FROM ${ALLOCATION_FROM} WHERE a.year = $1 AND a.week >= $2 AND a.week <= $3`,
      [year + 1, 1, weekTo]
    ),
  ]);
  return [...r1.rows.map(mapAllocation), ...r2.rows.map(mapAllocation)];
}

export type CreateAllocationInput = {
  consultant_id: string | null;
  project_id: string;
  role_id?: string | null;
  year: number;
  week: number;
  hours: number;
};

export async function createAllocation(
  input: CreateAllocationInput
): Promise<AllocationRecord> {
  const created = await createAllocations([input]);
  return created[0]!;
}

/** Multi-week insert with a single grouped booking notification. */
export async function createAllocations(
  inputs: CreateAllocationInput[]
): Promise<AllocationRecord[]> {
  if (inputs.length === 0) return [];
  const values: unknown[] = [];
  const placeholders = inputs
    .map((_, i) => {
      const o = i * 8;
      return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8})`;
    })
    .join(", ");
  for (const input of inputs) {
    const ident = resolveAllocationIdentity(input);
    values.push(
      input.consultant_id,
      input.project_id,
      ident.role_id,
      ident.customer_rate_id,
      ident.project_rate_id,
      input.year,
      input.week,
      input.hours
    );
  }
  const { rows } = await cloudSqlPool.query(
    `INSERT INTO allocations (consultant_id, project_id, role_id, customer_rate_id, project_rate_id, year, week, hours)
     VALUES ${placeholders}
     RETURNING id, consultant_id, project_id, role_id, customer_rate_id, project_rate_id, year, week, hours`,
    values
  );
  if (rows.length !== inputs.length) {
    throw new Error("Failed to create allocation(s)");
  }
  const created = rows.map((r) =>
    mapAllocation(r as Parameters<typeof mapAllocation>[0])
  );
  await notifyAllocationInserts(created);
  return created;
}

function weekKey(year: number, week: number): string {
  return `${year}-${week}`;
}

async function getExistingAllocationsInRange(
  consultant_id: string | null,
  project_id: string,
  role_id: string | null,
  weeks: { y: number; w: number }[]
): Promise<Map<string, AllocationRecord>> {
  if (weeks.length === 0) return new Map();

  const years = [...new Set(weeks.map((w) => w.y))];

  const ident = resolveAllocationIdentity({ role_id });
  const { rows } = await cloudSqlPool.query(
    `SELECT ${ALLOCATION_SELECT}
     FROM ${ALLOCATION_FROM}
     WHERE a.project_id = $1
       AND a.year = ANY($2::int[])
       AND a.consultant_id IS NOT DISTINCT FROM $3::uuid
       AND a.role_id IS NOT DISTINCT FROM $4::uuid
       AND a.customer_rate_id IS NOT DISTINCT FROM $5::uuid
       AND a.project_rate_id IS NOT DISTINCT FROM $6::uuid`,
    [
      project_id,
      years,
      consultant_id,
      ident.role_id,
      ident.customer_rate_id,
      ident.project_rate_id,
    ]
  );

  const weekSet = new Set(weeks.map(({ y, w }) => weekKey(y, w)));
  const map = new Map<string, AllocationRecord>();
  for (const r of rows) {
    const rec = mapAllocation(r as Parameters<typeof mapAllocation>[0]);
    const key = weekKey(rec.year, rec.week);
    if (weekSet.has(key)) map.set(key, rec);
  }
  return map;
}

export async function createAllocationsForWeekRange(
  consultant_id: string | null,
  project_id: string,
  role_id: string | null,
  year: number,
  weekFrom: number,
  weekTo: number,
  hoursPerWeek: number
): Promise<AllocationRecord[]> {
  const weeks = buildWeeksArray(year, weekFrom, weekTo).map(({ year: y, week: w }) => ({
    y,
    w,
  }));

  const existingMap = await getExistingAllocationsInRange(
    consultant_id,
    project_id,
    role_id,
    weeks
  );

  const toUpdate: { existing: AllocationRecord; newHours: number }[] = [];
  const toCreate: { y: number; w: number }[] = [];

  for (const { y, w } of weeks) {
    const key = weekKey(y, w);
    const existing = existingMap.get(key);
    if (existing) {
      toUpdate.push({ existing, newHours: existing.hours + hoursPerWeek });
    } else {
      toCreate.push({ y, w });
    }
  }

  const updateResults =
    toUpdate.length > 0
      ? await Promise.all(
          toUpdate.map(({ existing, newHours }) =>
            updateAllocation(existing.id, { hours: newHours })
          )
        )
      : [];

  let insertResults: AllocationRecord[] = [];
  if (toCreate.length > 0) {
    const values: unknown[] = [];
    const ident = resolveAllocationIdentity({ role_id });
    const placeholders = toCreate
      .map((_, i) => {
        const o = i * 8;
        return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8})`;
      })
      .join(", ");
    for (const { y, w } of toCreate) {
      values.push(
        consultant_id,
        project_id,
        ident.role_id,
        ident.customer_rate_id,
        ident.project_rate_id,
        y,
        w,
        hoursPerWeek
      );
    }
    const { rows } = await cloudSqlPool.query(
      `INSERT INTO allocations (consultant_id, project_id, role_id, customer_rate_id, project_rate_id, year, week, hours)
       VALUES ${placeholders}
       RETURNING id, consultant_id, project_id, role_id, customer_rate_id, project_rate_id, year, week, hours`,
      values
    );
    insertResults = rows.map(mapAllocation);
  }

  if (insertResults.length > 0) {
    await notifyAllocationInserts(insertResults);
  }

  const byKey = new Map<string, AllocationRecord>();
  for (const r of updateResults) byKey.set(weekKey(r.year, r.week), r);
  for (const r of insertResults) byKey.set(weekKey(r.year, r.week), r);

  return weeks.map(({ y, w }) => byKey.get(weekKey(y, w))!);
}

export async function createAllocationsForWeekRangeWithGetter(
  consultant_id: string | null,
  project_id: string,
  role_id: string | null,
  year: number,
  weekFrom: number,
  weekTo: number,
  getHoursForWeek: (y: number, w: number) => Promise<number>
): Promise<AllocationRecord[]> {
  const weeks = buildWeeksArray(year, weekFrom, weekTo).map(({ year: y, week: w }) => ({
    y,
    w,
  }));

  const [existingMap, hoursByWeek] = await Promise.all([
    getExistingAllocationsInRange(consultant_id, project_id, role_id, weeks),
    Promise.all(
      weeks.map(async ({ y, w }) => ({ y, w, hours: await getHoursForWeek(y, w) }))
    ),
  ]);

  const hoursMap = new Map(hoursByWeek.map((h) => [weekKey(h.y, h.w), h.hours]));

  const toUpdate: { existing: AllocationRecord; newHours: number }[] = [];
  const toCreate: { y: number; w: number; hours: number }[] = [];

  for (const { y, w } of weeks) {
    const key = weekKey(y, w);
    const hours = hoursMap.get(key) ?? 0;
    const existing = existingMap.get(key);
    if (existing) {
      toUpdate.push({ existing, newHours: existing.hours + hours });
    } else {
      toCreate.push({ y, w, hours });
    }
  }

  const updateResults =
    toUpdate.length > 0
      ? await Promise.all(
          toUpdate.map(({ existing, newHours }) =>
            updateAllocation(existing.id, { hours: newHours })
          )
        )
      : [];

  let insertResults: AllocationRecord[] = [];
  if (toCreate.length > 0) {
    const values: unknown[] = [];
    const ident = resolveAllocationIdentity({ role_id });
    const placeholders = toCreate
      .map((_, i) => {
        const o = i * 8;
        return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8})`;
      })
      .join(", ");
    for (const { y, w, hours } of toCreate) {
      values.push(
        consultant_id,
        project_id,
        ident.role_id,
        ident.customer_rate_id,
        ident.project_rate_id,
        y,
        w,
        hours
      );
    }
    const { rows } = await cloudSqlPool.query(
      `INSERT INTO allocations (consultant_id, project_id, role_id, customer_rate_id, project_rate_id, year, week, hours)
       VALUES ${placeholders}
       RETURNING id, consultant_id, project_id, role_id, customer_rate_id, project_rate_id, year, week, hours`,
      values
    );
    insertResults = rows.map(mapAllocation);
  }

  if (insertResults.length > 0) {
    await notifyAllocationInserts(insertResults);
  }

  const byKey = new Map<string, AllocationRecord>();
  for (const r of updateResults) byKey.set(weekKey(r.year, r.week), r);
  for (const r of insertResults) byKey.set(weekKey(r.year, r.week), r);

  return weeks.map(({ y, w }) => byKey.get(weekKey(y, w))!);
}

export type UpdateAllocationInput = {
  role_id?: string | null;
  hours?: number;
};

export async function updateAllocation(
  id: string,
  input: UpdateAllocationInput
): Promise<AllocationRecord> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (input.role_id !== undefined) {
    const ident = resolveAllocationIdentity({ role_id: input.role_id });
    updates.push(`role_id = $${i++}`);
    values.push(ident.role_id);
    updates.push(`customer_rate_id = $${i++}`);
    values.push(ident.customer_rate_id);
    updates.push(`project_rate_id = $${i++}`);
    values.push(ident.project_rate_id);
  }
  if (input.hours !== undefined) {
    updates.push(`hours = $${i++}`);
    values.push(input.hours);
  }
  if (updates.length === 0) {
    const { rows } = await cloudSqlPool.query(
      `SELECT ${ALLOCATION_SELECT}
       FROM ${ALLOCATION_FROM} WHERE a.id = $1`,
      [id]
    );
    if (!rows[0]) throw new Error("Allocation not found");
    return mapAllocation(rows[0] as Parameters<typeof mapAllocation>[0]);
  }
  values.push(id);
  const { rows } = await cloudSqlPool.query(
    `UPDATE allocations SET ${updates.join(", ")} WHERE id = $${i}
     RETURNING id, consultant_id, project_id, role_id, customer_rate_id, project_rate_id, year, week, hours`,
    values
  );
  if (!rows[0]) throw new Error("Failed to update allocation");
  return mapAllocation(rows[0] as Parameters<typeof mapAllocation>[0]);
}

export async function deleteAllocation(id: string): Promise<void> {
  await cloudSqlPool.query(`DELETE FROM allocations WHERE id = $1`, [id]);
}

export async function deleteAllocations(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await cloudSqlPool.query(`DELETE FROM allocations WHERE id = ANY($1::uuid[])`, [
    ids,
  ]);
}

export async function deleteAllocationsByProjectId(
  projectId: string
): Promise<void> {
  await cloudSqlPool.query(`DELETE FROM allocations WHERE project_id = $1`, [
    projectId,
  ]);
}

export async function moveAllocationsForProject(
  projectId: string,
  deltaWeeks: number
): Promise<{ moved: number }> {
  if (deltaWeeks === 0) return { moved: 0 };
  const rows = await getAllocationsForProjectWithWeeks(projectId);
  if (rows.length === 0) return { moved: 0 };

  type Key = string;
  const groupKey = (
    c: string | null,
    identKey: string,
    y: number,
    w: number
  ): Key => `${c ?? ""}|${identKey}|${y}|${w}`;
  const grouped = new Map<
    Key,
    {
      consultant_id: string | null;
      role_id: string | null;
      customer_rate_id: string | null;
      project_rate_id: string | null;
      year: number;
      week: number;
      hours: number;
    }
  >();
  for (const a of rows) {
    const { year: newYear, week: newWeek } = addWeeksToYearWeek(
      a.year,
      a.week,
      deltaWeeks
    );
    const identKey = allocationIdentityKey(a);
    const key = groupKey(a.consultant_id, identKey, newYear, newWeek);
    const existing = grouped.get(key);
    const hours = Number(a.hours);
    if (existing) {
      existing.hours += hours;
    } else {
      grouped.set(key, {
        consultant_id: a.consultant_id,
        role_id: a.role_id,
        customer_rate_id: a.customer_rate_id,
        project_rate_id: a.project_rate_id,
        year: newYear,
        week: newWeek,
        hours,
      });
    }
  }

  await deleteAllocationsByProjectId(projectId);
  const toInsert = Array.from(grouped.values()).map((g) => ({
    consultant_id: g.consultant_id,
    project_id: projectId,
    role_id: g.role_id,
    customer_rate_id: g.customer_rate_id,
    project_rate_id: g.project_rate_id,
    year: g.year,
    week: g.week,
    hours: g.hours,
  }));
  if (toInsert.length === 0) return { moved: 0 };
  const BATCH = 100;
  for (let j = 0; j < toInsert.length; j += BATCH) {
    const batch = toInsert.slice(j, j + BATCH);
    const values: unknown[] = [];
    const placeholders = batch
      .map((_, idx) => {
        const o = idx * 8;
        return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8})`;
      })
      .join(", ");
    for (const row of batch) {
      values.push(
        row.consultant_id,
        row.project_id,
        row.role_id,
        row.customer_rate_id,
        row.project_rate_id,
        row.year,
        row.week,
        row.hours
      );
    }
    await cloudSqlPool.query(
      `INSERT INTO allocations (consultant_id, project_id, role_id, customer_rate_id, project_rate_id, year, week, hours)
       VALUES ${placeholders}`,
      values
    );
  }
  return { moved: toInsert.length };
}
