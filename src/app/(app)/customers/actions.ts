"use server";

import { revalidatePath } from "next/cache";
import {
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "@/lib/customers";
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
} from "@/lib/customers";
import type { Customer } from "@/lib/customers";
import { assertAdmin, assertNotSubcontractorForWrite } from "@/lib/accessGuards";
import { ROUTES, customerHref, customerSettingsHref } from "@/lib/routes";

export async function revalidateCustomers() {
  await assertNotSubcontractorForWrite();
  revalidatePath(ROUTES.customers);
}

export async function createCustomerAction(
  input: CreateCustomerInput
): Promise<Customer> {
  await assertNotSubcontractorForWrite();
  const customer = await createCustomer(input);
  revalidatePath(ROUTES.customers);
  return customer;
}

export async function updateCustomerAction(
  id: string,
  input: UpdateCustomerInput
): Promise<Customer> {
  await assertNotSubcontractorForWrite();
  const customer = await updateCustomer(id, input);
  revalidatePath(ROUTES.customers);
  revalidatePath(customerHref(id));
  revalidatePath(customerSettingsHref(id));
  return customer;
}

export async function deleteCustomerAction(id: string): Promise<void> {
  await assertAdmin();
  await deleteCustomer(id);
  revalidatePath(ROUTES.customers);
}
