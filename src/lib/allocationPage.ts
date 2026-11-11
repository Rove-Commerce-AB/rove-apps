import "server-only";
import { compareTextSv } from "@/lib/sort";

import { unstable_cache } from "next/cache";

import type {
  AllocationConsultant,
  AllocationCustomer,
  AllocationPageData,
  AllocationProject,
} from "./allocationPageTypes";
import { TO_PLAN_CONSULTANT_ID } from "./allocationPageTypes";
import {
  getAllocationsForWeeks,
  getAllocationsForProjectWithWeeks,
} from "./allocations";
import {
  countWeekdayHolidaysInRange,
  type CalendarHoliday,
} from "./calendarHolidaysUtils";
import { fetchCalendarHolidaysByCalendarIds } from "./calendarHolidaysQueries";
import * as rolesQueries from "./rolesQueries";
import * as teamsQueries from "./teamsQueries";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { getCachedConsultantsRaw } from "./consultantsCache";
import { getConsultantsByCustomerId } from "./customerConsultants";
import { DEFAULT_HOURS_PER_WEEK } from "./constants";
import { buildWeeksArray } from "./allocationWeekParams";
import { getISOWeekDateRange } from "./dateUtils";
import { getProjectsWithCustomer } from "./projects";
import { getRoles } from "./roles";
import { getTeams } from "./teams";
import { debugLog, timedDebug } from "@/lib/debugLogs";
import { allocationIdentityKey } from "./billingItem";

// Stagger cache TTLs to avoid synchronized cache stampedes.
const ROLES_CACHE_REVALIDATE = 10 * 60;
const TEAMS_CACHE_REVALIDATE = 10 * 60;
const CALENDARS_CACHE_REVALIDATE = 10 * 60;
const HOLIDAYS_CACHE_REVALIDATE = 5 * 60;

async function getCachedRoles() {
  return unstable_cache(
    async () => rolesQueries.fetchRoles(),
    ["allocation-roles"],
    { revalidate: ROLES_CACHE_REVALIDATE }
  )();
}

async function getCachedTeams() {
  return unstable_cache(
    async () => teamsQueries.fetchTeams(),
    ["allocation-teams"],
    { revalidate: TEAMS_CACHE_REVALIDATE }
  )();
}

async function getCachedCalendars() {
  return unstable_cache(
    async () => {
      const { rows } = await cloudSqlPool.query<{
        id: string;
        hours_per_week: string | number;
      }>(`SELECT id, hours_per_week FROM calendars`);
      return rows;
    },
    ["allocation-calendars"],
    { revalidate: CALENDARS_CACHE_REVALIDATE }
  )();
}

async function getCachedCalendarHolidaysByIds(calendarIds: string[]) {
  const key = [...calendarIds].sort().join(",");
  return unstable_cache(
    async () => {
      const map = await fetchCalendarHolidaysByCalendarIds(calendarIds);
      return Object.fromEntries(map.entries()) as Record<string, CalendarHoliday[]>;
    },
    ["allocation-holidays-batch", key],
    { revalidate: HOLIDAYS_CACHE_REVALIDATE }
  )();
}

const HOURS_PER_HOLIDAY = 8;

