import type { AppUserRole } from "@/lib/peopleTypes";

export type SupportActor = {
  id: string;
  role: AppUserRole;
  appKeys: readonly string[];
};

export function isStaffSupportRole(role: AppUserRole): boolean {
  return role === "admin" || role === "member";
}

/** App chrome / Support nav. */
export function canSeeSupportApp(actor: SupportActor): boolean {
  if (!actor.appKeys.includes("support")) return false;
  return true;
}

/** Cross-customer jour radar. Never customer-role. */
export function canSeeSupportOverview(actor: SupportActor): boolean {
  return canSeeSupportApp(actor) && isStaffSupportRole(actor.role);
}

/**
 * Customer appears in Support nav tree. Assignment-based for everyone,
 * including admin (Overview lists all monitors without requiring tree entries).
 */
export function canSeeSupportCustomerInNav(
  actor: SupportActor,
  linkedCustomerIds: readonly string[],
  customerId: string
): boolean {
  if (!canSeeSupportApp(actor)) return false;
  return linkedCustomerIds.includes(customerId);
}

/**
 * Open a customer Support surface (Monitors / Cases; Contact optional).
 * Linked people always; staff with Overview may deep-link any customer.
 */
export function canAccessSupportCustomer(
  actor: SupportActor,
  linkedCustomerIds: readonly string[],
  customerId: string
): boolean {
  if (!canSeeSupportApp(actor)) return false;
  if (linkedCustomerIds.includes(customerId)) return true;
  return canSeeSupportOverview(actor);
}

/** Staff CRUD on monitors for an accessible customer. */
export function canManageMonitors(
  actor: SupportActor,
  linkedCustomerIds: readonly string[],
  customerId: string
): boolean {
  return (
    isStaffSupportRole(actor.role) &&
    canAccessSupportCustomer(actor, linkedCustomerIds, customerId)
  );
}

/** Read monitor status (staff or customer-role with access). */
export function canViewMonitors(
  actor: SupportActor,
  linkedCustomerIds: readonly string[],
  customerId: string
): boolean {
  return canAccessSupportCustomer(actor, linkedCustomerIds, customerId);
}

export function canUseSupportCases(
  actor: SupportActor,
  linkedCustomerIds: readonly string[],
  customerId: string,
  hasActiveSupportContract: boolean
): boolean {
  if (!hasActiveSupportContract) return false;
  return canAccessSupportCustomer(actor, linkedCustomerIds, customerId);
}

export function canEditSupportContract(actor: SupportActor): boolean {
  return isStaffSupportRole(actor.role) && actor.appKeys.includes("support");
}

export function canViewSupportContact(
  actor: SupportActor,
  linkedCustomerIds: readonly string[],
  customerId: string,
  hasActiveSupportContract: boolean
): boolean {
  return canUseSupportCases(
    actor,
    linkedCustomerIds,
    customerId,
    hasActiveSupportContract
  );
}
