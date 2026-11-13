import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { getAllocationsForWeeks } from "@/lib/allocations";
import { getCachedConsultantsRaw } from "@/lib/consultantsCache";
import { fetchCalendarHolidaysByCalendarIds } from "@/lib/calendarHolidaysQueries";
import { getInternalCustomerId } from "@/lib/customers";
import { getMonthLabel, getWeeksInMonth, getWorkingDaysByMonthInWeek } from "@/lib/dateUtils";
import { fetchCustomerRatesByCustomerIds } from "@/lib/customerRatesQueries";
import { fetchProjectRatesByProjectIds } from "@/lib/projectRatesQueries";
import { getProjectsWithCustomer } from "@/lib/projects";
import type { ProbabilityDisplay } from "@/lib/allocationPageView";
import { getRevenueForecast } from "@/lib/revenueForecast";
import type {
  BillableUtilizationMonth,
  BillableUtilizationMonthPoint,
  BillableUtilizationMonthlyReportResult,
} from "@/types/billableUtilizationReport";

export type { ProbabilityDisplay };

function yearMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function pct(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 1000) / 10;
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function workPctFromConsultant(c: { work_percentage?: number | string | null }): number {
  return Math.max(5, Math.min(100, Number(c.work_percentage) || 100)) / 100;
}

/** Weekday working hours in a calendar month (no work %, no overhead). */
function calendarHoursInMonth(
  year: number,
  month: number,
  hoursPerWeek: number,
  holidaySet: Set<string>
): number {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const daily = hoursPerWeek / 5;
  let total = 0;
  const cur = new Date(first);
  while (cur <= last) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6 && !holidaySet.has(toYmd(cur))) {
      total += daily;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}

type ReportedRow = {
  year_month: string;
  invoiced_hours: string | number | null;
  income: string | number | null;
};

async function fetchReportedByMonth(
  keys: string[],
  consultantIds: string[]
): Promise<Map<string, { invoiced: number; income: number }>> {
  if (consultantIds.length === 0) return new Map();
  const { rows } = await cloudSqlPool.query<ReportedRow>(
    `SELECT v.year_month,
            SUM(v.invoiced_hours) AS invoiced_hours,
            SUM(v.income) AS income
     FROM v_consultant_monthly_summary v
     INNER JOIN consultants c ON c.name = v.consultant_name
     WHERE v.external = false
       AND v.year_month = ANY($1::text[])
       AND c.id = ANY($2::uuid[])
     GROUP BY v.year_month`,
    [keys, consultantIds]
  );
  return new Map(
    rows.map((r) => [
      r.year_month,
      { invoiced: Number(r.invoiced_hours ?? 0), income: Number(r.income ?? 0) },
    ])
  );
}

type TargetRow = { id: string; utilization_target_pct: string | number | null };

async function fetchUtilizationTargets(
  consultantIds: string[]
): Promise<Map<string, number>> {
  if (consultantIds.length === 0) return new Map();
  try {
    const { rows } = await cloudSqlPool.query<TargetRow>(
      `SELECT id, utilization_target_pct
       FROM consultants
       WHERE id = ANY($1::uuid[]) AND utilization_target_pct IS NOT NULL`,
      [consultantIds]
    );
    return new Map(
      rows.map((r) => [r.id, Number(r.utilization_target_pct)])
    );
  } catch {
    return new Map();
  }
}

/**
 * Company-wide billable utilization per calendar month.
 * Forecast from allocations (customer projects), prorated by working day per month.
 * Denominator = calendar month hours × consultant capacity (work %); no overhead adjustment.
 */
function allocationHoursForView(
  hours: number,
  probability: number,
  probabilityDisplay: ProbabilityDisplay
): number {
  if (probabilityDisplay === "weighted") {
    return Math.round(hours * (probability / 100));
  }
  return hours;
}

