"use server";

import { getOccupancyReportData } from "@/lib/occupancyReport";
import {
  expandYearWeekRangeInclusive,
  getAllocationBudgetDrilldown,
} from "@/lib/allocationBudgetReport";
import {
  getBillableUtilizationMonthlyReport,
  type ProbabilityDisplay,
} from "@/lib/billableUtilizationReport";
import type { BillableUtilizationMonthlyReportResult } from "@/types/billableUtilizationReport";
import type { OccupancyReportResult } from "@/types/occupancyReport";
import type { AllocationBudgetDrilldownResult } from "@/types/allocationBudgetReport";
import { assertAdmin, assertNotSubcontractorForWrite } from "@/lib/accessGuards";

export async function getOccupancyReportDataAction(
  weeks: { year: number; week: number }[],
  roleId: string | string[] | null,
  teamId?: string | string[] | null
): Promise<OccupancyReportResult> {
  await assertNotSubcontractorForWrite();
  return getOccupancyReportData(weeks, roleId, teamId);
}

export async function getBillableUtilizationMonthlyReportAction(
  months: { year: number; month: number }[],
  teamId?: string | string[] | null,
  probabilityDisplay: ProbabilityDisplay = "weighted"
): Promise<BillableUtilizationMonthlyReportResult> {
  await assertNotSubcontractorForWrite();
  return getBillableUtilizationMonthlyReport(months, teamId, probabilityDisplay);
}

export async function getAllocationBudgetDrilldownAction(
  from: { year: number; week: number },
  to: { year: number; week: number }
): Promise<AllocationBudgetDrilldownResult> {
  await assertAdmin();
  const weeks = expandYearWeekRangeInclusive(from, to);
  return getAllocationBudgetDrilldown(weeks);
}
