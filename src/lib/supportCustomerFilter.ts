import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import {
  CUSTOMER_FILTER_QUERY_KEY,
  resolveCustomerFilterSelection,
  SUPPORT_CUSTOMER_FILTER_COOKIE,
  type CustomerFilterOption,
} from "@/lib/customerFilter";
import { compareTextSv } from "@/lib/sort";
import type { SupportActor } from "@/lib/supportAccess";
import {
  canSeeSupportOverview,
  isStaffSupportRole,
} from "@/lib/supportAccess";
import { linkedSupportCustomerIdsForActor } from "@/lib/supportActor";

export {
  CUSTOMER_FILTER_QUERY_KEY,
  SUPPORT_CUSTOMER_FILTER_COOKIE,
} from "@/lib/customerFilter";

export type SupportFilterCustomer = CustomerFilterOption & {
  hasActiveContract: boolean;
};

/** Customers available in the Support Monitors/Incidents filter. */
export async function listSupportFilterCustomers(
  actor: SupportActor
): Promise<SupportFilterCustomer[]> {
  const linked = await linkedSupportCustomerIdsForActor(actor);
  const staffSeesAll = canSeeSupportOverview(actor);

  if (!staffSeesAll && linked.length === 0) return [];

  const { rows } = staffSeesAll
    ? await cloudSqlPool.query<{
        id: string;
        name: string;
      }>(
        `SELECT id, name
         FROM customers
         WHERE is_active
         ORDER BY lower(name)`
      )
    : await cloudSqlPool.query<{
        id: string;
        name: string;
      }>(
        `SELECT id, name
         FROM customers
         WHERE is_active AND id = ANY($1::uuid[])
         ORDER BY lower(name)`,
        [linked]
      );

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const { rows: contracts } = await cloudSqlPool.query<{
    customer_id: string;
  }>(
    `SELECT customer_id
     FROM support_contracts
     WHERE customer_id = ANY($1::uuid[])
       AND active
       AND (starts_on IS NULL OR starts_on <= CURRENT_DATE)
       AND (ends_on IS NULL OR ends_on >= CURRENT_DATE)`,
    [ids]
  );
  const activeSet = new Set(contracts.map((row) => row.customer_id));

  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      hasActiveContract: activeSet.has(row.id),
    }))
    .sort((a, b) => compareTextSv(a.name, b.name));
}

export function resolveSupportCustomerFilter(args: {
  queryValue: string | null | undefined;
  cookieValue: string | null | undefined;
  customers: readonly SupportFilterCustomer[];
}): string[] {
  return resolveCustomerFilterSelection({
    queryValue: args.queryValue,
    persistedValue: args.cookieValue,
    allowedIds: args.customers.map((c) => c.id),
  });
}

/** Staff can manage monitors on the flat Monitors page. */
export function canManageSupportMonitorsPage(actor: SupportActor): boolean {
  return isStaffSupportRole(actor.role) && actor.appKeys.includes("support");
}