export async function getBillableUtilizationMonthlyReport(
  calendarMonths: { year: number; month: number }[],
  teamId?: string | string[] | null,
  probabilityDisplay: ProbabilityDisplay = "weighted"
): Promise<BillableUtilizationMonthlyReportResult> {
  const months: BillableUtilizationMonth[] = calendarMonths.map((m) => ({
    year: m.year,
    month: m.month,
    label: getMonthLabel(m.month, m.year),
  }));

  if (calendarMonths.length === 0) {
    return { months, points: [] };
  }

  const keysSet = new Set(calendarMonths.map((m) => yearMonthKey(m.year, m.month)));
  const keys = [...keysSet];

  const weekKey = new Set<string>();
  const weeks: { year: number; week: number }[] = [];
  for (const m of calendarMonths) {
    for (const w of getWeeksInMonth(m.month, m.year)) {
      const k = `${w.year}-${w.week}`;
      if (!weekKey.has(k)) {
        weekKey.add(k);
        weeks.push(w);
      }
    }
  }

  const teamIds =
    teamId == null || teamId === ""
      ? []
      : Array.isArray(teamId)
        ? teamId.filter(Boolean)
        : [teamId];
  const consultantsRaw = await getCachedConsultantsRaw();
  const consultants = consultantsRaw.filter(
    (c) =>
      !(c as { is_external?: boolean }).is_external &&
      (teamIds.length === 0 ||
        teamIds.includes(
          (c as { team_id?: string | null }).team_id ?? ""
        ))
  );
  const consultantIds = consultants.map((c) => c.id);
  const consultantById = new Map(consultants.map((c) => [c.id, c]));

  const [calQuery, allocations, internalCustomerId, reportedByMonth, targets] =
    await Promise.all([
      cloudSqlPool.query<{ id: string; hours_per_week: string | number }>(
        `SELECT id, hours_per_week FROM calendars`
      ),
      weeks.length > 0 ? getAllocationsForWeeks(weeks) : Promise.resolve([]),
      getInternalCustomerId(),
      fetchReportedByMonth(keys, consultantIds),
      fetchUtilizationTargets(consultantIds),
    ]);

  const hoursPerWeekByCalendar = new Map(
    calQuery.rows.map((c) => [c.id, Number(c.hours_per_week) || 40])
  );

  const calendarIds = [
    ...new Set(consultants.map((c) => c.calendar_id).filter(Boolean)),
  ];
  const holidaysByCalendarRaw =
    await fetchCalendarHolidaysByCalendarIds(calendarIds);
  const holidaysByCalendar = new Map<string, Set<string>>();
  for (const calId of calendarIds) {
    const holidays = holidaysByCalendarRaw.get(calId) ?? [];
    holidaysByCalendar.set(
      calId,
      new Set(holidays.map((h) => h.holiday_date))
    );
  }

  const projectIds = [...new Set(allocations.map((a) => a.project_id))];
  const projects =
    projectIds.length > 0 ? await getProjectsWithCustomer(projectIds) : [];
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const capacityHoursByMonth = new Map<string, number>();
  const budgetBillableByMonth = new Map<string, number>();
  const budgetCapacityByMonth = new Map<string, number>();

  for (const m of calendarMonths) {
    const key = yearMonthKey(m.year, m.month);
    let capacityTotal = 0;
    let budgetBillable = 0;
    let budgetCapacity = 0;

    for (const c of consultants) {
      const hpw = hoursPerWeekByCalendar.get(c.calendar_id) ?? 40;
      const holidays = holidaysByCalendar.get(c.calendar_id) ?? new Set();
      const calendarHours = calendarHoursInMonth(m.year, m.month, hpw, holidays);
      const monthCapacityHours = calendarHours * workPctFromConsultant(c);
      capacityTotal += monthCapacityHours;

      const targetPct = targets.get(c.id);
      if (targetPct != null && Number.isFinite(targetPct)) {
        budgetBillable += monthCapacityHours * (targetPct / 100);
        budgetCapacity += monthCapacityHours;
      }
    }

    capacityHoursByMonth.set(key, capacityTotal);
    budgetBillableByMonth.set(key, budgetBillable);
    budgetCapacityByMonth.set(key, budgetCapacity);
  }

  const allocatedByMonth = new Map<string, number>();
  for (const a of allocations) {
    if (!a.consultant_id || !consultantById.has(a.consultant_id)) continue;
    const project = projectMap.get(a.project_id);
    if (!project || project.type !== "customer") continue;
    if (internalCustomerId && project.customer_id === internalCustomerId) continue;

    const consultant = consultantById.get(a.consultant_id)!;
    const holidays = holidaysByCalendar.get(consultant.calendar_id) ?? new Set();
    const workingDaysByMonth = getWorkingDaysByMonthInWeek(a.year, a.week, holidays);
    const totalWorkingDays = workingDaysByMonth.reduce(
      (sum, x) => sum + x.workingDays,
      0
    );
    if (totalWorkingDays === 0) continue;

    const rawHours = Number(a.hours);
    const prob = project.probability ?? 100;
    const hours = allocationHoursForView(rawHours, prob, probabilityDisplay);
    for (const { year, month, workingDays } of workingDaysByMonth) {
      const key = yearMonthKey(year, month);
      if (!keysSet.has(key)) continue;
      const hoursInMonth = (hours * workingDays) / totalWorkingDays;
      allocatedByMonth.set(key, (allocatedByMonth.get(key) ?? 0) + hoursInMonth);
    }
  }

  const first = calendarMonths[0]!;
  const last = calendarMonths[calendarMonths.length - 1]!;
  const revenueByKey = new Map<string, { revenue: number; currency: string }>();

  if (probabilityDisplay === "weighted") {
    const customerIds = [
      ...new Set(
        projects
          .map((p) => p.customer_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const allRates = await fetchCustomerRatesByCustomerIds(customerIds);
    const allProjectRates = await fetchProjectRatesByProjectIds(projectIds);
    const ratesByCustomer = new Map<
      string,
      { id: string; role_id: string | null; rate_per_hour: number; currency: string }[]
    >();
    for (const cid of customerIds) {
      ratesByCustomer.set(
        cid,
        allRates
          .filter((r) => r.customer_id === cid)
          .map((r) => ({
            id: r.id,
            role_id: r.role_id,
            rate_per_hour: r.rate_per_hour,
            currency: r.currency ?? "SEK",
          }))
      );
    }

    for (const a of allocations) {
      if (!a.consultant_id || !consultantById.has(a.consultant_id)) continue;
      const project = projectMap.get(a.project_id);
      if (!project || project.type !== "customer") continue;
      if (internalCustomerId && project.customer_id === internalCustomerId) continue;

      const consultant = consultantById.get(a.consultant_id)!;
      if (!project.customer_id) continue;
      let rateRow:
        | { rate_per_hour: number; currency: string }
        | undefined;
      if (a.project_rate_id) {
        rateRow = allProjectRates.find((r) => r.id === a.project_rate_id);
      } else if (a.customer_rate_id) {
        rateRow = (ratesByCustomer.get(project.customer_id) ?? []).find(
          (r) => r.id === a.customer_rate_id
        );
      } else {
        const roleId = a.role_id ?? (consultant as { role_id?: string }).role_id;
        if (!roleId) continue;
        rateRow =
          allProjectRates.find(
            (r) => r.project_id === a.project_id && r.role_id === roleId
          ) ??
          (ratesByCustomer.get(project.customer_id) ?? []).find(
            (r) => r.role_id === roleId
          );
      }
      if (!rateRow) continue;

      const holidays = holidaysByCalendar.get(consultant.calendar_id) ?? new Set();
      const workingDaysByMonth = getWorkingDaysByMonthInWeek(a.year, a.week, holidays);
      const totalWorkingDays = workingDaysByMonth.reduce(
        (sum, x) => sum + x.workingDays,
        0
      );
      if (totalWorkingDays === 0) continue;

      const hours = allocationHoursForView(
        Number(a.hours),
        project.probability ?? 100,
        probabilityDisplay
      );

      for (const { year, month, workingDays } of workingDaysByMonth) {
        const key = yearMonthKey(year, month);
        if (!keysSet.has(key)) continue;
        const hoursInMonth = (hours * workingDays) / totalWorkingDays;
        const revenue = hoursInMonth * rateRow.rate_per_hour;
        const existing = revenueByKey.get(key);
        if (existing) {
          if (existing.currency === rateRow.currency) {
            existing.revenue += revenue;
          }
        } else {
          revenueByKey.set(key, { revenue, currency: rateRow.currency });
        }
      }
    }
  } else {
    const revenueForecast = await getRevenueForecast(
      first.year,
      1,
      last.year,
      12
    );
    for (const m of revenueForecast) {
      const key = yearMonthKey(m.year, m.month);
      const existing = revenueByKey.get(key);
      if (existing) {
        if (existing.currency === m.currency) {
          existing.revenue += m.revenue;
        }
      } else {
        revenueByKey.set(key, {
          revenue: m.revenue,
          currency: m.currency,
        });
      }
    }
  }

  const points: BillableUtilizationMonthPoint[] = calendarMonths.map((m) => {
    const key = yearMonthKey(m.year, m.month);
    const reported = reportedByMonth.get(key);
    const actualBillable = reported?.invoiced ?? 0;
    const forecastBillable = allocatedByMonth.get(key) ?? 0;
    const monthCapacityHours = capacityHoursByMonth.get(key) ?? 0;
    const budgetBillable = budgetBillableByMonth.get(key) ?? 0;
    const budgetCapacity = budgetCapacityByMonth.get(key) ?? 0;
    const rev = revenueByKey.get(key);
    const budgetUtilizationPct =
      budgetCapacity > 0 ? pct(budgetBillable, budgetCapacity) : null;

    return {
      actualBillableHours: actualBillable,
      forecastBillableHours: forecastBillable,
      monthCapacityHours,
      actualUtilizationPct: pct(actualBillable, monthCapacityHours),
      forecastUtilizationPct: pct(forecastBillable, monthCapacityHours),
      budgetUtilizationPct,
      actualRevenue: reported?.income ?? 0,
      forecastRevenue: rev?.revenue ?? 0,
      currency: rev?.currency ?? "SEK",
    };
  });

  return { months, points };
}
