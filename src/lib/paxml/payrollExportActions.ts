"use server";

import { assertAdmin } from "@/lib/accessGuards";
import { buildPaxmlDocument } from "@/lib/paxml/buildPaxml";
import {
  fetchPayrollExportPreview,
  type PayrollExportPreview,
} from "@/lib/paxml/payrollExportQueries";

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function getPayrollExportPreviewAction(
  fromDate: string,
  toDate: string
): Promise<PayrollExportPreview> {
  await assertAdmin();
  if (!isIsoDate(fromDate) || !isIsoDate(toDate)) {
    throw new Error("Invalid date range");
  }
  if (fromDate > toDate) {
    throw new Error("From date must be on or before to date");
  }
  return fetchPayrollExportPreview(fromDate, toDate);
}

export async function buildPayrollPaxmlAction(input: {
  fromDate: string;
  toDate: string;
  /** Entry ids to include. Only includable rows are exported. */
  includedEntryIds: string[];
}): Promise<{ fileName: string; xml: string; excludedCount: number }> {
  await assertAdmin();
  if (!isIsoDate(input.fromDate) || !isIsoDate(input.toDate)) {
    throw new Error("Invalid date range");
  }
  if (input.fromDate > input.toDate) {
    throw new Error("From date must be on or before to date");
  }

  const preview = await fetchPayrollExportPreview(input.fromDate, input.toDate);
  const include = new Set(input.includedEntryIds);
  const selected = preview.absences.filter(
    (row) => include.has(row.entryId) && row.includable
  );
  const excludedCount = preview.absences.length - selected.length;

  const xml = buildPaxmlDocument(
    selected.map((row) => ({
      employmentNumber: row.employmentNumber as string,
      tidkod: row.absenceCode as string,
      date: row.entryDate,
      hours: row.hours,
    }))
  );

  const fileName = `fortnox-franvaro-${input.fromDate}_${input.toDate}.pax`;
  return { fileName, xml, excludedCount };
}
