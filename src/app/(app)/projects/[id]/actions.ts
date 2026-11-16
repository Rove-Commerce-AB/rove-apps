"use server";

import { revalidatePath } from "next/cache";
import { moveAllocationsForProject } from "@/lib/allocations";
import { assertNotSubcontractorForWrite } from "@/lib/accessGuards";
import { ROUTES, projectHref } from "@/lib/routes";

export async function moveEntireBookingAction(
  projectId: string,
  deltaWeeks: number
): Promise<{ ok: boolean; error?: string; moved?: number }> {
  try {
    await assertNotSubcontractorForWrite();
    const { moved } = await moveAllocationsForProject(projectId, deltaWeeks);
    revalidatePath(projectHref(projectId));
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(ROUTES.planner, "layout");
    revalidatePath("/reports");
    return { ok: true, moved };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to move bookings",
    };
  }
}