export type {
  AllocationCell,
  AllocationConsultant,
  AllocationCustomer,
  AllocationPageData,
  AllocationProject,
} from "./allocationPageTypes";
export { TO_PLAN_CONSULTANT_ID } from "./allocationPageTypes";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Fetches allocation page data without cache so add/edit/delete are visible immediately on refresh. */
export async function getAllocationPageData(
  year: number,
  weekFrom: number,
  weekTo: number
): Promise<AllocationPageData> {
  const weeks = buildWeeksArray(year, weekFrom, weekTo);

  let consultants: AllocationConsultant[] = [];
  let projects: AllocationProject[] = [];
  let roles: { id: string; name: string }[] = [];
  let teams: { id: string; name: string }[] = [];
  let allocations: AllocationPageData["allocations"] = [];

  try {
    const [
      consultantsRaw,
      rolesData,
      teamsData,
      allocationsData,
      calendarsData,
      projectsData,
    ] = await Promise.all([
      getCachedConsultantsRaw(),
      getCachedRoles(),
      getCachedTeams(),
      getAllocationsForWeeks(weeks),
      getCachedCalendars(),
      getProjectsWithCustomer(),
    ]);

    const calendarIds = [
      ...new Set(consultantsRaw.map((c) => c.calendar_id).filter(Boolean)),
    ] as string[];
    const holidaysRecord =
      calendarIds.length > 0
        ? await getCachedCalendarHolidaysByIds(calendarIds).catch(() => ({}))
        : {};

    roles = rolesData;
    teams = teamsData;
    allocations = allocationsData;
    projects = projectsData;
    const teamMap = new Map(teamsData.map((t) => [t.id, t.name]));
    const roleMap = new Map(roles.map((r) => [r.id, r.name]));

    const calendarMap = new Map<string, number>();
    for (const c of calendarsData) {
      calendarMap.set(c.id, Number(c.hours_per_week));
    }

    const holidaysByCalendar = new Map<string, CalendarHoliday[]>(
      Object.entries(holidaysRecord)
    );

    consultants = consultantsRaw.map((c) => {
      const calendarHours =
        calendarMap.get(c.calendar_id) ?? DEFAULT_HOURS_PER_WEEK;
      const workPct =
        Math.max(5, Math.min(100, Number(c.work_percentage) || 100)) / 100;
      const overheadPct =
        Math.max(0, Math.min(100, Number(c.overhead_percentage) ?? 0)) / 100;
      const hoursPerWeek = calendarHours * workPct;
      const baselineHoursPerWeek = hoursPerWeek * (1 - overheadPct);
      const holidays = holidaysByCalendar.get(c.calendar_id) ?? [];
      const startDate = (c as { start_date?: string | null }).start_date ?? null;
      const endDate = (c as { end_date?: string | null }).end_date ?? null;
      const availableHoursByWeek = weeks.map((w) => {
        const { start, end } = getISOWeekDateRange(w.year, w.week);
        const holidayCount = countWeekdayHolidaysInRange(holidays, start, end);
        const baseHours = Math.max(
          0,
          calendarHours - holidayCount * HOURS_PER_HOLIDAY
        );
        const capacityHours = baseHours * workPct;
        return capacityHours * (1 - overheadPct);
      });
      const unavailableByWeek = weeks.map((w) => {
        const { start: weekStart, end: weekEnd } = getISOWeekDateRange(
          w.year,
          w.week
        );
        if (startDate && weekEnd < startDate) return true;
        if (endDate && weekEnd > endDate) return true;
        return false;
      });
      return {
        id: c.id,
        name: c.name,
        initials: getInitials(c.name),
        hoursPerWeek,
        baselineHoursPerWeek,
        defaultRoleName: roleMap.get(c.role_id) ?? "Unknown",
        defaultRoleId: c.role_id ?? null,
        teamId: c.team_id ?? null,
        teamName: c.team_id ? teamMap.get(c.team_id) ?? null : null,
        isExternal: c.is_external ?? false,
        availableHoursByWeek,
        unavailableByWeek,
      };
    });

    const toPlanConsultant: AllocationConsultant = {
      id: TO_PLAN_CONSULTANT_ID,
      name: "To plan",
      initials: "TP",
      hoursPerWeek: 0,
      baselineHoursPerWeek: 0,
      defaultRoleName: "",
      defaultRoleId: null,
      teamId: null,
      teamName: null,
      isExternal: false,
      availableHoursByWeek: weeks.map(() => 0),
      unavailableByWeek: weeks.map(() => false),
    };
    consultants = [toPlanConsultant, ...consultants];
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error("[getAllocationPageData]", e);
    }
  }

  const projectIdsWithAllocations = new Set(
    allocations.map((a) => a.project_id)
  );
  const customerMap = new Map<string, { name: string; color: string }>();
  for (const p of projects) {
    if (projectIdsWithAllocations.has(p.id)) {
      customerMap.set(p.customer_id, {
        name: p.customerName,
        color: p.customerColor,
      });
    }
  }
  const customers: AllocationCustomer[] = Array.from(
    customerMap.entries()
  ).map(([id, { name, color }]) => ({ id, name, color }));

  return {
    consultants,
    projects,
    customers: customers.sort((a, b) => compareTextSv(a.name, b.name)),
    roles,
    teams,
    allocations,
    year,
    weekFrom,
    weekTo,
    weeks,
  };
}

