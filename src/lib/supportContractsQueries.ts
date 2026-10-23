import { cloudSqlPool, withCloudSqlTransaction } from "@/lib/cloudSqlPool";
import type { PoolClient } from "pg";

export type SupportContractTier = {
  code: string;
  name: string;
  sortOrder: number;
};

export type SupportContractRow = {
  id: string;
  customer_id: string;
  tier_code: string;
  active: boolean;
  value_amount: string | null;
  value_currency: string;
  starts_on: string | null;
  ends_on: string | null;
  notes: string | null;
  contact_markdown: string;
  support_work_project_id: string | null;
  created_at: string;
  updated_at: string;
  created_by_app_user_id: string | null;
};

export async function fetchSupportContractTiers(): Promise<SupportContractTier[]> {
  const { rows } = await cloudSqlPool.query<{
    code: string;
    name: string;
    sort_order: number;
  }>(
    `SELECT code, name, sort_order
     FROM support_contract_tiers
     ORDER BY sort_order, code`
  );
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    sortOrder: row.sort_order,
  }));
}

export async function fetchSupportContractForCustomer(
  customerId: string
): Promise<SupportContractRow | null> {
  const { rows } = await cloudSqlPool.query<SupportContractRow>(
    `SELECT id, customer_id, tier_code, active, value_amount::text, value_currency,
            starts_on::text, ends_on::text, notes, contact_markdown,
            support_work_project_id, created_at::text, updated_at::text,
            created_by_app_user_id
     FROM support_contracts
     WHERE customer_id = $1
     ORDER BY active DESC, updated_at DESC
     LIMIT 1`,
    [customerId]
  );
  return rows[0] ?? null;
}

export async function fetchActiveSupportContractForCustomer(
  customerId: string
): Promise<SupportContractRow | null> {
  const { rows } = await cloudSqlPool.query<SupportContractRow>(
    `SELECT id, customer_id, tier_code, active, value_amount::text, value_currency,
            starts_on::text, ends_on::text, notes, contact_markdown,
            support_work_project_id, created_at::text, updated_at::text,
            created_by_app_user_id
     FROM support_contracts
     WHERE customer_id = $1
       AND active
       AND (ends_on IS NULL OR ends_on >= CURRENT_DATE)
     LIMIT 1`,
    [customerId]
  );
  return rows[0] ?? null;
}

export async function customerHasActiveSupportContract(
  customerId: string
): Promise<boolean> {
  const row = await fetchActiveSupportContractForCustomer(customerId);
  return row != null;
}

/** Customer IDs that currently have an active (non-ended) support contract. */
export async function fetchCustomerIdsWithActiveSupportContract(
  customerIds?: string[]
): Promise<Set<string>> {
  if (customerIds && customerIds.length === 0) return new Set();

  const { rows } = await cloudSqlPool.query<{ customer_id: string }>(
    customerIds
      ? `SELECT customer_id
         FROM support_contracts
         WHERE customer_id = ANY($1::uuid[])
           AND active
           AND (ends_on IS NULL OR ends_on >= CURRENT_DATE)`
      : `SELECT customer_id
         FROM support_contracts
         WHERE active
           AND (ends_on IS NULL OR ends_on >= CURRENT_DATE)`,
    customerIds ? [customerIds] : []
  );
  return new Set(rows.map((row) => row.customer_id));
}

export type UpsertSupportContractInput = {
  customerId: string;
  tierCode: string;
  active: boolean;
  valueAmount: number | null;
  valueCurrency: string;
  startsOn: string | null;
  endsOn: string | null;
  notes: string | null;
  contactMarkdown: string;
  actorAppUserId: string;
  supportWorkProjectId?: string | null;
};

export async function upsertSupportContract(
  input: UpsertSupportContractInput
): Promise<SupportContractRow> {
  return withCloudSqlTransaction("support-contract-upsert", async (client) => {
    if (input.active) {
      await client.query(
        `UPDATE support_contracts
         SET active = false, updated_at = now()
         WHERE customer_id = $1 AND active`,
        [input.customerId]
      );
    }

    const existing = await client.query<{ id: string }>(
      `SELECT id FROM support_contracts
       WHERE customer_id = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [input.customerId]
    );

    if (existing.rows[0]) {
      const { rows } = await client.query<SupportContractRow>(
        `UPDATE support_contracts SET
           tier_code = $2,
           active = $3,
           value_amount = $4,
           value_currency = $5,
           starts_on = $6,
           ends_on = $7,
           notes = $8,
           contact_markdown = $9,
           support_work_project_id = COALESCE($10, support_work_project_id),
           updated_at = now()
         WHERE id = $1
         RETURNING id, customer_id, tier_code, active, value_amount::text, value_currency,
                   starts_on::text, ends_on::text, notes, contact_markdown,
                   support_work_project_id, created_at::text, updated_at::text,
                   created_by_app_user_id`,
        [
          existing.rows[0].id,
          input.tierCode,
          input.active,
          input.valueAmount,
          input.valueCurrency,
          input.startsOn,
          input.endsOn,
          input.notes,
          input.contactMarkdown,
          input.supportWorkProjectId ?? null,
        ]
      );
      return rows[0];
    }

    const { rows } = await client.query<SupportContractRow>(
      `INSERT INTO support_contracts (
         customer_id, tier_code, active, value_amount, value_currency,
         starts_on, ends_on, notes, contact_markdown, support_work_project_id,
         created_by_app_user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, customer_id, tier_code, active, value_amount::text, value_currency,
                 starts_on::text, ends_on::text, notes, contact_markdown,
                 support_work_project_id, created_at::text, updated_at::text,
                 created_by_app_user_id`,
      [
        input.customerId,
        input.tierCode,
        input.active,
        input.valueAmount,
        input.valueCurrency,
        input.startsOn,
        input.endsOn,
        input.notes,
        input.contactMarkdown,
        input.supportWorkProjectId ?? null,
        input.actorAppUserId,
      ]
    );
    return rows[0];
  });
}

export async function setSupportContractWorkProject(
  contractId: string,
  projectId: string,
  client?: PoolClient
): Promise<void> {
  const q = client ?? cloudSqlPool;
  await q.query(
    `UPDATE support_contracts
     SET support_work_project_id = $2, updated_at = now()
     WHERE id = $1`,
    [contractId, projectId]
  );
}

export async function fetchStaffAppUserIdsForCustomer(
  customerId: string
): Promise<string[]> {
  const { rows } = await cloudSqlPool.query<{ id: string }>(
    `SELECT DISTINCT u.id
     FROM app_users u
     JOIN consultants c ON c.app_user_id = u.id
     JOIN customer_consultants cc ON cc.consultant_id = c.id
     WHERE cc.customer_id = $1
       AND u.role IN ('admin', 'member')
     ORDER BY u.id`,
    [customerId]
  );
  return rows.map((row) => row.id);
}
