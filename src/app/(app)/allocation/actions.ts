"use server";

import { revalidatePath } from "next/cache";
import { ROUTES } from "@/lib/routes";
import { getAvailableHoursForConsultantWeek } from "@/lib/consultants";
import { createAllocationsForWeekRangeWithGetter } from "@/lib/allocations";
import { assertNotSubcontractorForWrite } from "@/lib/accessGuards";
import {
  logBulkAllocationHistory as logBulkAllocationHistoryRaw,
  logAllocationHistory as logAllocationHistoryRaw,
  logAllocationHistoryCreate as logAllocationHistoryCreateRaw,
  logAllocationHistoryUpdate as logAllocationHistoryUpdateRaw,
  getBookingAllocationsForRow as getBookingAllocationsForRowRaw,
  deleteAllocationWithHistory as deleteAllocationWithHistoryRaw,
  deleteAllocationsWithHistory as deleteAllocationsWithHistoryRaw,
  deleteAllocationsInWeekRange as deleteAllocationsInWeekRangeRaw,
} from "@/lib/allocationWrite";
import type { AllocationHistoryEntry } from "@/types";
import type { AllocationHistoryDetails } from "@/types";
import {
  getAllocationPageData,
  getAllocationPageDataForProject,
} from "@/lib/allocationPage";
import type { AllocationPageData } from "@/lib/allocationPageTypes";
import {
  getConsultantProjectPlanningPanels,
  getCustomerProjectPlanningPanels,
} from "@/lib/plannerMultiProjectPlanning";
import type { PlannerProjectPlanningPanel } from "@/lib/plannerMultiProjectPlanningTypes";

export async function revalidateAllocationPage(): Promise<void> {
  await assertNotSubcontractorForWrite();
  revalidatePath(ROUTES.planner, "layout");
}

export async function getAllocationHistory(
  limit = 100
): Promise<AllocationHistoryEntry[]> {
  await assertNotSubcontractorForWrite();
  const { fetchAllocationHistory } = await import("@/lib/allocationHistory");
  return fetchAllocationHistory(limit);
}

export async function logAllocationHistory(
  allocationId: string | null,
  action: "create" | "update" | "delete" | "bulk",
  details?: AllocationHistoryDetails
): Promise<void> {
  await assertNotSubcontractorForWrite();
  return logAllocationHistoryRaw(allocationId, action, details);
}

export async function logAllocationHistoryCreate(allocationId: string): Promise<void> {
  await assertNotSubcontractorForWrite();
  return logAllocationHistoryCreateRaw(allocationId);
}

export async function logAllocationHistoryUpdate(
  allocationId: string,
  hoursAfter: number
): Promise<void> {
  await assertNotSubcontractorForWrite();
  return logAllocationHistoryUpdateRaw(allocationId, hoursAfter);
}

export async function logBulkAllocationHistory(
  allocationIds: string[],
  totalHours: number
): Promise<void> {
  await assertNotSubcontractorForWrite();
  return logBulkAllocationHistoryRaw(allocationIds, totalHours);
}

export async function getBookingAllocationsForRow(
  consultantId: string | null,
  projectId: string,
  roleId: string | null
): Promise<{ id: string; year: number; week: number }[]> {
  await assertNotSubcontractorForWrite();
  return getBookingAllocationsForRowRaw(consultantId, projectId, roleId);
}

export async function deleteAllocationWithHistory(allocationId: string): Promise<void> {
  await assertNotSubcontractorForWrite();
  return deleteAllocationWithHistoryRaw(allocationId);
}

export async function deleteAllocationsWithHistory(allocationIds: string[]): Promise<void> {
  await assertNotSubcontractorForWrite();
  return deleteAllocationsWithHistoryRaw(allocationIds);
}

export async function deleteAllocationsInWeekRange(
  consultantId: string | null,
  projectId: string,
  roleId: string | null,
  year: number,
  weekFrom: number,
  weekTo: number
): Promise<void> {
  await assertNotSubcontractorForWrite();
  return deleteAllocationsInWeekRangeRaw(
    consultantId,
    projectId,
    roleId,
    year,
    weekFrom,
    weekTo
  );
}

export async function createAllocationsByPercent(
  consultantId: string | null,
  projectId: string,
  roleId: string | null,
  year: number,
  weekFrom: number,
  weekTo: number,
  percent: number
): Promise<void> {
  await assertNotSubcontractorForWrite();
  const pct = Math.max(0, Math.min(100, percent)) / 100;
  if (pct === 0) {
    await deleteAllocationsInWeekRangeRaw(
      consultantId,
      projectId,
      roleId,
      year,
      weekFrom,
      weekTo
    );
    revalidatePath(ROUTES.planner, "layout");
    return;
  }
  const records = await createAllocationsForWeekRangeWithGetter(
    consultantId,
    projectId,
    roleId,
    year,
    weekFrom,
    weekTo,
    consultantId === null
      ? async () => Math.round(40 * pct * 100) / 100
      : async (y, w) => {
          const available = await getAvailableHoursForConsultantWeek(
            consultantId,
            y,
            w
          );
          return Math.round(available * pct * 100) / 100;
        }
  );
  revalidatePath(ROUTES.planner, "layout");
  if (records.length > 0) {
    void logBulkAllocationHistoryRaw(
      records.map((r) => r.id),
      records.reduce((s, r) => s + r.hours, 0)
    );
  }
}

export async function getAllocationData(
  year: number,
  weekFrom: number,
  weekTo: number
): Promise<{ data: AllocationPageData | null; error: string | null }> {
  try {
    const data = await getAllocationPageData(year, weekFrom, weekTo);
    return { data, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load allocation data";
    return { data: null, error: message };
  }
}

export async function getProjectAllocationData(
  projectId: string,
  customerId: string,
  year: number,
  weekFrom: number,
  weekTo: number
): Promise<{ data: AllocationPageData | null; error: string | null }> {
  try {
    const data = await getAllocationPageDataForProject(
      projectId,
      customerId,
      year,
      weekFrom,
      weekTo
    );
    return { data, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load planning data";
    return { data: null, error: message };
  }
}

export async function getCustomerProjectPlanningData(
  customerId: string,
  year: number,
  weekFrom: number,
  weekTo: number
): Promise<{
  panels: PlannerProjectPlanningPanel[];
  error: string | null;
}> {
  try {
    const panels = await getCustomerProjectPlanningPanels(
      customerId,
      year,
      weekFrom,
      weekTo
    );
    return { panels, error: null };
  } catch (e) {
    return {
      panels: [],
      error:
        e instanceof Error ? e.message : "Could not load planning data",
    };
  }
}

export async function getConsultantProjectPlanningData(
  consultantId: string,
  year: number,
  weekFrom: number,
  weekTo: number
): Promise<{
  panels: PlannerProjectPlanningPanel[];
  error: string | null;
}> {
  try {
    const panels = await getConsultantProjectPlanningPanels(
      consultantId,
      year,
      weekFrom,
      weekTo
    );
    return { panels, error: null };
  } catch (e) {
    return {
      panels: [],
      error:
        e instanceof Error ? e.message : "Could not load planning data",
    };
  }
}
