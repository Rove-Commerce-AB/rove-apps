import { cloudSqlPool } from "@/lib/cloudSqlPool";

import { DEFAULT_CUSTOMER_COLOR } from "./constants";
import {
  DEFAULT_BILLING_CURRENCY,
  parseBillingCurrency,
  type BillingCurrency,
} from "./currency";
import { parseLitiumVersionInput, parseSubscriptionIdInput } from "./litiumVersion";
import { fetchProjectsByCustomerIds } from "./projectsLookupQueries";
import type { CustomerWithDetails, ProjectType } from "@/types";

export type Customer = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_app_user_id: string | null;
  account_manager_id: string | null;
  color: string | null;
  logo_url: string | null;
  url: string | null;
  subscription_id: string | null;
  litium_version: string | null;
  billing_currency: BillingCurrency;
  is_internal: boolean;
  work_show_time_to_customer_users: boolean;
  is_active: boolean;
};

export type CreateCustomerInput = {
  name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  account_manager_id?: string | null;
  color?: string | null;
  logo_url?: string | null;
  url?: string | null;
  billing_currency?: BillingCurrency;
  is_internal?: boolean;
  work_show_time_to_customer_users?: boolean;
  is_active?: boolean;
};

export type UpdateCustomerInput = {
  name?: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_app_user_id?: string | null;
  account_manager_id?: string | null;
  color?: string | null;
  logo_url?: string | null;
  url?: string | null;
  subscription_id?: string | null;
  litium_version?: string | null;
  billing_currency?: BillingCurrency;
  is_internal?: boolean;
  work_show_time_to_customer_users?: boolean;
  is_active?: boolean;
};

const CUSTOMER_SELECT =
  "id, name, contact_name, contact_email, contact_app_user_id, account_manager_id, color, logo_url, url, subscription_id, litium_version, billing_currency, is_internal, work_show_time_to_customer_users, is_active";

const SINGLE_INTERNAL_CUSTOMER_ERROR_PREFIX =
  "Only one customer can be internal";

function buildSingleInternalCustomerErrorMessage(
  existingInternalCustomerName: string
): string {
  return `${SINGLE_INTERNAL_CUSTOMER_ERROR_PREFIX}: customer "${existingInternalCustomerName}" is already internal.`;
}

async function findExistingInternalCustomerName(
  excludeCustomerId?: string
): Promise<string | null> {
  const { rows } = await cloudSqlPool.query<{ name: string }>(
    `SELECT name
     FROM customers
     WHERE is_internal = true
       AND ($1::uuid IS NULL OR id <> $1::uuid)
     ORDER BY created_at ASC
     LIMIT 1`,
    [excludeCustomerId ?? null]
  );
  return rows[0]?.name ?? null;
}

async function assertNoOtherInternalCustomer(excludeCustomerId?: string) {
  const existingInternalCustomerName = await findExistingInternalCustomerName(
    excludeCustomerId
  );
  if (existingInternalCustomerName) {
    throw new Error(
      buildSingleInternalCustomerErrorMessage(existingInternalCustomerName)
    );
  }
}

function isSingleInternalConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybePgError = error as { code?: string; constraint?: string };
  return (
    maybePgError.code === "23505" &&
    maybePgError.constraint === "customers_single_internal_idx"
  );
}

function isSubscriptionIdUniqueError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybePgError = error as { code?: string; constraint?: string };
  return (
    maybePgError.code === "23505" &&
    maybePgError.constraint === "customers_subscription_id_lower_idx"
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

async function appUserContactMap(
  ids: string[]
): Promise<Map<string, { name: string; email: string }>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const { rows } = await cloudSqlPool.query<{
    id: string;
    name: string | null;
    email: string;
  }>(
    `SELECT id, name, email FROM app_users WHERE id = ANY($1::uuid[])`,
    [unique]
  );
  const map = new Map<string, { name: string; email: string }>();
  for (const row of rows) {
    map.set(row.id, {
      name: row.name?.trim() || row.email,
      email: row.email,
    });
  }
  return map;
}

