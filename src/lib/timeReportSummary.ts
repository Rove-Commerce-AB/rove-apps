import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { getConsultantForCurrentUser } from "@/lib/consultants";
import { getInternalCustomerId } from "@/lib/customers";
import { getCurrentCalendarYearMonth } from "@/lib/dateUtils";
import type { ProjectType } from "@/types";
import type {
  TimeReportSummaryBucket,
  TimeReportSummaryData,
} from "./timeReportSummaryTypes";

export type { TimeReportSummaryBucket, TimeReportSummaryData } from "./timeReportSummaryTypes";

function calendarYearBounds(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function parseProjectType(value: string): ProjectType {
  if (value === "internal" || value === "absence") return value;
  return "customer";
}

export async function getTimeReportSummary(
  year?: number
): Promise<TimeReportSummaryData> {
  const consultant = await getConsultantForCurrentUser();
  const { year: currentYear } = getCurrentCalendarYearMonth();
  const selectedYear =
    year != null && Number.isFinite(year) && year >= 2000 && year <= 2100
      ? Math.trunc(year)
      : currentYear;

  if (!consultant?.id) {
    return {
      consultantId: null,
      consultantName: null,
      year: selectedYear,
      availableYears: [currentYear],
      buckets: [],
    };
  }

  const excludeInternalId = consultant.isExternal
    ? await getInternalCustomerId()
    : null;
  const { start, end } = calendarYearBounds(selectedYear);

  const [yearRows, bucketRows] = await Promise.all([
    cloudSqlPool.query<{ y: number }>(
      excludeInternalId
        ? `SELECT DISTINCT EXTRACT(YEAR FROM entry_date)::int AS y
           FROM time_report_entries
           WHERE consultant_id = $1
             AND customer_id <> $2::uuid
           ORDER BY y DESC`
        : `SELECT DISTINCT EXTRACT(YEAR FROM entry_date)::int AS y
           FROM time_report_entries
           WHERE consultant_id = $1
           ORDER BY y DESC`,
      excludeInternalId ? [consultant.id, excludeInternalId] : [consultant.id]
    ),
    cloudSqlPool.query<{
      customer_id: string;
      customer_name: string;
      project_id: string;
      project_name: string;
      project_type: string;
      absence_code: string | null;
      month: number;
      hours: string | number;
    }>(
      excludeInternalId
        ? `SELECT
             tre.customer_id::text AS customer_id,
             cu.name AS customer_name,
             tre.project_id::text AS project_id,
             p.name AS project_name,
             p.type::text AS project_type,
             NULLIF(btrim(p.absence_code), '') AS absence_code,
             EXTRACT(MONTH FROM tre.entry_date)::int AS month,
             SUM(tre.hours) AS hours
           FROM time_report_entries tre
           JOIN customers cu ON cu.id = tre.customer_id
           JOIN projects p ON p.id = tre.project_id
           WHERE tre.consultant_id = $1
             AND tre.entry_date >= $2::date
             AND tre.entry_date <= $3::date
             AND tre.customer_id <> $4::uuid
           GROUP BY tre.customer_id, cu.name, tre.project_id, p.name, p.type,
                    p.absence_code, EXTRACT(MONTH FROM tre.entry_date)`
        : `SELECT
             tre.customer_id::text AS customer_id,
             cu.name AS customer_name,
             tre.project_id::text AS project_id,
             p.name AS project_name,
             p.type::text AS project_type,
             NULLIF(btrim(p.absence_code), '') AS absence_code,
             EXTRACT(MONTH FROM tre.entry_date)::int AS month,
             SUM(tre.hours) AS hours
           FROM time_report_entries tre
           JOIN customers cu ON cu.id = tre.customer_id
           JOIN projects p ON p.id = tre.project_id
           WHERE tre.consultant_id = $1
             AND tre.entry_date >= $2::date
             AND tre.entry_date <= $3::date
           GROUP BY tre.customer_id, cu.name, tre.project_id, p.name, p.type,
                    p.absence_code, EXTRACT(MONTH FROM tre.entry_date)`,
      excludeInternalId
        ? [consultant.id, start, end, excludeInternalId]
        : [consultant.id, start, end]
    ),
  ]);

  const availableYears = [
    ...new Set([currentYear, ...yearRows.rows.map((r) => Number(r.y))]),
  ]
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => b - a);

  const buckets: TimeReportSummaryBucket[] = bucketRows.rows.map((r) => ({
    customerId: r.customer_id,
    customerName: r.customer_name,
    projectId: r.project_id,
    projectName: r.project_name,
    projectType: parseProjectType(r.project_type),
    absenceCode: r.absence_code,
    month: Number(r.month),
    hours: Number(r.hours ?? 0),
  }));

  return {
    consultantId: consultant.id,
    consultantName: consultant.name,
    year: selectedYear,
    availableYears,
    buckets,
  };
}
