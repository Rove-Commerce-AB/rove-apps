import { getCurrentAppUser } from "@/lib/appUsers";
import { getCustomersForAppUser } from "@/lib/customerAppUsers";
import { fetchConsultantByAppUserId } from "@/lib/consultantsQueries";
import { getCustomerIdsForConsultant } from "@/lib/customerConsultants";
import type { SupportActor } from "@/lib/supportAccess";
import { canSeeSupportApp } from "@/lib/supportAccess";
import { redirect } from "next/navigation";

export async function getSupportActor(): Promise<SupportActor | null> {
  const user = await getCurrentAppUser();
  if (!user) return null;
  return {
    id: user.id,
    role: user.role,
    appKeys: user.appKeys,
  };
}

export async function requireSupportActor(): Promise<SupportActor> {
  const actor = await getSupportActor();
  if (!actor || !canSeeSupportApp(actor)) {
    redirect("/access-denied");
  }
  return actor;
}

/** Same linkage rules as Work: customer_app_users + consultant customers. */
export async function linkedSupportCustomerIdsForActor(
  actor: SupportActor
): Promise<string[]> {
  if (actor.role === "customer") {
    const customers = await getCustomersForAppUser(actor.id);
    return customers.map((customer) => customer.id);
  }
  const ids = new Set<string>();
  for (const customer of await getCustomersForAppUser(actor.id)) {
    ids.add(customer.id);
  }
  const consultant = await fetchConsultantByAppUserId(actor.id);
  if (consultant?.id) {
    for (const id of await getCustomerIdsForConsultant(consultant.id)) {
      ids.add(id);
    }
  }
  return [...ids];
}
