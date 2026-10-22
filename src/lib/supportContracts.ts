"use server";

import { revalidatePath } from "next/cache";
import { ROUTES, supportCustomerHref } from "@/lib/routes";
import { getCurrentAppUser } from "@/lib/appUsers";
import { canEditSupportContract } from "@/lib/supportAccess";
import { ensureSupportWorkProject } from "@/lib/supportBoard";
import * as q from "@/lib/supportContractsQueries";

export type SupportContractView = {
  id: string | null;
  customerId: string;
  tierCode: string;
  tierName: string;
  active: boolean;
  valueAmount: number | null;
  valueCurrency: string;
  startsOn: string | null;
  endsOn: string | null;
  notes: string;
  contactMarkdown: string;
  supportWorkProjectId: string | null;
};

export type SupportContractInput = {
  tierCode: string;
  active: boolean;
  valueAmount: number | null;
  valueCurrency: string;
  startsOn: string | null;
  endsOn: string | null;
  notes: string;
  contactMarkdown: string;
};

function mapRow(
  row: q.SupportContractRow,
  tiers: q.SupportContractTier[]
): SupportContractView {
  const tier = tiers.find((t) => t.code === row.tier_code);
  return {
    id: row.id,
    customerId: row.customer_id,
    tierCode: row.tier_code,
    tierName: tier?.name ?? row.tier_code,
    active: row.active,
    valueAmount:
      row.value_amount == null || row.value_amount === ""
        ? null
        : Number(row.value_amount),
    valueCurrency: row.value_currency,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    notes: row.notes ?? "",
    contactMarkdown: row.contact_markdown ?? "",
    supportWorkProjectId: row.support_work_project_id,
  };
}

export async function listSupportContractTiers(): Promise<q.SupportContractTier[]> {
  return q.fetchSupportContractTiers();
}

export async function getSupportContractForCustomer(
  customerId: string
): Promise<SupportContractView | null> {
  const [row, tiers] = await Promise.all([
    q.fetchSupportContractForCustomer(customerId),
    q.fetchSupportContractTiers(),
  ]);
  if (!row) return null;
  return mapRow(row, tiers);
}

export async function customerHasActiveSupportContract(
  customerId: string
): Promise<boolean> {
  return q.customerHasActiveSupportContract(customerId);
}

export async function saveSupportContract(
  customerId: string,
  raw: SupportContractInput
): Promise<SupportContractView> {
  const user = await getCurrentAppUser();
  if (
    !user ||
    !canEditSupportContract({
      id: user.id,
      role: user.role,
      appKeys: user.appKeys,
    })
  ) {
    throw new Error("Unauthorized");
  }

  const tiers = await q.fetchSupportContractTiers();
  if (!tiers.some((tier) => tier.code === raw.tierCode)) {
    throw new Error("Select a support package");
  }
  const currency = raw.valueCurrency.trim().toUpperCase() || "SEK";
  if (currency.length !== 3) throw new Error("Currency must be a 3-letter code");
  if (
    raw.valueAmount != null &&
    (!Number.isFinite(raw.valueAmount) || raw.valueAmount < 0)
  ) {
    throw new Error("Contract value must be zero or greater");
  }

  const saved = await q.upsertSupportContract({
    customerId,
    tierCode: raw.tierCode,
    active: raw.active,
    valueAmount: raw.valueAmount,
    valueCurrency: currency,
    startsOn: raw.startsOn?.trim() || null,
    endsOn: raw.endsOn?.trim() || null,
    notes: raw.notes.trim() || null,
    contactMarkdown: raw.contactMarkdown,
    actorAppUserId: user.id,
  });

  const becomingActive =
    raw.active &&
    (saved.ends_on == null ||
      saved.ends_on >= new Date().toISOString().slice(0, 10));

  if (becomingActive) {
    await ensureSupportWorkProject({
      customerId,
      actorAppUserId: user.id,
      contractId: saved.id,
    });
  }

  const refreshed = await q.fetchSupportContractForCustomer(customerId);
  if (!refreshed) throw new Error("Failed to save support contract");

  revalidatePath(ROUTES.customers);
  revalidatePath(supportCustomerHref(customerId));
  revalidatePath(ROUTES.support);

  return mapRow(refreshed, tiers);
}
