import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { isAbsenceCode } from "@/lib/paxml/absenceCodes";

export type PayrollAbsenceRow = {
  entryId: string;
  consultantId: string;
  consultantName: string;
  employmentNumber: string | null;
  projectId: string;
  projectName: string;
  absenceCode: string | null;
  entryDate: string;
  hours: number;
  includable: boolean;
  issues: string[];
};

export type PayrollPartTimeRow = {
  consultantId: string;
  consultantName: string;
  employmentNumber: string | null;
  workPercentage: number;
};

export type PayrollExportPreview = {
  fromDate: string;
  toDate: string;
  absences: PayrollAbsenceRow[];
  partTime: PayrollPartTimeRow[];
};

export async function fetchPayrollExportPreview(
  fromDate: string,
  toDate: string
): Promise<PayrollExportPreview> {
  const [{ rows: absenceRows }, { rows: partTimeRows }] = await Promise.all([
    cloudSqlPool.query<{
      entry_id: string;
      consultant_id: string;
      consultant_name: string;
      employment_number: string | null;
      project_id: string;
      project_name: string;
      absence_code: string | null;
      entry_date: string;
      hours: string | number;
    }>(
      `SELECT
         e.id::text AS entry_id,
         c.id::text AS consultant_id,
         c.name AS consultant_name,
         NULLIF(btrim(c.employment_number), '') AS employment_number,
         p.id::text AS project_id,
         p.name AS project_name,
         NULLIF(btrim(p.absence_code), '') AS absence_code,
         e.entry_date::text AS entry_date,
         e.hours
       FROM time_report_entries e
       JOIN consultants c ON c.id = e.consultant_id
       JOIN projects p ON p.id = e.project_id
       WHERE p.type = 'absence'
         AND e.entry_date >= $1::date
         AND e.entry_date <= $2::date
         AND e.hours > 0
         AND COALESCE(c.is_external, false) = false
       ORDER BY c.name, e.entry_date, p.name`,
      [fromDate, toDate]
    ),
    cloudSqlPool.query<{
      consultant_id: string;
      consultant_name: string;
      employment_number: string | null;
      work_percentage: number;
    }>(
      `SELECT
         c.id::text AS consultant_id,
         c.name AS consultant_name,
         NULLIF(btrim(c.employment_number), '') AS employment_number,
         c.work_percentage
       FROM consultants c
       WHERE c.work_percentage < 100
         AND COALESCE(c.is_external, false) = false
         AND (c.end_date IS NULL OR c.end_date >= $1::date)
         AND (c.start_date IS NULL OR c.start_date <= $2::date)
       ORDER BY c.work_percentage ASC, c.name`,
      [fromDate, toDate]
    ),
  ]);

  const absences: PayrollAbsenceRow[] = absenceRows.map((row) => {
    const issues: string[] = [];
    const employmentNumber = row.employment_number;
    const absenceCode = row.absence_code;
    if (!employmentNumber) issues.push("Missing employment number");
    if (!absenceCode) issues.push("Missing absence code on project");
    else if (!isAbsenceCode(absenceCode)) {
      issues.push(`Unknown absence code: ${absenceCode}`);
    }
    const hours = Number(row.hours);
    if (!Number.isFinite(hours) || hours <= 0) issues.push("Invalid hours");

    return {
      entryId: row.entry_id,
      consultantId: row.consultant_id,
      consultantName: row.consultant_name,
      employmentNumber,
      projectId: row.project_id,
      projectName: row.project_name,
      absenceCode,
      entryDate: row.entry_date,
      hours,
      includable: issues.length === 0,
      issues,
    };
  });

  const partTime: PayrollPartTimeRow[] = partTimeRows.map((row) => ({
    consultantId: row.consultant_id,
    consultantName: row.consultant_name,
    employmentNumber: row.employment_number,
    workPercentage: Number(row.work_percentage),
  }));

  return { fromDate, toDate, absences, partTime };
}