const CONSULTANTS_SELECT =
  "id,name,email,role_id,calendar_id,team_id,is_external,work_percentage,overhead_percentage,start_date,end_date";

async function getConsultantsRawByIds(
  ids: string[]
): Promise<Awaited<ReturnType<typeof getCachedConsultantsRaw>>> {
  if (ids.length === 0) return [];
  const { rows } = await cloudSqlPool.query(
    `SELECT ${CONSULTANTS_SELECT} FROM consultants WHERE id = ANY($1::uuid[]) ORDER BY name`,
    [ids]
  );
  return rows as Awaited<ReturnType<typeof getCachedConsultantsRaw>>;
}

/** Allocation data scoped to one project and only consultants linked to that project's customer. For project detail planning panel. */
export async function getAllocationPageDataForProject(
  projectId: string,
  customerId: string,
  year: number,
  weekFrom: number,
  weekTo: number
): Promise<AllocationPageData> {
  const startedAt = Date.now();
  debugLog("allocation-project", "start", { projectId, customerId, year, weekFrom, weekTo });
  const weeks = buildWeeksArray(year, weekFrom, weekTo);

  const customerConsultants = await timedDebug(
    "allocation-project",
    "load customer consultants",
    () => getConsultantsByCustomerId(customerId),
    { projectId, customerId }
  );
  const consultantIds = customerConsultants.map((c) => c.id);
  const consultantsRaw = await timedDebug(
    "allocation-project",
    "load consultants raw",
    () => getConsultantsRawByIds(consultantIds),
    { projectId, consultantCount: consultantIds.length }
  );

  const [rolesData, teamsData, allocationsData, calendarsData, projectsAll] =
    await timedDebug(
      "allocation-project",
      "load role/team/allocation/calendar/project datasets",
      () =>
        Promise.all([
          getCachedRoles(),
          getCachedTeams(),
          getAllocationsForWeeks(weeks),
          getCachedCalendars(),
          getProjectsWithCustomer([projectId]),
        ]),
      { projectId, weekCount: weeks.length }
    );

  const allocations = allocationsData.filter((a) => a.project_id === projectId);
  const projects = projectsAll;

  const allProjectAllocations = await timedDebug(
    "allocation-project",
    "load all allocations for project",
    () => getAllocationsForProjectWithWeeks(projectId),
    { projectId }
  );
  const consultantTotalHours: Record<string, number> = {};
  const seenSlot = new Set<string>();
  for (const a of allProjectAllocations) {
    const slotKey = `${a.consultant_id ?? TO_PLAN_CONSULTANT_ID}-${a.year}-${a.week}-${allocationIdentityKey(a)}`;
    if (seenSlot.has(slotKey)) continue;
    seenSlot.add(slotKey);
    const consultantKey = a.consultant_id ?? TO_PLAN_CONSULTANT_ID;
    consultantTotalHours[consultantKey] =
      (consultantTotalHours[consultantKey] ?? 0) + a.hours;
  }

  const teamMap = new Map(teamsData.map((t) => [t.id, t.name]));
  const roleMap = new Map(rolesData.map((r) => [r.id, r.name]));

  const calendarMap = new Map<string, number>();
  for (const c of calendarsData) {
    calendarMap.set(c.id, Number(c.hours_per_week));
  }

  const calendarIds = [
    ...new Set(consultantsRaw.map((c) => c.calendar_id).filter(Boolean)),
  ] as string[];
  const holidaysRecord =
    calendarIds.length > 0
      ? await getCachedCalendarHolidaysByIds(calendarIds).catch(() => ({}))
      : {};
  const holidaysByCalendar = new Map<string, CalendarHoliday[]>(
    Object.entries(holidaysRecord)
  );

  let consultants: AllocationConsultant[] = consultantsRaw.map((c) => {
    const calendarHours =
      calendarMap.get(c.calendar_id) ?? DEFAULT_HOURS_PER_WEEK;
    const workPct =
      Math.max(5, Math.min(100, Number(c.work_percentage) || 100)) / 100;
    const overheadPct =
      Math.max(0, Math.min(100, Number(c.overhead_percentage) ?? 0)) / 100;
    const hoursPerWeek = calendarHours * workPct;
    const baselineHoursPerWeek = hoursPerWeek * (1 - overheadPct);
    const holidays = holidaysByCalendar.get(c.calendar_id) ?? [];
    const startDate = (c as { start_date?: string | null }).start_date ?? null;
    const endDate = (c as { end_date?: string | null }).end_date ?? null;
    const availableHoursByWeek = weeks.map((w) => {
      const { start, end } = getISOWeekDateRange(w.year, w.week);
      const holidayCount = countWeekdayHolidaysInRange(holidays, start, end);
      const baseHours = Math.max(
        0,
        calendarHours - holidayCount * HOURS_PER_HOLIDAY
      );
      const capacityHours = baseHours * workPct;
      return capacityHours * (1 - overheadPct);
    });
    const unavailableByWeek = weeks.map((w) => {
      const { start: weekStart, end: weekEnd } = getISOWeekDateRange(
        w.year,
        w.week
      );
      if (startDate && weekEnd < startDate) return true;
      if (endDate && weekEnd > endDate) return true;
      return false;
    });
    return {
      id: c.id,
      name: c.name,
      initials: getInitials(c.name),
      hoursPerWeek,
      baselineHoursPerWeek,
      defaultRoleName: roleMap.get(c.role_id) ?? "Unknown",
      defaultRoleId: c.role_id ?? null,
      teamId: c.team_id ?? null,
      teamName: c.team_id ? teamMap.get(c.team_id) ?? null : null,
      isExternal: c.is_external ?? false,
      availableHoursByWeek,
      unavailableByWeek,
    };
  });

  const toPlanConsultant: AllocationConsultant = {
    id: TO_PLAN_CONSULTANT_ID,
    name: "To plan",
    initials: "TP",
    hoursPerWeek: 0,
    baselineHoursPerWeek: 0,
    defaultRoleName: "",
    defaultRoleId: null,
    teamId: null,
    teamName: null,
    isExternal: false,
    availableHoursByWeek: weeks.map(() => 0),
    unavailableByWeek: weeks.map(() => false),
  };
  consultants = [toPlanConsultant, ...consultants];

  const projectIdsWithAllocations = new Set(allocations.map((a) => a.project_id));
  const customerMap = new Map<string, { name: string; color: string }>();
  for (const p of projects) {
    if (projectIdsWithAllocations.has(p.id)) {
      customerMap.set(p.customer_id, {
        name: p.customerName,
        color: p.customerColor,
      });
    }
  }
  const customers: AllocationCustomer[] = Array.from(customerMap.entries()).map(
    ([id, { name, color }]) => ({ id, name, color })
  );

  const result = {
    consultants,
    projects,
    customers: customers.sort((a, b) => compareTextSv(a.name, b.name)),
    roles: rolesData,
    teams: teamsData,
    allocations,
    year,
    weekFrom,
    weekTo,
    weeks,
    consultantTotalHours,
  };
  debugLog("allocation-project", "done", {
    projectId,
    durationMs: Date.now() - startedAt,
    consultants: result.consultants.length,
    allocations: result.allocations.length,
    projectRows: result.projects.length,
  });
  return result;
}
