"use server";

import * as sizePrices from "./sizePrices";
import type { WorkTshirtSize } from "./workEstimate";

export type { SizePriceRow } from "./sizePrices";

export async function getCustomerSizePrices(customerId: string) {
  return sizePrices.getCustomerSizePrices(customerId);
}

export async function getProjectSizePrices(projectId: string) {
  return sizePrices.getProjectSizePrices(projectId);
}

export async function upsertCustomerSizePrice(
  customerId: string,
  size: WorkTshirtSize,
  amount: number,
  currency?: string
) {
  return sizePrices.upsertCustomerSizePrice(
    customerId,
    size,
    amount,
    currency
  );
}

export async function upsertProjectSizePrice(
  projectId: string,
  size: WorkTshirtSize,
  amount: number,
  currency?: string
) {
  return sizePrices.upsertProjectSizePrice(projectId, size, amount, currency);
}

export async function deleteCustomerSizePrice(
  customerId: string,
  size: WorkTshirtSize
) {
  return sizePrices.deleteCustomerSizePrice(customerId, size);
}

export async function deleteProjectSizePrice(
  projectId: string,
  size: WorkTshirtSize
) {
  return sizePrices.deleteProjectSizePrice(projectId, size);
}