async function consultantNamesMap(
  ids: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const { rows } = await cloudSqlPool.query<{ id: string; name: string }>(
    `SELECT id, name FROM consultants WHERE id = ANY($1::uuid[])`,
    [unique]
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.id, row.name ?? "");
  }
  return map;
}

type CustomerProjectRow = {
  id: string;
  name: string;
  is_active: boolean;
  type: string;
  probability: number | null;
  hasWorkProject?: boolean;
};

async function workLinkedProjectIds(
  projectIds: string[]
): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set();
  try {
    const { rows } = await cloudSqlPool.query<{
      planner_project_id: string;
    }>(
      `SELECT planner_project_id
       FROM work_projects
       WHERE planner_project_id = ANY($1::uuid[])
         AND archived_at IS NULL`,
      [projectIds]
    );
    return new Set(rows.map((row) => row.planner_project_id));
  } catch {
    return new Set();
  }
}

function toCustomerWithDetails(
  customer: Customer,
  accountManagerNames: Map<string, string>,
  contactUsers: Map<string, { name: string; email: string }>,
  customerProjects: CustomerProjectRow[]
): CustomerWithDetails {
  const contact = customer.contact_app_user_id
    ? contactUsers.get(customer.contact_app_user_id)
    : undefined;
  const activeProjects = customerProjects.filter((project) => project.is_active);
  const primaryProject = customerProjects[0] ?? null;

  return {
    id: customer.id,
    name: customer.name,
    contactAppUserId: customer.contact_app_user_id ?? null,
    contactName: contact?.name ?? customer.contact_name,
    contactEmail: contact?.email ?? customer.contact_email,
    accountManagerId: customer.account_manager_id ?? null,
    accountManagerName: customer.account_manager_id
      ? accountManagerNames.get(customer.account_manager_id) ?? null
      : null,
    color: customer.color || DEFAULT_CUSTOMER_COLOR,
    logoUrl: customer.logo_url ?? null,
    url: customer.url ?? null,
    subscriptionId: customer.subscription_id ?? null,
    litiumVersion: customer.litium_version ?? null,
    billingCurrency: parseBillingCurrency(customer.billing_currency),
    isInternal: customer.is_internal ?? false,
    workShowTimeToCustomerUsers:
      customer.work_show_time_to_customer_users ?? false,
    initials: getInitials(customer.name),
    isActive: customer.is_active ?? true,
    activeProjectCount: activeProjects.length,
    primaryProject: primaryProject
      ? { name: primaryProject.name, isActive: primaryProject.is_active }
      : null,
    projects: customerProjects.map((project) => ({
      id: project.id,
      name: project.name,
      isActive: project.is_active,
      type: project.type as ProjectType,
      probability: project.probability,
      hasWorkProject: Boolean(project.hasWorkProject),
    })),
  };
}

export async function fetchCustomerById(
  id: string
): Promise<CustomerWithDetails | null> {
  const { rows } = await cloudSqlPool.query(
    `SELECT ${CUSTOMER_SELECT} FROM customers WHERE id = $1`,
    [id]
  );
  const data = rows[0] as Customer | undefined;
  if (!data) return null;

  const accountManagerNames = data.account_manager_id
    ? await consultantNamesMap([data.account_manager_id])
    : new Map<string, string>();
  const contactUsers = data.contact_app_user_id
    ? await appUserContactMap([data.contact_app_user_id])
    : new Map<string, { name: string; email: string }>();

  const projectsByCustomer = new Map<string, CustomerProjectRow[]>();
  try {
    const projects = await fetchProjectsByCustomerIds([data.id]);
    const workLinked = await workLinkedProjectIds(projects.map((p) => p.id));
    for (const p of projects) {
      const list = projectsByCustomer.get(p.customer_id) ?? [];
      list.push({
        id: p.id,
        name: p.name,
        is_active: p.is_active,
        type: p.type ?? "customer",
        probability: p.probability,
        hasWorkProject: workLinked.has(p.id),
      });
      projectsByCustomer.set(p.customer_id, list);
    }
  } catch {
    // Projects table may not exist
  }

  const customerProjects = projectsByCustomer.get(data.id) ?? [];
  return toCustomerWithDetails(
    data,
    accountManagerNames,
    contactUsers,
    customerProjects
  );
}

