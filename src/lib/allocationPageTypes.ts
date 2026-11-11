import type { AllocationRecord } from "./allocationsQueries";

/** Virtual consultant id for unassigned allocations ("To plan"). Must match server. */
export const TO_PLAN_CONSULTANT_ID = "__to_plan__";

export type AllocationConsultant = {
  id: string;
  name: string;
  initials: string;
  hoursPerWeek: number;
  /** Capacity for a full week (no public holidays), after work%/overhead. */
  baselineHoursPerWeek: number;
  defaultRoleName: string;
  defaultRoleId: string | null;
  teamId: string | null;
  teamName: string | null;
  isExternal: boolean;
  availableHoursByWeek: number[];
  unavailableByWeek: boolean[];
};

export type AllocationProject = {
  id: string;
  name: string;
  customer_id: string;
  customerName: string;
  customerColor: string;
  type?: "customer" | "internal" | "absence";
  isActive?: boolean;
  customerIsActive?: boolean;
  probability: number | null;
};

export type AllocationCustomer = {
  id: string;
  name: string;
  color: string;
};

export type AllocationCell = {
  id: string;
  hours: number;
  roleName: string;
  roleId: string | null;
};

export type AllocationPageData = {
  consultants: AllocationConsultant[];
  projects: AllocationProject[];
  customers: AllocationCustomer[];
  roles: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  allocations: AllocationRecord[];
  year: number;
  weekFrom: number;
  weekTo: number;
  weeks: { year: number; week: number }[];
  consultantTotalHours?: Record<string, number>;
};
