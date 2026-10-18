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
  plannerConsultant: "/planner/consultant",
  plannerCustomer: "/planner/customer",
  plannerProject: "/planner/project",
  plannerHistory: "/planner/history",
  /** Default planner allocation view (consultant). */
  allocation: "/planner/consultant",
  timeReport: "/time-report/time-report",
  timeReportHome: "/time-report",
  timeApproval: "/time-report/approval",
  insights: "/insights",
  work: "/work",
  workMine: "/work/mine",
  settings: "/settings/general",
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

export function customerHref(id: string): string {
  return `${ROUTES.customers}/${id}`;
}

export function consultantHref(id: string): string {
  return `${ROUTES.consultants}/${id}`;
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