export async function fetchCustomers(): Promise<Customer[]> {
  const { rows } = await cloudSqlPool.query<Customer>(
    `SELECT ${CUSTOMER_SELECT} FROM customers ORDER BY name`
  );
  return rows;
}

export async function fetchInternalCustomerId(): Promise<string | null> {
  const { rows } = await cloudSqlPool.query<{ id: string }>(
    `SELECT id FROM customers WHERE is_internal = true ORDER BY created_at ASC LIMIT 1`
  );
  return rows[0]?.id ?? null;
}

export async function fetchCustomerIdByName(
  name: string
): Promise<string | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const { rows } = await cloudSqlPool.query<{ id: string }>(
    `SELECT id FROM customers WHERE lower(name) = lower($1) LIMIT 1`,
    [trimmed]
  );
  return rows[0]?.id ?? null;
}

export async function fetchCustomersByIds(ids: string[]): Promise<Customer[]> {
  if (ids.length === 0) return [];
  const { rows } = await cloudSqlPool.query<Customer>(
    `SELECT ${CUSTOMER_SELECT} FROM customers WHERE id = ANY($1::uuid[]) ORDER BY name`,
    [ids]
  );
  return rows;
}

export async function createCustomerQuery(
  input: CreateCustomerInput
): Promise<Customer> {
  if (input.is_internal) {
    await assertNoOtherInternalCustomer();
  }
  let rows: Customer[];
  try {
    const result = await cloudSqlPool.query<Customer>(
      `INSERT INTO customers (
         name, contact_name, contact_email, account_manager_id, color, logo_url, url, billing_currency, is_internal, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${CUSTOMER_SELECT}`,
      [
        input.name.trim(),
        input.contact_name?.trim() || null,
        input.contact_email?.trim() || null,
        input.account_manager_id ?? null,
        input.color?.trim() || DEFAULT_CUSTOMER_COLOR,
        input.logo_url?.trim() || null,
        input.url?.trim() ?? null,
        parseBillingCurrency(input.billing_currency ?? DEFAULT_BILLING_CURRENCY),
        input.is_internal ?? false,
        input.is_active ?? true,
      ]
    );
    rows = result.rows;
  } catch (error) {
    if (isSingleInternalConstraintError(error)) {
      const existingInternalCustomerName =
        (await findExistingInternalCustomerName()) ?? "another customer";
      throw new Error(
        buildSingleInternalCustomerErrorMessage(existingInternalCustomerName)
      );
    }
    throw error;
  }
  if (!rows[0]) throw new Error("Failed to create customer");
  return rows[0];
}

