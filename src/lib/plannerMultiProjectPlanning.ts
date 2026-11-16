import "server-only";

import { encodeBillingItemKey } from "@/lib/billingItem";
import { getAllocationPageData, getAllocationPageDataForProject } from "@/lib/allocationPage";
import { getCustomerRates, getCustomerRatesByCustomerIds } from "@/lib/customerRates";
import { getCustomerById } from "@/lib/customers";
import { parseBillingCurrency, type BillingCurrency } from "@/lib/currency";
import { fetchProjectsByCustomerIds } from "@/lib/projectsLookupQueries";
import { getProjectRatesByProjectIds } from "@/lib/projectRates";
import type { PlannerProjectPlanningPanel } from "@/lib/plannerMultiProjectPlanningTypes";
import { compareTextSv } from "@/lib/sort";

export type { PlannerProjectPlanningPanel } from "@/lib/plannerMultiProjectPlanningTypes";

function mergeRates(
  customerRates: {
    id: string;
    role_id: string | null;
    rate_per_hour: number;
  }[],
  projectRates: {
    id: string;
    project_id: string;
    role_id: string | null;
    rate_per_hour: number;
  }[],
  projectId: string
): Record<string, number> | undefined {
  const allocationRates: Record<string, number> = {};
  for (const r of customerRates) {
    const key = r.role_id
      ? r.role_id
      : encodeBillingItemKey({ kind: "customer_rate", id: r.id });
    allocationRates[key] = r.rate_per_hour;
  }
  for (const r of projectRates) {
    if (r.project_id !== projectId) continue;
    const key = r.role_id
      ? r.role_id
      : encodeBillingItemKey({ kind: "project_rate", id: r.id });
    allocationRates[key] = r.rate_per_hour;
  }
  return Object.keys(allocationRates).length > 0 ? allocationRates : undefined;
}

/** Customer planning: one project-page-style embed per active project. */
export async function getCustomerProjectPlanningPanels(
  customerId: string,
  year: number,
  weekFrom: number,
  weekTo: number
): Promise<PlannerProjectPlanningPanel[]> {
  const [customer, projectRows] = await Promise.all([
    getCustomerById(customerId),
    fetchProjectsByCustomerIds([customerId]),
  ]);
  if (!customer) return [];

  const billingCurrency = parseBillingCurrency(customer.billingCurrency);
  const projects = projectRows
    .filter((p) => p.is_active)
    .sort((a, b) => compareTextSv(a.name, b.name));
  if (projects.length === 0) return [];

  const projectIds = projects.map((p) => p.id);
  const [customerRates, projectRates] = await Promise.all([
    getCustomerRates(customerId),
    getProjectRatesByProjectIds(projectIds),
  ]);

  const panels = await Promise.all(
    projects.map(async (p) => {
      const allocationData = await getAllocationPageDataForProject(
        p.id,
        customerId,
        year,
        weekFrom,
        weekTo
      );
      return {
        projectId: p.id,
        projectName: p.name,
        customerId,
        budgetHours: p.budget_hours,
        budgetMoney: p.budget_money,
        billingCurrency,
        allocationData,
        rates: mergeRates(customerRates, projectRates, p.id),
      } satisfies PlannerProjectPlanningPanel;
    })
  );
  return panels;
}

/**
 * Consultant planning: one project-page-style embed per project that has
 * at least one allocation for this consultant in the visible week window.
 */
export async function getConsultantProjectPlanningPanels(
  consultantId: string,
  year: number,
  weekFrom: number,
  weekTo: number
): Promise<PlannerProjectPlanningPanel[]> {
  const pageData = await getAllocationPageData(year, weekFrom, weekTo);
  const projectIdsWithBooking = new Set(
    pageData.allocations
      .filter((a) => a.consultant_id === consultantId)
      .map((a) => a.project_id)
  );
  const projects = pageData.projects
    .filter(
      (p) =>
        projectIdsWithBooking.has(p.id) &&
        p.isActive !== false &&
        p.customerIsActive !== false
    )
    .sort((a, b) => compareTextSv(a.name, b.name));
  if (projects.length === 0) return [];

  const projectIds = projects.map((p) => p.id);
  const customerIds = [...new Set(projects.map((p) => p.customer_id))];
  const [customerRates, projectRates, customerRows, budgetRows] =
    await Promise.all([
      getCustomerRatesByCustomerIds(customerIds),
      getProjectRatesByProjectIds(projectIds),
      Promise.all(customerIds.map((id) => getCustomerById(id))),
      fetchProjectsByCustomerIds(customerIds),
    ]);

  const currencyByCustomer = new Map<string, BillingCurrency>();
  for (const c of customerRows) {
    if (!c) continue;
    currencyByCustomer.set(c.id, parseBillingCurrency(c.billingCurrency));
  }

  const budgetById = new Map(
    budgetRows.map((r) => [
      r.id,
      { hours: r.budget_hours, money: r.budget_money },
    ] as const)
  );

  const customerRatesByCustomer = new Map<string, typeof customerRates>();
  for (const r of customerRates) {
    const list = customerRatesByCustomer.get(r.customer_id) ?? [];
    list.push(r);
    customerRatesByCustomer.set(r.customer_id, list);
  }

  return Promise.all(
    projects.map(async (p) => {
      const allocationData = await getAllocationPageDataForProject(
        p.id,
        p.customer_id,
        year,
        weekFrom,
        weekTo
      );
      const budget = budgetById.get(p.id);
      return {
        projectId: p.id,
        projectName: p.name,
        customerId: p.customer_id,
        budgetHours: budget?.hours ?? null,
        budgetMoney: budget?.money ?? null,
        billingCurrency:
          currencyByCustomer.get(p.customer_id) ??
          parseBillingCurrency(undefined),
        allocationData,
        rates: mergeRates(
          customerRatesByCustomer.get(p.customer_id) ?? [],
          projectRates,
          p.id
        ),
      } satisfies PlannerProjectPlanningPanel;
    })
  );
}
