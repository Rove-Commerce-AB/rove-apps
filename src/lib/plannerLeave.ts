import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { getConsultantForCurrentUser } from "@/lib/consultants";
import { DEFAULT_HOURS_PER_WEEK } from "@/lib/constants";
import { getCurrentAppUser } from "@/lib/appUsers";
import {
  logAllocationHistoryCreate,
  logAllocationHistoryUpdate,
  deleteAllocationWithHistory,
} from "@/lib/allocationWrite";
import { getISOWeekDateRange, getYearWeekForDate } from "@/lib/dateUtils";
import { notifyAllocationInserts } from "@/lib/userNotifications";
import type { AbsenceCode } from "@/lib/paxml/absenceCodes";
import { isAbsenceCode } from "@/lib/paxml/absenceCodes";

export type PlannerLeaveDay = {
  id: string;
  consultantId: string;
  projectId: string;
  absenceCode: string | null;
  projectName: string;
  leaveDate: string;
  hours: number;
  note: string | null;
};

export type PlannerLeaveAbsenceProject = {
  id: string;
  name: string;
  absenceCode: string | null;
};

export type PlannerLeaveConsultant = {
  id: string;
  name: string;
  initials: string;
  teamId: string | null;
  teamName: string | null;
  roleId: string | null;
  calendarId: string | null;
  /** Nominal hours for a full working day (calendar × work%). */
  hoursPerDay: number;
};

export type PlannerLeaveHoliday = {
  date: string;
  name: string;
};

/** Weekly absence allocation from Consultant/week views (no day breakdown). */
export type PlannerLeaveWeeklyAbsence = {
  consultantId: string;
  projectId: string;
  absenceCode: string | null;
  projectName: string;
  year: number;
  week: number;
  hours: number;
};

export type PlannerLeavePageData = {
  consultants: PlannerLeaveConsultant[];
  teams: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  absenceProjects: PlannerLeaveAbsenceProject[];
  leaveDays: PlannerLeaveDay[];
  /** Absence booked as weekly allocations (Consultant view etc.). */
  weeklyAbsences: PlannerLeaveWeeklyAbsence[];
  /** Non-absence booked hours by consultant + ISO week key "YYYY-WW". */
  bookedHoursByConsultantWeek: Record<string, number>;
  /** Public holidays by calendar id — only apply to consultants on that calendar. */
  holidaysByCalendarId: Record<string, PlannerLeaveHoliday[]>;
  defaultVacationProjectId: string | null;
  currentConsultantId: string | null;
  currentTeamId: string | null;
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function weekKey(year: number, week: number): string {
  return `${year}-${String(week).padStart(2, "0")}`;
}

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0, 0);
}

export async function listAbsenceProjects(): Promise<PlannerLeaveAbsenceProject[]> {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    name: string;
    absence_code: string | null;
  }>(
    `SELECT id, name, absence_code
     FROM projects
     WHERE type = 'absence' AND is_active = true
     ORDER BY name`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    absenceCode: r.absence_code,
  }));
}

/**
 * Rebuild weekly allocation for one consultant + absence project + ISO week
 * from day-level leave rows. Hours = sum(days); 0 deletes the bare allocation.
 */
export async function syncLeaveWeekAllocation(input: {
  consultantId: string;
  projectId: string;
  year: number;
  week: number;
}): Promise<void> {
  const { start, end } = getISOWeekDateRange(input.year, input.week);

  const { rows: sumRows } = await cloudSqlPool.query<{ hours: string | number }>(
    `SELECT COALESCE(SUM(hours), 0) AS hours
     FROM consultant_leave_days
     WHERE consultant_id = $1
       AND project_id = $2
       AND leave_date >= $3::date
       AND leave_date <= $4::date`,
    [input.consultantId, input.projectId, start, end]
  );
  const hours = Math.round(Number(sumRows[0]?.hours ?? 0) * 100) / 100;

  const { rows: existing } = await cloudSqlPool.query<{
    id: string;
    hours: string | number;
  }>(
    `SELECT id, hours FROM allocations
     WHERE consultant_id = $1
       AND project_id = $2
       AND year = $3 AND week = $4
       AND role_id IS NULL
       AND customer_rate_id IS NULL
       AND project_rate_id IS NULL
     ORDER BY created_at
     LIMIT 1`,
    [input.consultantId, input.projectId, input.year, input.week]
  );

  const row = existing[0];
  if (hours <= 0) {
    if (row) await deleteAllocationWithHistory(row.id);
    return;
  }

  if (row) {
    if (Number(row.hours) === hours) return;
    await cloudSqlPool.query(`UPDATE allocations SET hours = $1 WHERE id = $2`, [
      hours,
      row.id,
    ]);
    await logAllocationHistoryUpdate(row.id, hours);
    return;
  }

  const { rows: inserted } = await cloudSqlPool.query<{
    id: string;
    consultant_id: string | null;
    project_id: string;
    role_id: string | null;
    customer_rate_id: string | null;
    project_rate_id: string | null;
    year: number;
    week: number;
    hours: string | number;
  }>(
    `INSERT INTO allocations (
       consultant_id, project_id, role_id, customer_rate_id, project_rate_id,
       year, week, hours
     ) VALUES ($1, $2, NULL, NULL, NULL, $3, $4, $5)
     RETURNING id, consultant_id, project_id, role_id, customer_rate_id,
               project_rate_id, year, week, hours`,
    [input.consultantId, input.projectId, input.year, input.week, hours]
  );
  const created = inserted[0];
  if (!created) throw new Error("Failed to create leave allocation");
  await logAllocationHistoryCreate(created.id);
  await notifyAllocationInserts([
    {
      id: created.id,
      consultant_id: created.consultant_id,
      project_id: created.project_id,
      year: created.year,
      week: created.week,
      hours: Number(created.hours),
    },
  ]);
}

