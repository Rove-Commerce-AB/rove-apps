"use server";

import { revalidatePath } from "next/cache";
import { assertNotSubcontractorForWrite } from "@/lib/accessGuards";
import {
  deletePlannerLeaveDay,
  getPlannerLeavePageData,
  listConsultantIdsForCurrentPm,
  upsertPlannerLeaveDay,
  upsertPlannerLeaveRange,
  type PlannerLeavePageData,
} from "@/lib/plannerLeave";
import { ROUTES } from "@/lib/routes";

function revalidatePlanner() {
  revalidatePath(ROUTES.planner, "layout");
  revalidatePath(ROUTES.plannerPlanAvailability);
}

export async function loadPlannerLeavePageAction(
  fromDate: string,
  toDate: string
): Promise<PlannerLeavePageData> {
  await assertNotSubcontractorForWrite();
  return getPlannerLeavePageData({ fromDate, toDate });
}

export async function upsertPlannerLeaveDayAction(input: {
  consultantId: string;
  projectId: string;
  leaveDate: string;
  hours: number;
  note?: string | null;
}) {
  await assertNotSubcontractorForWrite();
  const row = await upsertPlannerLeaveDay(input);
  revalidatePlanner();
  return row;
}

export async function deletePlannerLeaveDayAction(id: string) {
  await assertNotSubcontractorForWrite();
  await deletePlannerLeaveDay(id);
  revalidatePlanner();
}

export async function upsertPlannerLeaveRangeAction(input: {
  consultantId: string;
  projectId: string;
  dates: string[];
  hoursPerDay: number;
}) {
  await assertNotSubcontractorForWrite();
  await upsertPlannerLeaveRange(input);
  revalidatePlanner();
}

export async function loadPmConsultantIdsAction(): Promise<string[]> {
  await assertNotSubcontractorForWrite();
  return listConsultantIdsForCurrentPm();
}
