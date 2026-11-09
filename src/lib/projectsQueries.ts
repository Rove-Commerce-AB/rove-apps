import { cloudSqlPool } from "@/lib/cloudSqlPool";

import * as allocations from "./allocationsQueries";
import * as cc from "./customerConsultantsQueries";
import * as customers from "./customersQueries";
import * as consultants from "./consultantsQueries";
import { DEFAULT_CUSTOMER_COLOR } from "./constants";
import { parseBillingCurrency } from "./currency";
import type {
  ProjectBillingType,
  ProjectWithDetails,
  ProjectType,
} from "@/types";

function parseBillingType(value: unknown): ProjectBillingType {
  return value === "fixed" ? "fixed" : "hourly";
}

let clickupProjectColumnAvailable: boolean | null = null;

async function hasClickupProjectColumn(): Promise<boolean> {
  if (clickupProjectColumnAvailable != null) return clickupProjectColumnAvailable;
  try {
    const { rows } = await cloudSqlPool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'projects'
           AND column_name = 'clickup_project_id'
       ) AS "exists"`
    );
    clickupProjectColumnAvailable = Boolean(rows[0]?.exists);
    return clickupProjectColumnAvailable;
  } catch {
    clickupProjectColumnAvailable = false;
    return false;
  }
}

function projectSelectClause(includeClickupProjectId: boolean): string {
  return includeClickupProjectId
    ? "id, customer_id, name, is_active, type, billing_type, absence_code, project_manager_id, start_date::text, end_date::text, probability, jira_project_key, devops_project, clickup_project_id, budget_hours, budget_money"
    : "id, customer_id, name, is_active, type, billing_type, absence_code, project_manager_id, start_date::text, end_date::text, probability, jira_project_key, devops_project, NULL::text AS clickup_project_id, budget_hours, budget_money";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export type ProjectRecord = {
  id: string;
  customer_id: string;
  name: string;
  is_active: boolean;
  type: ProjectType;
  billing_type: ProjectBillingType;
  absence_code: string | null;
  project_manager_id: string | null;
  start_date: string | null;
  end_date: string | null;
  probability: number | null;
  jira_project_key: string | null;
  devops_project: string | null;
  clickup_project_id: string | null;
  budget_hours: number | null;
  budget_money: number | null;
};

export type CreateProjectInput = {
  name: string;
  customer_id: string;
  is_active?: boolean;
  type?: ProjectType;
  billing_type?: ProjectBillingType;
  absence_code?: string | null;
  project_manager_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  probability?: number | null;
  jira_project_key?: string | null;
  devops_project?: string | null;
  clickup_project_id?: string | null;
  budget_hours?: number | null;
  budget_money?: number | null;
};

export type UpdateProjectInput = {
  name?: string;
  customer_id?: string;
  is_active?: boolean;
  type?: ProjectType;
  billing_type?: ProjectBillingType;
  absence_code?: string | null;
  project_manager_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  probability?: number | null;
  jira_project_key?: string | null;
  devops_project?: string | null;
  clickup_project_id?: string | null;
  budget_hours?: number | null;
  budget_money?: number | null;
};

function rowToProjectRecord(r: Record<string, unknown>): ProjectRecord {
  return {
    id: r.id as string,
    customer_id: r.customer_id as string,
    name: r.name as string,
    is_active: Boolean(r.is_active),
    type: (r.type as ProjectType) ?? "customer",
    billing_type: parseBillingType(r.billing_type),
    absence_code: (r.absence_code as string | null)?.trim() || null,
    project_manager_id: (r.project_manager_id as string | null) ?? null,
    start_date: (r.start_date as string | null) ?? null,
    end_date: (r.end_date as string | null) ?? null,
    probability:
      r.probability != null ? Number(r.probability as string | number) : null,
    jira_project_key: (r.jira_project_key as string | null) ?? null,
    devops_project: (r.devops_project as string | null) ?? null,
    clickup_project_id: (r.clickup_project_id as string | null) ?? null,
    budget_hours:
      r.budget_hours != null ? Number(r.budget_hours as string | number) : null,
    budget_money:
      r.budget_money != null ? Number(r.budget_money as string | number) : null,
  };
}

export async function createProjectQuery(
  input: CreateProjectInput
): Promise<ProjectRecord> {
  const prob = input.probability ?? 100;
  const includeClickupProjectId = await hasClickupProjectColumn();
  const billingType = input.billing_type ?? "hourly";
  const { rows } = includeClickupProjectId
    ? await cloudSqlPool.query(
        `INSERT INTO projects (
           name, customer_id, is_active, type, billing_type, project_manager_id,
           start_date, end_date, probability, jira_project_key, devops_project, clickup_project_id,
           budget_hours, budget_money
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING ${projectSelectClause(true)}`,
        [
          input.name.trim(),
          input.customer_id,
          input.is_active ?? true,
          input.type ?? "customer",
          billingType,
          input.project_manager_id ?? null,
          input.start_date?.trim() || null,
          input.end_date?.trim() || null,
          prob,
          input.jira_project_key?.trim() || null,
          input.devops_project?.trim() || null,
          input.clickup_project_id?.trim() || null,
          input.budget_hours ?? null,
          input.budget_money ?? null,
        ]
      )
    : await cloudSqlPool.query(
        `INSERT INTO projects (
           name, customer_id, is_active, type, billing_type, project_manager_id,
           start_date, end_date, probability, jira_project_key, devops_project,
           budget_hours, budget_money
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING ${projectSelectClause(false)}`,
        [
          input.name.trim(),
          input.customer_id,
          input.is_active ?? true,
          input.type ?? "customer",
          billingType,
          input.project_manager_id ?? null,
          input.start_date?.trim() || null,
          input.end_date?.trim() || null,
          prob,
          input.jira_project_key?.trim() || null,
          input.devops_project?.trim() || null,
          input.budget_hours ?? null,
          input.budget_money ?? null,
        ]
      );
  if (!rows[0]) throw new Error("Failed to create project");
  return rowToProjectRecord(rows[0] as Record<string, unknown>);
}

export async function updateProjectQuery(
  id: string,
  input: UpdateProjectInput
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (input.name !== undefined) {
    sets.push(`name = $${i++}`);
    values.push(input.name.trim());
  }
  if (input.customer_id !== undefined) {
    sets.push(`customer_id = $${i++}`);
    values.push(input.customer_id);
  }
  if (input.is_active !== undefined) {
    sets.push(`is_active = $${i++}`);
    values.push(input.is_active);
  }
  if (input.type !== undefined) {
    sets.push(`type = $${i++}`);
    values.push(input.type);
    if (input.type !== "absence" && input.absence_code === undefined) {
      sets.push(`absence_code = NULL`);
    }
  }
  if (input.billing_type !== undefined) {
    sets.push(`billing_type = $${i++}`);
    values.push(input.billing_type);
  }
  if (input.absence_code !== undefined) {
    sets.push(`absence_code = $${i++}`);
    values.push(input.absence_code?.trim() || null);
  }
  if (input.project_manager_id !== undefined) {
    sets.push(`project_manager_id = $${i++}`);
    values.push(input.project_manager_id ?? null);
  }
  if (input.start_date !== undefined) {
    sets.push(`start_date = $${i++}`);
    values.push(input.start_date?.trim() || null);
  }
  if (input.end_date !== undefined) {
    sets.push(`end_date = $${i++}`);
    values.push(input.end_date?.trim() || null);
  }
  if (input.probability !== undefined) {
    sets.push(`probability = $${i++}`);
    values.push(input.probability);
  }
  if (input.jira_project_key !== undefined) {
    sets.push(`jira_project_key = $${i++}`);
    values.push(input.jira_project_key?.trim() || null);
  }
  if (input.devops_project !== undefined) {
    sets.push(`devops_project = $${i++}`);
    values.push(input.devops_project?.trim() || null);
  }
  if (input.clickup_project_id !== undefined) {
    if (!(await hasClickupProjectColumn())) {
      throw new Error(
        "Database migration required for ClickUp integration: run scripts/alter_projects_add_clickup_project_id.sql."
      );
    }
    sets.push(`clickup_project_id = $${i++}`);
    values.push(input.clickup_project_id?.trim() || null);
  }
  if (input.budget_hours !== undefined) {
    sets.push(`budget_hours = $${i++}`);
    values.push(input.budget_hours ?? null);
  }
  if (input.budget_money !== undefined) {
    sets.push(`budget_money = $${i++}`);
    values.push(input.budget_money ?? null);
  }
  if (sets.length === 0) return;
  sets.push(`updated_at = now()`);
  values.push(id);
  const { rowCount } = await cloudSqlPool.query(
    `UPDATE projects SET ${sets.join(", ")} WHERE id = $${i}`,
    values
  );
  if (!rowCount) throw new Error("Update returned no data");
}

export async function deleteProjectQuery(id: string): Promise<void> {
  await cloudSqlPool.query(`DELETE FROM projects WHERE id = $1`, [id]);
}

export type IntegrationProjectOption = { value: string; label: string };

export async function fetchUniqueJiraAndDevopsProjects(): Promise<
  IntegrationProjectOption[]
> {
  try {
    const [jiraRes, devopsRes, clickupRes] = await Promise.all([
      cloudSqlPool.query<{
        project_key: string;
        project_name: string | null;
      }>(`SELECT * FROM get_distinct_jira_projects()`),
      cloudSqlPool.query<{ project: string }>(
        `SELECT * FROM get_distinct_devops_projects()`
      ),
      cloudSqlPool
        .query<{
          folder_id: string;
          folder_name: string | null;
          space_name: string | null;
        }>(
          `SELECT folder_id,
                  NULLIF(MAX(NULLIF(folder_name, '')), '') AS folder_name,
                  NULLIF(MAX(NULLIF(space_name, '')), '') AS space_name
           FROM clickup
           WHERE folder_id IS NOT NULL
             AND NULLIF(folder_id, '') IS NOT NULL
           GROUP BY folder_id
           ORDER BY COALESCE(NULLIF(MAX(NULLIF(folder_name, '')), ''), folder_id)`
        )
        .catch(
          () =>
            ({
              rows: [] as {
                folder_id: string;
                folder_name: string | null;
                space_name: string | null;
              }[],
            }) as const
        ),
    ]);

    const jiraOptions: IntegrationProjectOption[] = jiraRes.rows.map((row) => {
      const key = row.project_key?.trim() ?? "";
      const name = (row.project_name ?? key).trim();
      return {
        value: `jira:${key}`,
        label: `Jira: ${key}${name && name !== key ? ` (${name})` : ""}`,
      };
    });

    const devopsOptions: IntegrationProjectOption[] = devopsRes.rows.map(
      (row) => {
        const p = (row.project ?? "").trim();
        return { value: `devops:${p}`, label: `DevOps: ${p}` };
      }
    );

    const clickupOptions: IntegrationProjectOption[] = clickupRes.rows.map(
      (row) => {
        const id = row.folder_id?.trim() ?? "";
        const folderName = (row.folder_name ?? id).trim();
        const spaceName = (row.space_name ?? "").trim();
        return {
          value: `clickup:${id}`,
          label: `ClickUp: ${folderName}${
            spaceName && spaceName !== folderName ? ` (${spaceName})` : ""
          }`,
        };
      }
    );

    return [{ value: "", label: "—" }, ...jiraOptions, ...devopsOptions, ...clickupOptions];
  } catch {
    return [{ value: "", label: "—" }];
  }
}

export async function fetchProjectWithDetailsById(
  id: string
): Promise<ProjectWithDetails | null> {
  const includeClickupProjectId = await hasClickupProjectColumn();
  const [projectRes, customersList, reportedRes] = await Promise.all([
    cloudSqlPool.query(
      `SELECT ${projectSelectClause(includeClickupProjectId)} FROM projects WHERE id = $1`,
      [id]
    ),
    customers.fetchCustomers(),
    cloudSqlPool.query<{ hours: string | number | null }>(
      `SELECT COALESCE(SUM(hours), 0) AS hours
       FROM time_report_entries
       WHERE project_id = $1`,
      [id]
    ),
  ]);

  const p = projectRes.rows[0] as Record<string, unknown> | undefined;
  if (!p) return null;

  const projectType = (p.type as ProjectType) ?? "customer";

  const customerMap = new Map(
    customersList.map((c) => [
      c.id,
      {
        name: c.name,
        color: c.color || DEFAULT_CUSTOMER_COLOR,
        billingCurrency: parseBillingCurrency(c.billing_currency),
      },
    ])
  );
  const cust = customerMap.get(p.customer_id as string);
  const projectManagerId = (p.project_manager_id as string | null) ?? null;
  const projectManagerNames = projectManagerId
    ? await consultants.fetchConsultantNamesByIds([projectManagerId])
    : new Map<string, string>();
  const projectManagerName = projectManagerId
    ? projectManagerNames.get(projectManagerId) ?? null
    : null;

  const probability =
    p.probability != null ? Number(p.probability as number) : 100;
  return {
    id: p.id as string,
    name: p.name as string,
    isActive: Boolean(p.is_active),
    type: projectType,
    billingType: parseBillingType(p.billing_type),
    absenceCode: (p.absence_code as string | null)?.trim() || null,
    customer_id: (p.customer_id as string) ?? "",
    customerName: cust?.name ?? "Unknown",
    projectManagerId,
    projectManagerName,
    startDate: (p.start_date as string | null) ?? null,
    endDate: (p.end_date as string | null) ?? null,
    probability,
    jiraProjectKey: (p.jira_project_key as string | null) ?? null,
    devopsProject: (p.devops_project as string | null) ?? null,
    clickupProjectId: (p.clickup_project_id as string | null) ?? null,
    budgetHours:
      p.budget_hours != null ? Number(p.budget_hours as number) : null,
    budgetMoney:
      p.budget_money != null ? Number(p.budget_money as number) : null,
    billingCurrency: cust?.billingCurrency ?? "SEK",
    reportedHours: Number(reportedRes.rows[0]?.hours ?? 0),
    consultantCount: 0,
    totalHoursAllocated: 0,
    consultantInitials: [],
    color: cust?.color ?? DEFAULT_CUSTOMER_COLOR,
  };
}

export async function fetchProjects(): Promise<ProjectRecord[]> {
  const includeClickupProjectId = await hasClickupProjectColumn();
  const { rows } = await cloudSqlPool.query(
    `SELECT ${projectSelectClause(includeClickupProjectId)} FROM projects ORDER BY is_active DESC, name`
  );
  return rows.map((r) => rowToProjectRecord(r as Record<string, unknown>));
}

export async function fetchProjectsWithDetails(): Promise<
  ProjectWithDetails[]
> {
  const [projects, customersList] = await Promise.all([
    fetchProjects(),
    customers.fetchCustomers(),
  ]);

  if (projects.length === 0) return [];

  const customerMap = new Map(
    customersList.map((c) => [
      c.id,
      {
        name: c.name,
        color: c.color || DEFAULT_CUSTOMER_COLOR,
        billingCurrency: parseBillingCurrency(c.billing_currency),
      },
    ])
  );

  const projectManagerIds = [
    ...new Set(projects.map((p) => p.project_manager_id).filter(Boolean)),
  ] as string[];
  let projectManagerNames = new Map<string, string>();
  try {
    projectManagerNames = await consultants.fetchConsultantNamesByIds(
      projectManagerIds
    );
  } catch {
    // optional field
  }

  let allocationRows: Awaited<
    ReturnType<typeof allocations.getAllocationsByProjectIds>
  > = [];
  try {
    allocationRows = await allocations.getAllocationsByProjectIds(
      projects.map((p) => p.id)
    );
  } catch {
    // Allocations table may not exist yet
  }

  const consultantIds = [
    ...new Set(
      allocationRows.map((a) => a.consultant_id).filter((id): id is string => id != null)
    ),
  ];
  let consultantRows: { id: string; name: string }[] = [];
  try {
    if (consultantIds.length > 0) {
      const { rows } = await cloudSqlPool.query<{ id: string; name: string }>(
        `SELECT id, name FROM consultants WHERE id = ANY($1::uuid[])`,
        [consultantIds]
      );
      consultantRows = rows;
    }
  } catch {
    // Consultants table may not exist
  }
  const consultantMap = new Map(
    consultantRows.map((c) => [c.id, getInitials(c.name)])
  );
  const byProject = new Map<
    string,
    { totalHours: number; consultantIds: Set<string | null> }
  >();
  for (const a of allocationRows) {
    const existing = byProject.get(a.project_id) ?? {
      totalHours: 0,
      consultantIds: new Set<string | null>(),
    };
    existing.totalHours += a.hours;
    existing.consultantIds.add(a.consultant_id);
    byProject.set(a.project_id, existing);
  }

  return projects.map((p) => {
    const stats = byProject.get(p.id);
    const consultantIdsList = stats
      ? Array.from(stats.consultantIds)
      : [];
    const initials = consultantIdsList
      .map((id) => (id == null ? "TP" : consultantMap.get(id) ?? "?"))
      .filter(Boolean);

    const cust = customerMap.get(p.customer_id);
    const projectManagerId = p.project_manager_id ?? null;
    const projectType = (p.type as ProjectType) ?? "customer";
    const probability = p.probability != null ? p.probability : 100;
    return {
      id: p.id,
      name: p.name,
      isActive: p.is_active,
      type: projectType,
      billingType: p.billing_type,
      absenceCode: p.absence_code ?? null,
      customer_id: p.customer_id,
      customerName: cust?.name ?? "Unknown",
      projectManagerId,
      projectManagerName: projectManagerId
        ? projectManagerNames.get(projectManagerId) ?? null
        : null,
      startDate: p.start_date ?? null,
      endDate: p.end_date ?? null,
      probability,
      jiraProjectKey: p.jira_project_key ?? null,
      devopsProject: p.devops_project ?? null,
      clickupProjectId: p.clickup_project_id ?? null,
      budgetHours: p.budget_hours != null ? Number(p.budget_hours) : null,
      budgetMoney: p.budget_money != null ? Number(p.budget_money) : null,
      billingCurrency: cust?.billingCurrency ?? "SEK",
      reportedHours: 0,
      consultantCount: consultantIdsList.length,
      totalHoursAllocated: stats?.totalHours ?? 0,
      consultantInitials: initials,
      color: cust?.color ?? DEFAULT_CUSTOMER_COLOR,
    };
  });
}

export async function fetchProjectsByCustomerIds(
  customerIds: string[]
): Promise<ProjectRecord[]> {
  if (customerIds.length === 0) return [];

  const includeClickupProjectId = await hasClickupProjectColumn();
  const { rows } = await cloudSqlPool.query(
    `SELECT ${projectSelectClause(includeClickupProjectId)} FROM projects WHERE customer_id = ANY($1::uuid[])`,
    [customerIds]
  );
  return rows.map((r) => rowToProjectRecord(r as Record<string, unknown>));
}

export async function fetchProjectsByIds(
  ids: string[]
): Promise<{ id: string; name: string }[]> {
  if (ids.length === 0) return [];

  const { rows } = await cloudSqlPool.query<{ id: string; name: string }>(
    `SELECT id, name FROM projects WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  return rows;
}

export async function fetchProjectBillingTypesByIds(
  ids: string[]
): Promise<Map<string, ProjectBillingType>> {
  const map = new Map<string, ProjectBillingType>();
  if (ids.length === 0) return map;
  const { rows } = await cloudSqlPool.query<{
    id: string;
    billing_type: string;
  }>(`SELECT id, billing_type FROM projects WHERE id = ANY($1::uuid[])`, [ids]);
  for (const r of rows) {
    map.set(r.id, parseBillingType(r.billing_type));
  }
  return map;
}

export async function fetchProjectsWithCustomerNames(
  ids: string[]
): Promise<{ id: string; name: string; customerName: string }[]> {
  if (ids.length === 0) return [];
  const { rows: projects } = await cloudSqlPool.query<{
    id: string;
    name: string;
    customer_id: string;
  }>(
    `SELECT id, name, customer_id FROM projects WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  if (!projects.length) return [];
  const customerIds = [...new Set(projects.map((p) => p.customer_id).filter(Boolean))];
  const { rows: customersData } = await cloudSqlPool.query<{
    id: string;
    name: string;
  }>(
    `SELECT id, name FROM customers WHERE id = ANY($1::uuid[])`,
    [customerIds]
  );
  const customerMap = new Map(customersData.map((c) => [c.id, c.name]));
  return projects.map((p) => ({
    id: p.id,
    name: p.name ?? "Unknown",
    customerName: customerMap.get(p.customer_id) ?? "Unknown",
  }));
}

export type ProjectWithCustomer = {
  id: string;
  name: string;
  customer_id: string;
  customerName: string;
  customerColor: string;
  type: ProjectType;
  isActive: boolean;
  customerIsActive: boolean;
  probability: number | null;
};

export async function fetchProjectsWithCustomer(
  ids: string[] = []
): Promise<ProjectWithCustomer[]> {
  let list: {
    id: string;
    name: string;
    customer_id: string;
    type: string;
    is_active: boolean;
    probability: number | null;
  }[] = [];

  if (ids.length > 0) {
    const { rows } = await cloudSqlPool.query(
      `SELECT id, name, customer_id, type, is_active, probability
       FROM projects WHERE id = ANY($1::uuid[]) ORDER BY name`,
      [ids]
    );
    list = rows as typeof list;
  } else {
    const { rows } = await cloudSqlPool.query(
      `SELECT id, name, customer_id, type, is_active, probability FROM projects ORDER BY name`
    );
    list = rows as typeof list;
  }

  if (list.length === 0) return [];

  const customerIds = [...new Set(list.map((p) => p.customer_id))];
  const { rows: customersData } = await cloudSqlPool.query<{
    id: string;
    name: string;
    color: string | null;
    is_active: boolean;
  }>(
    `SELECT id, name, color, is_active FROM customers WHERE id = ANY($1::uuid[])`,
    [customerIds]
  );
  const customerMap = new Map(
    customersData.map((c) => [
      c.id,
      {
        name: c.name,
        color: c.color || DEFAULT_CUSTOMER_COLOR,
        is_active: c.is_active ?? true,
      },
    ])
  );

  return list.map((p) => {
    const cust = customerMap.get(p.customer_id);
    const probability = p.probability != null ? p.probability : 100;
    return {
      id: p.id,
      name: p.name,
      customer_id: p.customer_id,
      customerName: cust?.name ?? "Unknown",
      customerColor: cust?.color ?? DEFAULT_CUSTOMER_COLOR,
      type: (p.type ?? "customer") as ProjectType,
      isActive: p.is_active ?? true,
      customerIsActive: cust?.is_active ?? true,
      probability,
    };
  });
}

export async function fetchProjectsAvailableForConsultant(
  consultantId: string | null
): Promise<ProjectWithCustomer[]> {
  if (!consultantId) return fetchProjectsWithCustomer([]);

  const customerIds = await cc.getCustomerIdsForConsultant(consultantId);
  if (customerIds.length === 0) return [];

  const { rows: projects } = await cloudSqlPool.query<{
    id: string;
    name: string;
    customer_id: string;
    type: string;
    is_active: boolean;
    probability: number | null;
  }>(
    `SELECT id, name, customer_id, type, is_active, probability
     FROM projects WHERE customer_id = ANY($1::uuid[]) ORDER BY name`,
    [customerIds]
  );

  if (!projects.length) return [];

  const cidList = [...new Set(projects.map((p) => p.customer_id))];
  const { rows: customersData } = await cloudSqlPool.query<{
    id: string;
    name: string;
    color: string | null;
    is_active: boolean;
  }>(
    `SELECT id, name, color, is_active FROM customers WHERE id = ANY($1::uuid[])`,
    [cidList]
  );
  const customerMap = new Map(
    customersData.map((c) => [
      c.id,
      {
        name: c.name,
        color: c.color || DEFAULT_CUSTOMER_COLOR,
        is_active: c.is_active ?? true,
      },
    ])
  );

  return projects.map((p) => {
    const cust = customerMap.get(p.customer_id);
    const probability = p.probability != null ? p.probability : 100;
    return {
      id: p.id,
      name: p.name,
      customer_id: p.customer_id,
      customerName: cust?.name ?? "Unknown",
      customerColor: cust?.color ?? DEFAULT_CUSTOMER_COLOR,
      type: (p.type ?? "customer") as ProjectType,
      isActive: p.is_active ?? true,
      customerIsActive: cust?.is_active ?? true,
      probability,
    };
  });
}
