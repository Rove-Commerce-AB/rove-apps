import "server-only";

import { cache } from "react";
import { revalidatePath, revalidateTag } from "next/cache";

import { getCurrentAppUser } from "./appUsers";
import { addConsultantToCustomer } from "./customerConsultants";
import { getInternalCustomerId } from "./customers";
import { ROUTES, consultantHref } from "./routes";
import * as q from "./consultantsQueries";

export type {
  ConsultantListItem,
  CreateConsultantInput,
  UpdateConsultantInput,
  ConsultantForEdit,
} from "./consultantsQueries";

/**
 * Internal consultants are linked to the internal customer when it exists.
 * Returns the internal customer id when a link was created (caller may revalidate paths).
 */
export async function linkNewInternalConsultantToInternalCustomer(
  consultantId: string,
  input: q.CreateConsultantInput
): Promise<string | null> {
  const isInternal = !(input.is_external ?? false);
  if (!isInternal) return null;
  const internalCustomerId = await getInternalCustomerId();
  if (!internalCustomerId) return null;
  await addConsultantToCustomer(internalCustomerId, consultantId);
  return internalCustomerId;
}

export async function createConsultant(input: q.CreateConsultantInput) {
  return q.createConsultantQuery(input);
}

export async function updateConsultant(id: string, input: q.UpdateConsultantInput) {
  const updated = await q.updateConsultantQuery(id, input);
  if (!updated) return;
  revalidateTag("allocation-consultants", "max");
  revalidatePath(ROUTES.consultants);
  revalidatePath(ROUTES.people);
  revalidatePath(consultantHref(id));
  revalidatePath(ROUTES.planner, "layout");
}

export async function consultantHasDeleteBlockers(id: string) {
  return q.consultantHasDeleteBlockers(id);
}

export async function deleteConsultant(id: string) {
  const result = await q.deleteConsultantQuery(id);
  revalidatePath(ROUTES.people);
  return result;
}

export const getConsultantForCurrentUser = cache(async () => {
  const user = await getCurrentAppUser();
  if (!user?.id) return null;
  return q.fetchConsultantByAppUserId(user.id);
});

export async function getConsultantById(id: string) {
  return q.fetchConsultantById(id);
}

export async function getConsultantsWithDefaultRole() {
  return q.fetchConsultantsWithDefaultRole();
}

export const getConsultantsList = cache(async () => {
  return q.fetchConsultantsList();
});

export async function getConsultantNamesByIds(ids: string[]) {
  return q.fetchConsultantNamesByIds(ids);
}

export async function getAvailableHoursForConsultantWeek(
  consultantId: string,
  year: number,
  week: number
) {
  return q.fetchAvailableHoursForConsultantWeek(consultantId, year, week);
}

export async function getConsultantsWithDetails(year: number, week: number) {
  return q.fetchConsultantsWithDetails(year, week);
}
