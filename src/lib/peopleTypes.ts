import type { ConsultantListItem } from "@/lib/consultants";
import type { PersonCustomerLink } from "@/lib/customerAppUsersQueries";

export const APP_KEYS = [
  "planner",
  "time_report",
  "insights",
  "work",
  "support",
] as const;
export type AppKey = (typeof APP_KEYS)[number];

export const APP_LABELS: Record<AppKey, string> = {
  planner: "Planner",
  time_report: "Time report",
  insights: "Insights",
  work: "Work",
  support: "Support",
};

export function isAppKey(value: string): value is AppKey {
  return (APP_KEYS as readonly string[]).includes(value);
}

/** Rove apps a customer-role user may receive. */
export const CUSTOMER_APP_KEYS = ["work", "support"] as const satisfies readonly AppKey[];

export function isCustomerAssignableAppKey(value: string): value is AppKey {
  return (CUSTOMER_APP_KEYS as readonly string[]).includes(value);
}

export type AppUserRole = "admin" | "member" | "customer";

export const ROVE_LOGIN_ROLES = ["admin", "member"] as const;
export type RoveLoginRole = (typeof ROVE_LOGIN_ROLES)[number];

export function isAppUserRole(value: string): value is AppUserRole {
  return value === "admin" || value === "member" || value === "customer";
}

export function isRoveLoginRole(value: string): value is RoveLoginRole {
  return value === "admin" || value === "member";
}

export type PersonMcpAccess = {
  hasToken: boolean;
  mcpAppKeys: AppKey[];
};

export type PersonListItem = {
  key: string;
  appUserId: string | null;
  consultantId: string | null;
  name: string;
  email: string | null;
  userRole: AppUserRole | null;
  appKeys: AppKey[];
  mcpAccess: PersonMcpAccess | null;
  consultant: ConsultantListItem | null;
  customers: PersonCustomerLink[];
};
