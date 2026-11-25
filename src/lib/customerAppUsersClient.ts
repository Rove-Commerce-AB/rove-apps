"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, assertNotSubcontractorForWrite } from "@/lib/accessGuards";
import * as q from "./customerAppUsersQueries";
import { ROUTES, customerHref, personHref } from "@/lib/routes";

export async function addCustomerUserToCustomer(
  customerId: string,
  appUserId: string
) {
  await assertNotSubcontractorForWrite();
  await q.addCustomerUserToCustomer(customerId, appUserId);
  revalidatePath(ROUTES.customers);
  revalidatePath(customerHref(customerId));
  revalidatePath(ROUTES.people);
  revalidatePath(personHref(`user-${appUserId}`));
}

export async function removeCustomerUserFromCustomer(
  customerId: string,
  appUserId: string
) {
  await assertAdmin();
  await q.removeCustomerUserFromCustomer(customerId, appUserId);
  revalidatePath(ROUTES.customers);
  revalidatePath(customerHref(customerId));
  revalidatePath(ROUTES.people);
  revalidatePath(personHref(`user-${appUserId}`));
}
