import type { AppUserRole } from "@/lib/peopleTypes";

export type RadarActor = {
  id: string;
  role: AppUserRole;
  appKeys: readonly string[];
};

export function isStaffRadarRole(role: AppUserRole): boolean {
  return role === "admin" || role === "member";
}

/** App chrome / Radar nav. Staff only; never customer-role. */
export function canSeeRadarApp(actor: RadarActor): boolean {
  if (!isStaffRadarRole(actor.role)) return false;
  return actor.appKeys.includes("radar");
}

export function canManageRadar(actor: RadarActor): boolean {
  return canSeeRadarApp(actor);
}