async function syncWeeksForDates(input: {
  consultantId: string;
  projectId: string;
  dates: string[];
}): Promise<void> {
  const weeks = new Map<string, { year: number; week: number }>();
  for (const date of input.dates) {
    const { year, week } = getYearWeekForDate(parseYmdLocal(date));
    weeks.set(weekKey(year, week), { year, week });
  }
  for (const { year, week } of weeks.values()) {
    await syncLeaveWeekAllocation({
      consultantId: input.consultantId,
      projectId: input.projectId,
      year,
      week,
    });
  }
}

export async function getPlannerLeavePageData(input: {
  fromDate: string;
  toDate: string;
}): Promise<PlannerLeavePageData> {
  const absenceProjects = await listAbsenceProjects();
  const defaultVacation =
    absenceProjects.find((p) => p.absenceCode === "SEM") ??
    absenceProjects[0] ??
    null;

  const me = await getConsultantForCurrentUser().catch(() => null);

  const { rows: teamRows } = await cloudSqlPool.query<{
    id: string;
    name: string;
  }>(`SELECT id, name FROM teams ORDER BY name`);

  const { rows: roleRows } = await cloudSqlPool.query<{
    id: string;
    name: string;
  }>(`SELECT id, name FROM roles ORDER BY name`);

  const { rows: consultantRows } = await cloudSqlPool.query<{
    id: string;
    name: string;
    team_id: string | null;
    team_name: string | null;
    role_id: string | null;
    calendar_id: string | null;
    work_percentage: string | number | null;
    hours_per_week: string | number | null;
  }>(
    `SELECT c.id, c.name, c.team_id, t.name AS team_name, c.role_id,
            c.calendar_id, c.work_percentage, cal.hours_per_week
     FROM consultants c
     LEFT JOIN teams t ON t.id = c.team_id
     LEFT JOIN calendars cal ON cal.id = c.calendar_id
     WHERE COALESCE(c.is_external, false) = false
       AND (c.end_date IS NULL OR c.end_date >= $1::date)
       AND (c.start_date IS NULL OR c.start_date <= $2::date)
     ORDER BY c.name`,
    [input.fromDate, input.toDate]
  );

  const consultants: PlannerLeaveConsultant[] = consultantRows.map((r) => {
    const calendarHours =
      Number(r.hours_per_week) || DEFAULT_HOURS_PER_WEEK;
    const workPct =
      Math.max(5, Math.min(100, Number(r.work_percentage) || 100)) / 100;
    const hoursPerDay =
      Math.round(((calendarHours * workPct) / 5) * 100) / 100;
    return {
      id: r.id,
      name: r.name,
      initials: initialsOf(r.name),
      teamId: r.team_id,
      teamName: r.team_name,
      roleId: r.role_id,
      calendarId: r.calendar_id,
      hoursPerDay: hoursPerDay > 0 ? hoursPerDay : 8,
    };
  });

  const currentTeamId =
    me != null
      ? (consultants.find((c) => c.id === me.id)?.teamId ?? null)
      : null;

  const { rows: leaveRows } = await cloudSqlPool.query<{
    id: string;
    consultant_id: string;
    project_id: string;
    absence_code: string | null;
    project_name: string;
    leave_date: string;
    hours: string | number;
    note: string | null;
  }>(
    `SELECT d.id, d.consultant_id, d.project_id, p.absence_code,
            p.name AS project_name, d.leave_date::text, d.hours, d.note
     FROM consultant_leave_days d
     JOIN projects p ON p.id = d.project_id
     WHERE d.leave_date >= $1::date AND d.leave_date <= $2::date
     ORDER BY d.leave_date, d.consultant_id`,
    [input.fromDate, input.toDate]
  );

  const leaveDays: PlannerLeaveDay[] = leaveRows.map((r) => ({
    id: r.id,
    consultantId: r.consultant_id,
    projectId: r.project_id,
    absenceCode: r.absence_code,
    projectName: r.project_name,
    leaveDate: r.leave_date.slice(0, 10),
    hours: Number(r.hours),
    note: r.note,
  }));

  const calendarIds = [
    ...new Set(
      consultants
        .map((c) => c.calendarId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const { rows: holidayRows } =
    calendarIds.length === 0
      ? { rows: [] as { calendar_id: string; holiday_date: string; name: string }[] }
      : await cloudSqlPool.query<{
          calendar_id: string;
          holiday_date: string;
          name: string;
        }>(
          `SELECT calendar_id, holiday_date::text AS holiday_date, name
           FROM calendar_holidays
           WHERE calendar_id = ANY($1::uuid[])
             AND holiday_date >= $2::date
             AND holiday_date <= $3::date
           ORDER BY calendar_id, holiday_date, name`,
          [calendarIds, input.fromDate, input.toDate]
        );

  const holidaysByCalendarId: Record<string, PlannerLeaveHoliday[]> = {};
  for (const h of holidayRows) {
    const date = h.holiday_date.slice(0, 10);
    const list = holidaysByCalendarId[h.calendar_id] ?? [];
    list.push({ date, name: h.name });
    holidaysByCalendarId[h.calendar_id] = list;
  }

  // Booked (non-absence) hours in weeks overlapping the range — for capacity hint.
  const fromWeek = getYearWeekForDate(parseYmdLocal(input.fromDate));
  const toWeek = getYearWeekForDate(parseYmdLocal(input.toDate));
  const { rows: bookedRows } = await cloudSqlPool.query<{
    consultant_id: string;
    year: number;
    week: number;
    hours: string | number;
  }>(
    `SELECT a.consultant_id, a.year, a.week, SUM(a.hours) AS hours
     FROM allocations a
     JOIN projects p ON p.id = a.project_id
     WHERE a.consultant_id IS NOT NULL
       AND COALESCE(p.type, 'customer') <> 'absence'
       AND (
         (a.year > $1 OR (a.year = $1 AND a.week >= $2))
         AND (a.year < $3 OR (a.year = $3 AND a.week <= $4))
       )
     GROUP BY a.consultant_id, a.year, a.week`,
    [fromWeek.year, fromWeek.week, toWeek.year, toWeek.week]
  );

  const bookedHoursByConsultantWeek: Record<string, number> = {};
  for (const r of bookedRows) {
    const key = `${r.consultant_id}:${weekKey(r.year, r.week)}`;
    bookedHoursByConsultantWeek[key] = Number(r.hours);
  }

  // Weekly absence allocations (Consultant week grid) — shown as week bands in Availability.
  const { rows: weeklyAbsenceRows } = await cloudSqlPool.query<{
    consultant_id: string;
    project_id: string;
    absence_code: string | null;
    project_name: string;
    year: number;
    week: number;
    hours: string | number;
  }>(
    `SELECT a.consultant_id, a.project_id, p.absence_code,
            p.name AS project_name, a.year, a.week, SUM(a.hours) AS hours
     FROM allocations a
     JOIN projects p ON p.id = a.project_id
     WHERE a.consultant_id IS NOT NULL
       AND COALESCE(p.type, 'customer') = 'absence'
       AND (
         (a.year > $1 OR (a.year = $1 AND a.week >= $2))
         AND (a.year < $3 OR (a.year = $3 AND a.week <= $4))
       )
     GROUP BY a.consultant_id, a.project_id, p.absence_code, p.name, a.year, a.week
     HAVING SUM(a.hours) > 0
     ORDER BY a.year, a.week, p.name`,
    [fromWeek.year, fromWeek.week, toWeek.year, toWeek.week]
  );

  const weeklyAbsences: PlannerLeaveWeeklyAbsence[] = weeklyAbsenceRows.map(
    (r) => ({
      consultantId: r.consultant_id,
      projectId: r.project_id,
      absenceCode: r.absence_code,
      projectName: r.project_name,
      year: r.year,
      week: r.week,
      hours: Number(r.hours),
    })
  );

  return {
    consultants,
    teams: teamRows.map((t) => ({ id: t.id, name: t.name })),
    roles: roleRows.map((r) => ({ id: r.id, name: r.name })),
    absenceProjects,
    leaveDays,
    weeklyAbsences,
    bookedHoursByConsultantWeek,
    holidaysByCalendarId,
    defaultVacationProjectId: defaultVacation?.id ?? null,
    currentConsultantId: me?.id ?? null,
    currentTeamId,
  };
}

/** Consultant ids allocated on projects where the current user is PM. */
export async function listConsultantIdsForCurrentPm(): Promise<string[]> {
  const me = await getConsultantForCurrentUser().catch(() => null);
  if (!me?.id) return [];
  const { rows } = await cloudSqlPool.query<{ consultant_id: string }>(
    `SELECT DISTINCT a.consultant_id
     FROM allocations a
     JOIN projects p ON p.id = a.project_id
     WHERE p.project_manager_id = $1
       AND a.consultant_id IS NOT NULL`,
    [me.id]
  );
  return rows.map((r) => r.consultant_id);
}

export async function upsertPlannerLeaveDay(input: {
  consultantId: string;
  projectId: string;
  leaveDate: string;
  hours: number;
  note?: string | null;
}): Promise<PlannerLeaveDay> {
  if (!input.consultantId || !input.projectId) {
    throw new Error("Consultant and project are required");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.leaveDate)) {
    throw new Error("Invalid date");
  }
  const hours = Math.round(Number(input.hours) * 100) / 100;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    throw new Error("Hours must be between 0 and 24");
  }

  const user = await getCurrentAppUser();
  const { rows } = await cloudSqlPool.query<{
    id: string;
    consultant_id: string;
    project_id: string;
    leave_date: string;
    hours: string | number;
    note: string | null;
  }>(
    `INSERT INTO consultant_leave_days (
       consultant_id, project_id, leave_date, hours, note, created_by_email
     ) VALUES ($1, $2, $3::date, $4, $5, $6)
     ON CONFLICT (consultant_id, project_id, leave_date)
     DO UPDATE SET
       hours = EXCLUDED.hours,
       note = EXCLUDED.note,
       updated_at = now()
     RETURNING id, consultant_id, project_id, leave_date::text, hours, note`,
    [
      input.consultantId,
      input.projectId,
      input.leaveDate,
      hours,
      input.note ?? null,
      user?.email ?? null,
    ]
  );
  const row = rows[0];
  if (!row) throw new Error("Failed to save leave day");

  await syncWeeksForDates({
    consultantId: input.consultantId,
    projectId: input.projectId,
    dates: [input.leaveDate],
  });

  const project = (await listAbsenceProjects()).find(
    (p) => p.id === row.project_id
  );

  return {
    id: row.id,
    consultantId: row.consultant_id,
    projectId: row.project_id,
    absenceCode: project?.absenceCode ?? null,
    projectName: project?.name ?? "Absence",
    leaveDate: row.leave_date.slice(0, 10),
    hours: Number(row.hours),
    note: row.note,
  };
}

export async function deletePlannerLeaveDay(id: string): Promise<void> {
  const { rows } = await cloudSqlPool.query<{
    consultant_id: string;
    project_id: string;
    leave_date: string;
  }>(
    `DELETE FROM consultant_leave_days
     WHERE id = $1
     RETURNING consultant_id, project_id, leave_date::text`,
    [id]
  );
  const row = rows[0];
  if (!row) return;
  await syncWeeksForDates({
    consultantId: row.consultant_id,
    projectId: row.project_id,
    dates: [row.leave_date.slice(0, 10)],
  });
}

export async function upsertPlannerLeaveRange(input: {
  consultantId: string;
  projectId: string;
  dates: string[];
  hoursPerDay: number;
}): Promise<void> {
  const dates = [...new Set(input.dates)].filter((d) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d)
  );
  if (dates.length === 0) return;
  const hours = Math.round(Number(input.hoursPerDay) * 100) / 100;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    throw new Error("Hours must be between 0 and 24");
  }
  const user = await getCurrentAppUser();
  for (const leaveDate of dates) {
    await cloudSqlPool.query(
      `INSERT INTO consultant_leave_days (
         consultant_id, project_id, leave_date, hours, created_by_email
       ) VALUES ($1, $2, $3::date, $4, $5)
       ON CONFLICT (consultant_id, project_id, leave_date)
       DO UPDATE SET hours = EXCLUDED.hours, updated_at = now()`,
      [
        input.consultantId,
        input.projectId,
        leaveDate,
        hours,
        user?.email ?? null,
      ]
    );
  }
  await syncWeeksForDates({
    consultantId: input.consultantId,
    projectId: input.projectId,
    dates,
  });
}

export function resolveAbsenceProjectId(
  projects: PlannerLeaveAbsenceProject[],
  code: AbsenceCode | string
): string | null {
  if (!isAbsenceCode(code) && typeof code !== "string") return null;
  return projects.find((p) => p.absenceCode === code)?.id ?? null;
}
