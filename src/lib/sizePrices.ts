import "server-only";

import * as q from "./sizePricesQueries";
import { getCustomerById } from "./customers";
import { getProjectWithDetailsById } from "./projects";
import { parseBillingCurrency } from "./currency";
import type { WorkTshirtSize } from "./workEstimate";

export type { SizePriceRow } from "./sizePricesQueries";

export async function getCustomerSizePrices(customerId: string) {
  return q.fetchCustomerSizePrices(customerId);
}

export async function getProjectSizePrices(projectId: string) {
  return q.fetchProjectSizePrices(projectId);
}

export async function getResolvedSizePriceMap(
  customerId: string,
  plannerProjectId?: string | null
) {
  return q.fetchResolvedSizePriceMap(customerId, plannerProjectId);
}

export async function upsertCustomerSizePrice(
  customerId: string,
  size: WorkTshirtSize,
  amount: number,
  currency?: string
) {
  const customer = await getCustomerById(customerId);
  const billingCurrency = parseBillingCurrency(
    currency ?? customer?.billingCurrency
  );
  return q.upsertCustomerSizePriceQuery(
    customerId,
    size,
    amount,
    billingCurrency
  );
}

export async function upsertProjectSizePrice(
  projectId: string,
  size: WorkTshirtSize,
  amount: number,
  currency?: string
) {
  const project = await getProjectWithDetailsById(projectId);
  const billingCurrency = parseBillingCurrency(
    currency ?? project?.billingCurrency
  );
  return q.upsertProjectSizePriceQuery(
    projectId,
    size,
    amount,
    billingCurrency
  );
}

export async function deleteCustomerSizePrice(
  customerId: string,
  size: WorkTshirtSize
) {
  return q.deleteCustomerSizePriceQuery(customerId, size);
}

export async function deleteProjectSizePrice(
  projectId: string,
  size: WorkTshirtSize
) {
  return q.deleteProjectSizePriceQuery(projectId, size);
}