export async function updateCustomerQuery(
  id: string,
  input: UpdateCustomerInput
): Promise<Customer> {
  if (input.is_internal) {
    await assertNoOtherInternalCustomer(id);
    const { rows: memberRows } = await cloudSqlPool.query<{ exists: number }>(
      `SELECT 1 AS exists FROM customer_app_users WHERE customer_id = $1 LIMIT 1`,
      [id]
    );
    if (memberRows[0]) {
      throw new Error(
        "Remove customer users before making this the internal customer"
      );
    }
  }
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (input.name !== undefined) {
    sets.push(`name = $${i++}`);
    values.push(input.name.trim());
  }
  if (input.contact_app_user_id !== undefined) {
    const contactId = input.contact_app_user_id || null;
    sets.push(`contact_app_user_id = $${i++}`);
    values.push(contactId);
    if (contactId) {
      const contact = (await appUserContactMap([contactId])).get(contactId);
      sets.push(`contact_name = $${i++}`);
      values.push(contact?.name ?? null);
      sets.push(`contact_email = $${i++}`);
      values.push(contact?.email ?? null);
    } else {
      sets.push(`contact_name = $${i++}`);
      values.push(null);
      sets.push(`contact_email = $${i++}`);
      values.push(null);
    }
  } else {
    if (input.contact_name !== undefined) {
      sets.push(`contact_name = $${i++}`);
      values.push(input.contact_name?.trim() || null);
    }
    if (input.contact_email !== undefined) {
      sets.push(`contact_email = $${i++}`);
      values.push(input.contact_email?.trim() || null);
    }
  }
  if (input.account_manager_id !== undefined) {
    sets.push(`account_manager_id = $${i++}`);
    values.push(input.account_manager_id ?? null);
  }
  if (input.color !== undefined) {
    sets.push(`color = $${i++}`);
    values.push(input.color?.trim() || DEFAULT_CUSTOMER_COLOR);
  }
  if (input.logo_url !== undefined) {
    sets.push(`logo_url = $${i++}`);
    values.push(input.logo_url?.trim() || null);
  }
  if (input.url !== undefined) {
    sets.push(`url = $${i++}`);
    values.push(input.url?.trim() || null);
  }
  if (input.subscription_id !== undefined) {
    sets.push(`subscription_id = $${i++}`);
    values.push(parseSubscriptionIdInput(input.subscription_id));
  }
  if (input.litium_version !== undefined) {
    sets.push(`litium_version = $${i++}`);
    values.push(parseLitiumVersionInput(input.litium_version));
  }
  if (input.billing_currency !== undefined) {
    sets.push(`billing_currency = $${i++}`);
    values.push(parseBillingCurrency(input.billing_currency));
  }
  if (input.is_internal !== undefined) {
    sets.push(`is_internal = $${i++}`);
    values.push(input.is_internal);
    if (input.is_internal) {
      sets.push(`contact_app_user_id = $${i++}`);
      values.push(null);
    }
  }
  if (input.work_show_time_to_customer_users !== undefined) {
    sets.push(`work_show_time_to_customer_users = $${i++}`);
    values.push(input.work_show_time_to_customer_users);
  }
  if (input.is_active !== undefined) {
    sets.push(`is_active = $${i++}`);
    values.push(input.is_active);
  }
  sets.push(`updated_at = now()`);
  values.push(id);
  let rows: Customer[];
  try {
    const result = await cloudSqlPool.query<Customer>(
      `UPDATE customers SET ${sets.join(", ")} WHERE id = $${i} RETURNING ${CUSTOMER_SELECT}`,
      values
    );
    rows = result.rows;
    if (input.billing_currency !== undefined && rows[0]) {
      const billingCurrency = parseBillingCurrency(input.billing_currency);
      await cloudSqlPool.query(
        `UPDATE customer_rates
         SET currency = $2, updated_at = now()
         WHERE customer_id = $1 AND currency IS DISTINCT FROM $2`,
        [id, billingCurrency]
      );
      await cloudSqlPool.query(
        `UPDATE project_rates pr
         SET currency = $2, updated_at = now()
         FROM projects p
         WHERE p.id = pr.project_id
           AND p.customer_id = $1
           AND pr.currency IS DISTINCT FROM $2`,
        [id, billingCurrency]
      );
    }
  } catch (error) {
    if (isSingleInternalConstraintError(error)) {
      const existingInternalCustomerName =
        (await findExistingInternalCustomerName(id)) ?? "another customer";
      throw new Error(
        buildSingleInternalCustomerErrorMessage(existingInternalCustomerName)
      );
    }
    if (isSubscriptionIdUniqueError(error)) {
      throw new Error("Subscription ID is already used by another customer");
    }
    throw error;
  }
  if (!rows[0]) throw new Error("Failed to update customer");
  return rows[0];
}

