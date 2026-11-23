export const PLANNER_VIEWS = [
  "consultant",
  "customer",
  "project",
  "history",
] as const;
export type PlannerView = (typeof PLANNER_VIEWS)[number];

/** Canonical app routes for Rove Apps. Keep sidebar, redirects, and revalidation in sync. */
export const ROUTES = {
  home: "/",
  planner: "/planner",
  /** Plan grids (booking tools). */
  plannerPlanConsultant: "/planner/plan/consultant",
  plannerPlanCustomer: "/planner/plan/customer",
  plannerPlanProject: "/planner/plan/project",
  plannerPlanAvailability: "/planner/plan/availability",
  plannerPlanHistory: "/planner/plan/history",
  /** @deprecated Use plannerPlanConsultant */
  plannerConsultant: "/planner/plan/consultant",
  /** @deprecated Use plannerPlanCustomer */
  plannerCustomer: "/planner/plan/customer",
  /** @deprecated Use plannerPlanProject */
  plannerProject: "/planner/plan/project",
  /** @deprecated Use plannerPlanHistory */
  plannerHistory: "/planner/plan/history",
  /** Default planner allocation view (consultant). */
  allocation: "/planner/plan/consultant",
  plannerProjects: "/planner/projects",
  plannerCustomers: "/planner/customers",
  plannerConsultants: "/planner/consultants",
  timeReport: "/time-report/time-report",
  /** App index; redirects to timeReportOverview. */
  timeReportHome: "/time-report",
  timeReportOverview: "/time-report/overview",
  timeApproval: "/time-report/approval",
  travelExpense: "/time-report/travel-expense",
  travelExpenseNew: "/time-report/travel-expense/new",
  insights: "/insights",
  insightsOverview: "/insights/overview",
  radar: "/radar",
  radarOverview: "/radar/overview",
  radarAudiences: "/radar/audiences",
  radarCompanies: "/radar/companies",
  radarSearch: "/radar/search",
  radarProspects: "/radar/prospects",
  radarVerticals: "/radar/verticals",
  radarJobs: "/radar/jobs",
  work: "/work",
  workOverview: "/work/overview",
  workMine: "/work/mine",
  support: "/support",
  supportOverview: "/support/overview",
  supportMonitors: "/support/monitors",
  supportIncidents: "/support/incidents",
  settings: "/settings/general",
  /** @deprecated Prefer Support Monitors; kept for redirects. */
  monitors: "/settings/monitors",
  people: "/settings/people",
  consultants: "/settings/consultants",
  customers: "/settings/customers",
  notifications: "/notifications",
} as const;

export function allocationHref(params: {
  year: number;
  from: number;
  to: number;
}): string {
  return `${ROUTES.allocation}?year=${params.year}&from=${params.from}&to=${params.to}`;
}

export function travelExpenseDetailHref(id: string): string {
  return `${ROUTES.travelExpense}/${id}`;
}

/** Planner planning page for a customer. */
export function customerHref(id: string): string {
  return `${ROUTES.plannerCustomers}/${id}`;
}

/** Settings masterdata drawer for a customer. */
export function customerSettingsHref(id: string): string {
  return `${ROUTES.customers}/${id}`;
}

/** Planner planning page for a consultant. */
export function consultantHref(id: string): string {
  return `${ROUTES.plannerConsultants}/${id}`;
}

/** Settings / People masterdata for a consultant. */
export function consultantSettingsHref(
  consultantId: string,
  appUserId?: string | null
): string {
  return personHref(
    appUserId ? `user-${appUserId}` : `consultant-${consultantId}`
  );
}

/** Planner project entity (planning + Edit in Settings). */
export function projectHref(id: string): string {
  return `${ROUTES.plannerProjects}/${id}`;
}

export function supportCustomerHref(customerId: string): string {
  return supportMonitorsHref(customerId);
}

/** Flat Support Monitors list; optional customer scopes via ?customer=. */
export function supportMonitorsHref(customerId?: string | null): string {
  if (!customerId) return ROUTES.supportMonitors;
  return `${ROUTES.supportMonitors}?customer=${encodeURIComponent(customerId)}`;
}

/**
 * Monitors list with filter explicitly cleared (`?customer=all`).
 * Use for back-navigation so a persisted cookie does not keep a customer selected.
 */
export function supportMonitorsAllHref(): string {
  return `${ROUTES.supportMonitors}?customer=all`;
}

/** Flat Support Incidents (cases) list; optional customer scopes via ?customer=. */
export function supportIncidentsHref(customerId?: string | null): string {
  if (!customerId) return ROUTES.supportIncidents;
  return `${ROUTES.supportIncidents}?customer=${encodeURIComponent(customerId)}`;
}

/** @deprecated Prefer supportMonitorsHref — kept for call-site compatibility. */
export function supportCustomerMonitorsHref(customerId: string): string {
  return supportMonitorsHref(customerId);
}

/** @deprecated Prefer supportIncidentsHref — kept for call-site compatibility. */
export function supportCustomerIncidentsHref(customerId: string): string {
  return supportIncidentsHref(customerId);
}

/** @deprecated Use supportIncidentsHref */
export function supportCustomerCasesHref(customerId: string): string {
  return supportIncidentsHref(customerId);
}

export function supportCustomerContactHref(customerId: string): string {
  return `${ROUTES.support}/${customerId}/contact`;
}

export function supportMonitorIncidentsHref(
  customerId: string,
  monitorId: string
): string {
  return `${ROUTES.support}/${customerId}/monitors/${monitorId}/incidents`;
}

/** @deprecated Use supportMonitorIncidentsHref */
export function monitorIncidentsHref(id: string): string {
  return `${ROUTES.monitors}/${id}/incidents`;
}

export function personHref(key: string): string {
  return `${ROUTES.people}/${key}`;
}

export function personHrefForConsultant(
  consultantId: string,
  appUserId?: string | null
): string {
  return personHref(appUserId ? `user-${appUserId}` : `consultant-${consultantId}`);
}

export function personHrefForUser(appUserId: string): string {
  return personHref(`user-${appUserId}`);
}

export function workCustomerHref(customerId: string): string {
  return `${ROUTES.work}/${customerId}`;
}

/** @deprecated Use workProjectHref */
export function workBoardHref(customerId: string, boardId: string): string {
  return workProjectHref(customerId, boardId);
}

export function workProjectHref(customerId: string, projectId: string): string {
  return `${ROUTES.work}/${customerId}/${projectId}`;
}

export function workIssueHref(
  customerId: string,
  projectId: string,
  issueId: string,
  options?: { tab?: string }
): string {
  const base = `${ROUTES.work}/${customerId}/${projectId}/${issueId}`;
  const tab = options?.tab?.trim();
  if (!tab || tab === "details") return base;
  return `${base}?tab=${encodeURIComponent(tab)}`;
}
