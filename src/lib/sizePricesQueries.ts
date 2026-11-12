import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { parseBillingCurrency } from "@/lib/currency";
import {
  WORK_TSHIRT_SIZES,
  type WorkSizePriceMap,
  type WorkTshirtSize,
  isWorkTshirtSize,
} from "@/lib/workEstimate";

export type SizePriceRow = {
  id: string;
  ownerId: string;
  size: WorkTshirtSize;
  amount: number;
  currency: string;
};

function mapRow(r: {
  id: string;
  owner_id: string;
  size: string;
  amount: string | number;
  currency: string | null;
}): SizePriceRow | null {
  if (!isWorkTshirtSize(r.size)) return null;
  return {
    id: r.id,
    ownerId: r.owner_id,
    size: r.size,
    amount: Number(r.amount),
    currency: parseBillingCurrency(r.currency),
  };
}

function toPriceMap(rows: SizePriceRow[]): WorkSizePriceMap {
  const map: WorkSizePriceMap = {};
  for (const row of rows) {
    map[row.size] = row.amount;
  }
  return map;
}

export async function fetchCustomerSizePrices(
  customerId: string
): Promise<SizePriceRow[]> {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    owner_id: string;
    size: string;
    amount: string | number;
    currency: string | null;
  }>(
    `SELECT id, customer_id AS owner_id, size, amount, currency
     FROM customer_size_prices
     WHERE customer_id = $1
     ORDER BY array_position(ARRAY['xs','s','m','l','xl']::text[], size)`,
    [customerId]
  );
  return rows.map(mapRow).filter((r): r is SizePriceRow => r != null);
}

export async function fetchProjectSizePrices(
  projectId: string
): Promise<SizePriceRow[]> {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    owner_id: string;
    size: string;
    amount: string | number;
    currency: string | null;
  }>(
    `SELECT id, project_id AS owner_id, size, amount, currency
     FROM project_size_prices
     WHERE project_id = $1
     ORDER BY array_position(ARRAY['xs','s','m','l','xl']::text[], size)`,
    [projectId]
  );
  return rows.map(mapRow).filter((r): r is SizePriceRow => r != null);
}

/** Project overrides win over customer for the same size. */
export async function fetchResolvedSizePriceMap(
  customerId: string,
  plannerProjectId?: string | null
): Promise<WorkSizePriceMap> {
  const customerRows = await fetchCustomerSizePrices(customerId);
  const map = toPriceMap(customerRows);
  if (plannerProjectId) {
    const projectRows = await fetchProjectSizePrices(plannerProjectId);
    for (const row of projectRows) {
      map[row.size] = row.amount;
    }
  }
  return map;
}

export async function upsertCustomerSizePriceQuery(
  customerId: string,
  size: WorkTshirtSize,
  amount: number,
  currency: string
): Promise<SizePriceRow> {
  if (!WORK_TSHIRT_SIZES.includes(size)) {
    throw new Error("Invalid size");
  }
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Amount must be 0 or greater");
  }
  const { rows } = await cloudSqlPool.query<{
    id: string;
    owner_id: string;
    size: string;
    amount: string | number;
    currency: string | null;
  }>(
    `INSERT INTO customer_size_prices (customer_id, size, amount, currency)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (customer_id, size) DO UPDATE
       SET amount = EXCLUDED.amount,
           currency = EXCLUDED.currency,
           updated_at = now()
     RETURNING id, customer_id AS owner_id, size, amount, currency`,
    [customerId, size, amount, parseBillingCurrency(currency)]
  );
  const mapped = mapRow(rows[0]);
  if (!mapped) throw new Error("Failed to save size price");
  return mapped;
}

export async function upsertProjectSizePriceQuery(
  projectId: string,
  size: WorkTshirtSize,
  amount: number,
  currency: string
): Promise<SizePriceRow> {
  if (!WORK_TSHIRT_SIZES.includes(size)) {
    throw new Error("Invalid size");
  }
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Amount must be 0 or greater");
  }
  const { rows } = await cloudSqlPool.query<{
    id: string;
    owner_id: string;
    size: string;
    amount: string | number;
    currency: string | null;
  }>(
    `INSERT INTO project_size_prices (project_id, size, amount, currency)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (project_id, size) DO UPDATE
       SET amount = EXCLUDED.amount,
           currency = EXCLUDED.currency,
           updated_at = now()
     RETURNING id, project_id AS owner_id, size, amount, currency`,
    [projectId, size, amount, parseBillingCurrency(currency)]
  );
  const mapped = mapRow(rows[0]);
  if (!mapped) throw new Error("Failed to save size price");
  return mapped;
}

export async function deleteCustomerSizePriceQuery(
  customerId: string,
  size: WorkTshirtSize
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `DELETE FROM customer_size_prices
     WHERE customer_id = $1 AND size = $2`,
    [customerId, size]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteProjectSizePriceQuery(
  projectId: string,
  size: WorkTshirtSize
): Promise<boolean> {
  const result = await cloudSqlPool.query(
    `DELETE FROM project_size_prices
     WHERE project_id = $1 AND size = $2`,
    [projectId, size]
  );
  return (result.rowCount ?? 0) > 0;
}