export async function updateLitiumVersionsBySubscriptionId(
  items: { subscriptionId: string; version: string }[]
): Promise<{ updated: number; notFound: string[] }> {
  if (items.length === 0) {
    return { updated: 0, notFound: [] };
  }

  const subscriptionIds = items.map((item) => item.subscriptionId);
  const versions = items.map((item) => item.version);
  const { rows } = await cloudSqlPool.query<{ subscription_id: string }>(
    `UPDATE customers AS c
     SET litium_version = v.version,
         updated_at = now()
     FROM unnest($1::text[], $2::text[]) AS v(subscription_id, version)
     WHERE c.subscription_id IS NOT NULL
       AND lower(c.subscription_id) = lower(v.subscription_id)
     RETURNING c.subscription_id`,
    [subscriptionIds, versions]
  );

  const updatedKeys = new Set(
    rows.map((row) => row.subscription_id.toLowerCase())
  );
  const notFound = items
    .filter((item) => !updatedKeys.has(item.subscriptionId.toLowerCase()))
    .map((item) => item.subscriptionId);

  return { updated: rows.length, notFound };
}

/** True when hard-deleting would remove or be blocked by time-report history. */
export async function customerHasDeleteBlockers(id: string): Promise<boolean> {
  const { rows } = await cloudSqlPool.query<{ blocked: boolean }>(
    `SELECT (
       EXISTS (SELECT 1 FROM time_report_entry_lines WHERE customer_id = $1)
       OR EXISTS (SELECT 1 FROM time_report_entries WHERE customer_id = $1)
     ) AS blocked`,
    [id]
  );
  return Boolean(rows[0]?.blocked);
}

export async function deleteCustomerQuery(id: string): Promise<void> {
  if (await customerHasDeleteBlockers(id)) {
    throw new Error(
      "This customer has time report history and cannot be deleted. Set status to Inactive instead."
    );
  }
  try {
    await cloudSqlPool.query(`DELETE FROM customers WHERE id = $1`, [id]);
  } catch (error) {
    const code =
      typeof error === "object" &&
      error != null &&
      "code" in error &&
      typeof (error as { code: unknown }).code === "string"
        ? (error as { code: string }).code
        : null;
    if (code === "23503") {
      throw new Error(
        "This customer has related history and cannot be deleted. Set status to Inactive instead."
      );
    }
    throw error;
  }
}

export async function fetchCustomersWithDetails(): Promise<
  CustomerWithDetails[]
> {
  const customers = await fetchCustomers();

  const accountManagerIds = [
    ...new Set(customers.map((c) => c.account_manager_id).filter(Boolean)),
  ] as string[];
  const contactUserIds = [
    ...new Set(customers.map((c) => c.contact_app_user_id).filter(Boolean)),
  ] as string[];
  const [accountManagerNames, contactUsers] = await Promise.all([
    consultantNamesMap(accountManagerIds),
    appUserContactMap(contactUserIds),
  ]);

  const projectsByCustomer = new Map<string, CustomerProjectRow[]>();
  try {
    const projects = await fetchProjectsByCustomerIds(
      customers.map((c) => c.id)
    );
    const workLinked = await workLinkedProjectIds(projects.map((p) => p.id));
    for (const p of projects) {
      const list = projectsByCustomer.get(p.customer_id) ?? [];
      list.push({
        id: p.id,
        name: p.name,
        is_active: p.is_active,
        type: p.type ?? "customer",
        probability: p.probability,
        hasWorkProject: workLinked.has(p.id),
      });
      projectsByCustomer.set(p.customer_id, list);
    }
  } catch {
    // Projects table may not exist yet
  }

  return customers.map((c) =>
    toCustomerWithDetails(
      c,
      accountManagerNames,
      contactUsers,
      projectsByCustomer.get(c.id) ?? []
    )
  );
}
