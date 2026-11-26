import "server-only";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/appUsers";
import { ROUTES } from "@/lib/routes";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import type { AllocationHistoryDetails } from "@/types";
import { buildWeeksArray } from "@/lib/allocationWeekParams";

export async function logAllocationHistory(
  allocationId: string | null,
  action: "create" | "update" | "delete" | "bulk",
  details?: AllocationHistoryDetails
): Promise<void> {
  const user = await getCurrentAppUser();
  const email = user?.email ?? "unknown";
  await cloudSqlPool.query(
    `INSERT INTO allocation_history (allocation_id, action, changed_by_email, details)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      allocationId,
      action,
      email,
      details != null ? JSON.stringify(details) : null,
    ]
  );
}

async function getAllocationSnapshot(allocationId: string): Promise<{
  project_name: string;
  customer_name: string | null;
  consultant_name: string;
  year: number;
  week: number;
  hours: number;
} | null> {
  const { rows } = await cloudSqlPool.query<{
    year: number;
    week: number;
    hours: string | number;
    project_name: string;
    customer_name: string | null;
    consultant_name: string | null;
  }>(
    `SELECT a.year, a.week, a.hours,
            p.name AS project_name,
            cu.name AS customer_name,
            co.name AS consultant_name
     FROM allocations a
     JOIN projects p ON p.id = a.project_id
     LEFT JOIN customers cu ON cu.id = p.customer_id
     LEFT JOIN consultants co ON co.id = a.consultant_id
     WHERE a.id = $1`,
    [allocationId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    project_name: row.project_name ?? "—",
    customer_name: row.customer_name,
    consultant_name: row.consultant_name ?? "To plan",
    year: row.year,
    week: row.week,
    hours: Number(row.hours),
  };
}

export async function logAllocationHistoryCreate(allocationId: string): Promise<void> {
  const snapshot = await getAllocationSnapshot(allocationId);
  await logAllocationHistory(
    allocationId,
    "create",
    snapshot
      ? {
          project_name: snapshot.project_name,
          customer_name: snapshot.customer_name ?? undefined,
          consultant_name: snapshot.consultant_name,
          year: snapshot.year,
          week: snapshot.week,
          hours: snapshot.hours,
        }
      : { hours: undefined }
  );
}

export async function logAllocationHistoryUpdate(
  allocationId: string,
  hours_after: number
): Promise<void> {
  const snapshot = await getAllocationSnapshot(allocationId);
  await logAllocationHistory(
    allocationId,
    "update",
    snapshot
      ? {
          project_name: snapshot.project_name,
          customer_name: snapshot.customer_name ?? undefined,
          consultant_name: snapshot.consultant_name,
          year: snapshot.year,
          week: snapshot.week,
          hours_after,
        }
      : { hours_after }
  );
}

export async function logBulkAllocationHistory(
  allocationIds: string[],
  totalHours: number
): Promise<void> {
  if (allocationIds.length === 0) return;
  const snapshot = await getAllocationSnapshot(allocationIds[0]);
  let week_range: string | undefined;
  if (allocationIds.length > 0) {
    const { rows: allocs } = await cloudSqlPool.query<{
      year: number;
      week: number;
    }>(
      `SELECT year, week FROM allocations WHERE id = ANY($1::uuid[])`,
      [allocationIds]
    );
    if (allocs.length > 0) {
      const weeks = allocs.map((a) => ({ year: a.year, week: a.week }));
      const min = weeks.reduce((a, b) =>
        a.year < b.year || (a.year === b.year && a.week < b.week) ? a : b
      );
      const max = weeks.reduce((a, b) =>
        a.year > b.year || (a.year === b.year && a.week > b.week) ? a : b
      );
      week_range =
        min.year === max.year && min.week === max.week
          ? String(min.week)
          : min.year === max.year
            ? `${min.week}–${max.week}`
            : `${min.year}-${min.week} – ${max.year}-${max.week}`;
    }
  }
  await logAllocationHistory(null, "bulk", {
    allocation_ids: allocationIds,
    hours: totalHours,
    project_name: snapshot?.project_name,
    customer_name: snapshot?.customer_name ?? undefined,
    consultant_name: snapshot?.consultant_name,
    week_range,
  });
}

/** Same week span semantics as `createAllocationsForWeekRange` (rollover when weekFrom > weekTo). */
function allocationWeekRange(
  year: number,
  weekFrom: number,
  weekTo: number
): { y: number; w: number }[] {
  return buildWeeksArray(year, weekFrom, weekTo).map(({ year: y, week: w }) => ({
    y,
    w,
  }));
}

/** Remove allocations for this consultant / project / role in the given week span (inclusive). */
export async function deleteAllocationsInWeekRange(
  consultantId: string | null,
  projectId: string,
  roleId: string | null,
  year: number,
  weekFrom: number,
  weekTo: number
): Promise<void> {
  const weeks = allocationWeekRange(year, weekFrom, weekTo);
  if (weeks.length === 0) return;
  const ys = weeks.map((x) => x.y);
  const ws = weeks.map((x) => x.w);
  const { rows } = await cloudSqlPool.query<{ id: string }>(
    `SELECT id FROM allocations
     WHERE project_id = $1
       AND consultant_id IS NOT DISTINCT FROM $2::uuid
       AND role_id IS NOT DISTINCT FROM $3::uuid
       AND (year, week) IN (SELECT * FROM unnest($4::int[], $5::int[]) AS t(y, w))`,
    [projectId, consultantId, roleId, ys, ws]
  );
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;
  await deleteAllocationsWithHistory(ids);
}

export async function getBookingAllocationsForRow(
  consultantId: string | null,
  projectId: string,
  roleId: string | null
): Promise<{ id: string; year: number; week: number }[]> {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    year: number;
    week: number;
  }>(
    `SELECT id, year, week FROM allocations
     WHERE project_id = $1
       AND consultant_id IS NOT DISTINCT FROM $2::uuid
       AND role_id IS NOT DISTINCT FROM $3::uuid
     ORDER BY year ASC, week ASC`,
    [projectId, consultantId, roleId]
  );
  return rows;
}

export async function deleteAllocationWithHistory(allocationId: string): Promise<void> {
  const snapshot = await getAllocationSnapshot(allocationId);
  const user = await getCurrentAppUser();
  const email = user?.email ?? "unknown";
  await cloudSqlPool.query(
    `INSERT INTO allocation_history (allocation_id, action, changed_by_email, details)
     VALUES ($1, 'delete', $2, $3::jsonb)`,
    [
      allocationId,
      email,
      JSON.stringify(
        snapshot
          ? {
              customer_name: snapshot.customer_name ?? undefined,
              project_name: snapshot.project_name,
              consultant_name: snapshot.consultant_name,
              week_range_removed: String(snapshot.week),
              hours_removed: snapshot.hours,
            }
          : null
      ),
    ]
  );
  await cloudSqlPool.query(`DELETE FROM allocations WHERE id = $1`, [
    allocationId,
  ]);
  revalidatePath(ROUTES.planner, "layout");
}

export async function deleteAllocationsWithHistory(allocationIds: string[]): Promise<void> {
  if (allocationIds.length === 0) return;
  const { rows: allocs } = await cloudSqlPool.query<{
    id: string;
    year: number;
    week: number;
    hours: string | number;
    project_id: string;
    consultant_id: string | null;
  }>(
    `SELECT id, year, week, hours, project_id, consultant_id FROM allocations WHERE id = ANY($1::uuid[])`,
    [allocationIds]
  );
  if (!allocs.length) {
    await cloudSqlPool.query(`DELETE FROM allocations WHERE id = ANY($1::uuid[])`, [
      allocationIds,
    ]);
    revalidatePath(ROUTES.planner, "layout");
    return;
  }
  const firstId = allocs[0].id;
  const snapshot = await getAllocationSnapshot(firstId);
  const weeks = allocs.map((a) => a.week).sort((a, b) => a - b);
  const weekRange =
    weeks.length === 1
      ? String(weeks[0])
      : `${weeks[0]}-${weeks[weeks.length - 1]}`;
  const totalHours = allocs.reduce((s, a) => s + Number(a.hours), 0);
  const user = await getCurrentAppUser();
  const email = user?.email ?? "unknown";
  await cloudSqlPool.query(
    `INSERT INTO allocation_history (allocation_id, action, changed_by_email, details)
     VALUES (NULL, 'delete', $1, $2::jsonb)`,
    [
      email,
      JSON.stringify({
        allocation_ids: allocationIds,
        customer_name: snapshot?.customer_name ?? undefined,
        project_name: snapshot?.project_name,
        consultant_name: snapshot?.consultant_name,
        week_range_removed: weekRange,
        hours_removed: totalHours,
      }),
    ]
  );
  await cloudSqlPool.query(`DELETE FROM allocations WHERE id = ANY($1::uuid[])`, [
    allocationIds,
  ]);
  revalidatePath(ROUTES.planner, "layout");
}
