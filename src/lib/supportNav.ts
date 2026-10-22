import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { compareTextSv } from "@/lib/sort";
import type { SupportActor } from "@/lib/supportAccess";
import { canSeeSupportCustomerInNav } from "@/lib/supportAccess";
import { linkedSupportCustomerIdsForActor } from "@/lib/supportActor";
export type SupportNavCustomer = {
  id: string;
  name: string;
  color: string | null;
  url: string | null;
  hasActiveContract: boolean;
  monitorCount: number;
};

export async function listSupportNavCustomers(
  actor: SupportActor
): Promise<SupportNavCustomer[]> {
  const linked = await linkedSupportCustomerIdsForActor(actor);
  if (linked.length === 0) return [];

  const { rows } = await cloudSqlPool.query<{
    id: string;
    name: string;
    color: string | null;
    url: string | null;
  }>(
    `SELECT id, name, color, url
     FROM customers
     WHERE is_active AND id = ANY($1::uuid[])
     ORDER BY lower(name)`,
    [linked]
  );

  const [{ rows: monitorCounts }, { rows: activeContracts }] = await Promise.all([
    cloudSqlPool.query<{ customer_id: string; n: number }>(
      `SELECT customer_id, COUNT(*)::int AS n
       FROM monitoring.monitors
       WHERE customer_id = ANY($1::uuid[])
       GROUP BY customer_id`,
      [linked]
    ),
    cloudSqlPool.query<{ customer_id: string }>(
      `SELECT customer_id
       FROM support_contracts
       WHERE customer_id = ANY($1::uuid[])
         AND active
         AND (ends_on IS NULL OR ends_on >= CURRENT_DATE)`,
      [linked]
    ),
  ]);
  const countByCustomer = new Map(
    monitorCounts.map((row) => [row.customer_id, row.n])
  );
  const activeSet = new Set(activeContracts.map((row) => row.customer_id));

  const result: SupportNavCustomer[] = [];
  for (const row of rows) {
    if (!canSeeSupportCustomerInNav(actor, linked, row.id)) continue;
    result.push({
      id: row.id,
      name: row.name,
      color: row.color,
      url: row.url,
      hasActiveContract: activeSet.has(row.id),
      monitorCount: countByCustomer.get(row.id) ?? 0,
    });
  }

  return result.sort((a, b) => compareTextSv(a.name, b.name));
}
