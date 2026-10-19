import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import { cloudSqlPool, withCloudSqlTransaction } from "@/lib/cloudSqlPool";
import { fetchConsultantByAppUserId } from "@/lib/consultantsQueries";
import type { McpUser } from "@/lib/mcpAuth";
import {
  getProjectBillingTypesByIds,
  getProjectsByCustomerIds,
} from "@/lib/projects";
import {
  getJiraIssuesByProjectKey,
  getDevOpsWorkItemsByProject,
  getClickUpItemsByProjectKey,
} from "@/lib/timeReportIntegrations";
import { getCustomerRates, getCustomerRatesByCustomerIds } from "@/lib/customerRates";
import { getCustomersByIds } from "@/lib/customers";
import { parseBillingCurrency, type BillingCurrency } from "@/lib/currency";
import {
  getBillingItemsForCustomerAndProject,
  getProjectRates,
  getProjectRatesByProjectIds,
} from "@/lib/projectRates";
import { encodeBillingItemKey, parseBillingItemKey } from "@/lib/billingItem";
import type { CustomerRate } from "@/lib/customerRatesQueries";
import type { ProjectRate } from "@/lib/projectRatesQueries";
import { getCalendarHolidays } from "@/lib/calendarHolidays";
import {
  getISOWeekDateRange,
  getISOWeekDateStrings,
  getYearWeekForDate,
} from "@/lib/dateUtils";
import { getConsultantForCurrentUser } from "@/lib/consultants";
import { getCurrentAppUser } from "@/lib/appUsers";
import { getInternalCustomerId } from "@/lib/customers";
import type {
  CopyEntryToWeekResult,
  CopyTimeReportEntriesBatchResult,
  JiraDevOpsOption,
  ProjectOption,
  SaveTimeReportEntriesResult,
  TaskOption,
  TimeReportCopyBatchOperation,
  TimeReportCustomerGroup,
  TimeReportEntry,
  TimeReportEntryCopyPayload,
  TimeReportWeekData,
} from "@/types";
import {
  fetchWorkIssueTimeOptionsByIds,
  fetchWorkIssueTimeOptionsForCustomer,
  workIssueIdsForCustomer,
  type WorkIssueTimeOption,
} from "@/lib/workTimeReport";
import {
  workIssueIdFromLinkKey,
  workIssueLinkKey,
} from "@/lib/workIssueTimeLink";

async function getTimeReportAccessContext(workMcpUser?: McpUser) {
  const [appUser, consultant] = await Promise.all([
    workMcpUser ?? getCurrentAppUser(),
    workMcpUser ? fetchConsultantByAppUserId(workMcpUser.id) : getConsultantForCurrentUser(),
  ]);
  if (!consultant?.id) {
    return {
      appUser,
      consultant: null,
      allowedCustomerIds: new Set<string>(),
      bookedProjectIds: new Set<string>(),
    };
  }

  const { rows: customerLinks } = await cloudSqlPool.query<{ customer_id: string }>(
    `SELECT customer_id FROM customer_consultants WHERE consultant_id = $1`,
    [consultant.id]
  );
  const allowedCustomerIds = new Set(customerLinks.map((r) => r.customer_id));
  if (consultant.isExternal) {
    const internalCustomerId = await getInternalCustomerId();
    if (internalCustomerId) allowedCustomerIds.delete(internalCustomerId);
  }

  const { rows: allocations } = await cloudSqlPool.query<{ project_id: string }>(
    `SELECT project_id FROM allocations WHERE consultant_id = $1`,
    [consultant.id]
  );
  const bookedProjectIds = new Set(allocations.map((r) => r.project_id));

  return { appUser, consultant, allowedCustomerIds, bookedProjectIds };
}

function isExternalConsultant(
  consultant: { isExternal?: boolean } | null | undefined
): boolean {
  return consultant?.isExternal === true;
}

/** When saving month view, only cells and deletes inside this calendar month are applied (ISO weeks may spill outside). */
export type SaveTimeReportCalendarMonthScope = { year: number; month: number };

function calendarMonthDateBounds(y: number, m: number): { start: string; end: string } {
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const monthEnd = new Date(y, m, 0);
  const end = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, "0")}-${String(
    monthEnd.getDate()
  ).padStart(2, "0")}`;
  return { start, end };
}

function dateStrInInclusiveBounds(dateStr: string, start: string, end: string): boolean {
  return dateStr >= start && dateStr <= end;
}

export async function getActiveProjectsForCustomer(
  customerId: string
): Promise<ProjectOption[]> {
  if (!customerId) return [];
  const ctx = await getTimeReportAccessContext();
  if (!ctx.consultant) return [];
  if (!ctx.allowedCustomerIds.has(customerId)) return [];

  const projects = await getProjectsByCustomerIds([customerId]);
  const active = projects.filter((p) => p.is_active);
  if (isExternalConsultant(ctx.consultant)) {
    return active
      .filter((p) => ctx.bookedProjectIds.has(p.id))
      .map((p) => ({ value: p.id, label: p.name }));
  }
  return active.map((p) => ({ value: p.id, label: p.name }));
}

export async function getJiraDevOpsOptionsForProject(
  projectId: string
): Promise<JiraDevOpsOption[]> {
  if (!projectId) return [];
  const ctx = await getTimeReportAccessContext();
  if (!ctx.consultant) return [];
  if (isExternalConsultant(ctx.consultant) && !ctx.bookedProjectIds.has(projectId)) {
    return [];
  }
  let rows: Array<{
    jira_project_key: string | null;
    devops_project: string | null;
    clickup_project_id: string | null;
  }> = [];
  try {
    const result = await cloudSqlPool.query<{
      jira_project_key: string | null;
      devops_project: string | null;
      clickup_project_id: string | null;
    }>(
      `SELECT jira_project_key, devops_project, clickup_project_id FROM projects WHERE id = $1`,
      [projectId]
    );
    rows = result.rows;
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
    if (code !== "42703") throw error;
    const fallback = await cloudSqlPool.query<{
      jira_project_key: string | null;
      devops_project: string | null;
    }>(`SELECT jira_project_key, devops_project FROM projects WHERE id = $1`, [projectId]);
    rows = fallback.rows.map((row) => ({
      ...row,
      clickup_project_id: null,
    }));
  }
  const project = rows[0];
  if (!project) return [];

  const options: JiraDevOpsOption[] = [];
  if (project.jira_project_key) {
    const jira = await getJiraIssuesByProjectKey(project.jira_project_key);
    options.push(
      ...jira.map((o) => ({
        value: `jira:${o.value}`,
        label: o.label,
        url: o.url ?? undefined,
        description: o.summary?.trim() || null,
      }))
    );
  }
  if (project.devops_project) {
    const devops = await getDevOpsWorkItemsByProject(project.devops_project);
    options.push(
      ...devops.map((o) => ({
        value: `devops:${o.value}`,
        label: o.label,
        description: o.title?.trim() || null,
      }))
    );
  }
  if (project.clickup_project_id) {
    const clickup = await getClickUpItemsByProjectKey(project.clickup_project_id);
    options.push(
      ...clickup.map((o) => ({
        value: `clickup:${o.value}`,
        label: o.label,
        url: o.url ?? undefined,
        description: o.summary?.trim() || null,
      }))
    );
  }
  return options;
}

export async function getTaskOptionsForCustomerAndProject(
  customerId: string,
  projectId?: string
): Promise<TaskOption[]> {
  if (!customerId) return [];
  const ctx = await getTimeReportAccessContext();
  if (!ctx.consultant) return [];
  if (!ctx.allowedCustomerIds.has(customerId)) return [];
  if (
    isExternalConsultant(ctx.consultant) &&
    projectId &&
    !ctx.bookedProjectIds.has(projectId)
  ) {
    return [];
  }

  const items = await getBillingItemsForCustomerAndProject(customerId, projectId);
  return items.map((r) => ({ value: r.id, label: r.name }));
}

export type TimeReportBatchHydrateResult = {
  projectsByCustomerId: Record<string, ProjectOption[]>;
  tasksByCacheKey: Record<string, TaskOption[]>;
  workIssuesByCustomerId: Record<string, WorkIssueTimeOption[]>;
};

/** Aligns with `taskCacheKey` in `timeReportEntryModel.ts`. */
function timeReportTaskCacheKeyServer(customerId: string, projectId: string) {
  return `${customerId}-${projectId || ""}`;
}

/**
 * Single server round-trip for project and role/task dropdown data after loading a week.
 * @param customerIds Customers to load project lists for (e.g. all groups in the week).
 * @param taskOptionPairs Unique (customerId, projectId) pairs; use projectId "" when no project is selected.
 */
export async function batchHydrateTimeReport(
  customerIds: string[],
  taskOptionPairs: Array<{ customerId: string; projectId: string }>,
  extraWorkIssueIds: string[] = []
): Promise<TimeReportBatchHydrateResult> {
  const ctx = await getTimeReportAccessContext();
  if (!ctx.consultant) {
    return { projectsByCustomerId: {}, tasksByCacheKey: {}, workIssuesByCustomerId: {} };
  }

  const uniqueCustomers = [
    ...new Set(customerIds.filter((id) => id && ctx.allowedCustomerIds.has(id))),
  ];

  const projectsByCustomerId: Record<string, ProjectOption[]> = {};
  for (const cid of uniqueCustomers) {
    projectsByCustomerId[cid] = [];
  }

  if (uniqueCustomers.length > 0) {
    const projects = await getProjectsByCustomerIds(uniqueCustomers);
    for (const cid of uniqueCustomers) {
      const active = projects.filter((p) => p.customer_id === cid && p.is_active);
      const filtered = isExternalConsultant(ctx.consultant)
        ? active.filter((p) => ctx.bookedProjectIds.has(p.id))
        : active;
      projectsByCustomerId[cid] = filtered.map((p) => ({
        value: p.id,
        label: p.name,
      }));
    }
  }

  const pairSeen = new Set<string>();
  const uniquePairs: Array<{ customerId: string; projectId: string }> = [];
  for (const pair of taskOptionPairs) {
    if (!pair.customerId || !ctx.allowedCustomerIds.has(pair.customerId)) continue;
    if (
      isExternalConsultant(ctx.consultant) &&
      pair.projectId &&
      !ctx.bookedProjectIds.has(pair.projectId)
    ) {
      continue;
    }
    const normProjectId = pair.projectId || "";
    const k = `${pair.customerId}|${normProjectId}`;
    if (pairSeen.has(k)) continue;
    pairSeen.add(k);
    uniquePairs.push({ customerId: pair.customerId, projectId: normProjectId });
  }

  const taskEntries = await Promise.all(
    uniquePairs.map(async ({ customerId, projectId }) => {
      const key = timeReportTaskCacheKeyServer(customerId, projectId);
      const items = await getBillingItemsForCustomerAndProject(
        customerId,
        projectId || null
      );
      return [key, items.map((r) => ({ value: r.id, label: r.name }))] as const;
    })
  );

  const tasksByCacheKey: Record<string, TaskOption[]> = {};
  for (const [key, options] of taskEntries) {
    tasksByCacheKey[key] = options;
  }

  const appUserId = ctx.appUser?.id ?? "";
  const extraOptions = await fetchWorkIssueTimeOptionsByIds(extraWorkIssueIds);
  const workIssueLists = await Promise.all(
    uniqueCustomers.map(async (customerId) => {
      const options = await fetchWorkIssueTimeOptionsForCustomer(customerId, appUserId);
      const seen = new Set(options.map((option) => option.value));
      const merged = [...options];
      for (const option of extraOptions) {
        if (option.customerId !== customerId || seen.has(option.value)) continue;
        seen.add(option.value);
        merged.push(option);
      }
      return [customerId, merged] as const;
    })
  );
  const workIssuesByCustomerId: Record<string, WorkIssueTimeOption[]> = {};
  for (const [customerId, options] of workIssueLists) {
    workIssuesByCustomerId[customerId] = options;
  }

  return { projectsByCustomerId, tasksByCacheKey, workIssuesByCustomerId };
}

export async function getWorkIssueOptionsForCustomer(
  customerId: string,
  extraIssueIds: string[] = []
): Promise<WorkIssueTimeOption[]> {
  if (!customerId) return [];
  const ctx = await getTimeReportAccessContext();
  if (!ctx.consultant || !ctx.appUser?.id) return [];
  if (!ctx.allowedCustomerIds.has(customerId)) return [];
  const [memberOptions, extraOptions] = await Promise.all([
    fetchWorkIssueTimeOptionsForCustomer(customerId, ctx.appUser.id),
    fetchWorkIssueTimeOptionsByIds(extraIssueIds),
  ]);
  const seen = new Set(memberOptions.map((option) => option.value));
  const merged = [...memberOptions];
  for (const option of extraOptions) {
    if (option.customerId && option.customerId !== customerId) continue;
    if (seen.has(option.value)) continue;
    seen.add(option.value);
    merged.push(option);
  }
  return merged;
}

export async function getHolidayDatesForWeek(
  calendarId: string | null,
  year: number,
  week: number
): Promise<string[]> {
  if (!calendarId) return [];
  const { start, end } = getISOWeekDateRange(year, week);
  const holidays = await getCalendarHolidays(calendarId);
  return holidays
    .filter((h) => h.holiday_date >= start && h.holiday_date <= end)
    .map((h) => h.holiday_date);
}

/** Inclusive YYYY-MM-DD range (calendar month or any span). */
export async function getHolidayDatesForRange(
  calendarId: string | null,
  start: string,
  end: string
): Promise<string[]> {
  if (!calendarId) return [];
  const holidays = await getCalendarHolidays(calendarId);
  return holidays
    .filter((h) => h.holiday_date >= start && h.holiday_date <= end)
    .map((h) => h.holiday_date);
}

type BillingSaveIdentity = {
  role_id: string | null;
  customer_rate_id: string | null;
  project_rate_id: string | null;
  role_name_snapshot: string | null;
  rate: number | null;
  currency: BillingCurrency;
};

function lineBillingKey(line: {
  role_id: string | null;
  customer_rate_id?: string | null;
  project_rate_id?: string | null;
}): string {
  if (line.project_rate_id) {
    return encodeBillingItemKey({ kind: "project_rate", id: line.project_rate_id });
  }
  if (line.customer_rate_id) {
    return encodeBillingItemKey({ kind: "customer_rate", id: line.customer_rate_id });
  }
  return line.role_id ?? "";
}

function resolveBillingSaveIdentity(
  billingKey: string,
  projectId: string,
  customerId: string,
  projectRates: ProjectRate[],
  customerRates: CustomerRate[],
  customerCurrency: BillingCurrency
): BillingSaveIdentity {
  const parsed = parseBillingItemKey(billingKey);
  const empty: BillingSaveIdentity = {
    role_id: null,
    customer_rate_id: null,
    project_rate_id: null,
    role_name_snapshot: null,
    rate: null,
    currency: customerCurrency,
  };
  if (!parsed) return empty;

  if (parsed.kind === "customer_rate") {
    const row = customerRates.find((r) => r.id === parsed.id);
    if (!row) return empty;
    return {
      role_id: null,
      customer_rate_id: row.id,
      project_rate_id: null,
      role_name_snapshot: row.display_name,
      rate: Number(row.rate_per_hour),
      currency: parseBillingCurrency(row.currency ?? customerCurrency),
    };
  }
  if (parsed.kind === "project_rate") {
    const row = projectRates.find((r) => r.id === parsed.id && r.project_id === projectId);
    if (!row) return empty;
    return {
      role_id: null,
      customer_rate_id: null,
      project_rate_id: row.id,
      role_name_snapshot: row.display_name,
      rate: Number(row.rate_per_hour),
      currency: parseBillingCurrency(row.currency ?? customerCurrency),
    };
  }

  const projectRate = projectRates.find(
    (r) => r.project_id === projectId && r.role_id === parsed.roleId
  );
  if (projectRate) {
    return {
      role_id: parsed.roleId,
      customer_rate_id: null,
      project_rate_id: null,
      role_name_snapshot: projectRate.display_name,
      rate: Number(projectRate.rate_per_hour),
      currency: parseBillingCurrency(projectRate.currency ?? customerCurrency),
    };
  }
  const customerRate = customerRates.find(
    (r) => r.customer_id === customerId && r.role_id === parsed.roleId
  );
  if (customerRate) {
    return {
      role_id: parsed.roleId,
      customer_rate_id: null,
      project_rate_id: null,
      role_name_snapshot: customerRate.display_name,
      rate: Number(customerRate.rate_per_hour),
      currency: parseBillingCurrency(customerRate.currency ?? customerCurrency),
    };
  }
  return {
    ...empty,
    role_id: parsed.roleId,
  };
}

async function getEffectiveRateSnapshot(
  projectId: string,
  customerId: string,
  billingKey: string
): Promise<BillingSaveIdentity> {
  const [projectRates, customerRates, customers, billingTypes] =
    await Promise.all([
      getProjectRates(projectId),
      getCustomerRates(customerId),
      getCustomersByIds([customerId]),
      getProjectBillingTypesByIds([projectId]),
    ]);
  const billingCurrency = parseBillingCurrency(customers[0]?.billing_currency);
  const identity = resolveBillingSaveIdentity(
    billingKey,
    projectId,
    customerId,
    projectRates,
    customerRates,
    billingCurrency
  );
  // Fixed-price: track hours/tasks but do not snapshot a billable hourly rate.
  if (billingTypes.get(projectId) === "fixed") {
    return { ...identity, rate: null };
  }
  return identity;
}

/**
 * Resolve a Role/rate that exists in Time Report dropdowns for the project.
 * `billingItemId` must be one of the project's billing item ids (role UUID or cr:/pr: key).
 */
async function resolveBillingForWorkIssueLog(
  projectId: string,
  customerId: string,
  billingItemId: string
): Promise<
  | { ok: true; billing: BillingSaveIdentity }
  | { ok: false; error: string }
> {
  const selectedId = billingItemId.trim();
  if (!selectedId) {
    return { ok: false, error: "Role is required." };
  }
  const items = await getBillingItemsForCustomerAndProject(customerId, projectId);
  if (items.length === 0) {
    return {
      ok: false,
      error:
        "No roles are configured for this project. Add a role or rate before logging time.",
    };
  }
  const selected = items.find((item) => item.id === selectedId);
  if (!selected) {
    return { ok: false, error: "Select a valid role." };
  }
  let billing = await getEffectiveRateSnapshot(
    projectId,
    customerId,
    selected.id
  );
  // Custom rates store identity on rate ids; plain roles must keep role_id for the UI.
  if (
    !billing.role_id &&
    !billing.customer_rate_id &&
    !billing.project_rate_id
  ) {
    const parsed = parseBillingItemKey(selected.id);
    if (parsed?.kind === "role") {
      billing = { ...billing, role_id: parsed.roleId };
    } else if (parsed?.kind === "customer_rate") {
      billing = { ...billing, customer_rate_id: parsed.id };
    } else if (parsed?.kind === "project_rate") {
      billing = { ...billing, project_rate_id: parsed.id };
    }
  }
  if (
    !billing.role_id &&
    !billing.customer_rate_id &&
    !billing.project_rate_id
  ) {
    return {
      ok: false,
      error:
        "Could not resolve a role for this project. Check project rates and try again.",
    };
  }
  return { ok: true, billing };
}

type TimeReportRowDb = {
  id: string;
  entry_line_id: string;
  customer_id: string;
  project_id: string;
  role_id: string | null;
  customer_rate_id: string | null;
  project_rate_id: string | null;
  role_name_snapshot: string | null;
  jira_devops_key: string | null;
  description: string | null;
  entry_date: string;
  hours: string | number;
  internal_comment: string | null;
  rate_snapshot: string | number | null;
  currency_snapshot: string | null;
  display_order: string | number | null;
};

type TimeReportLineDb = {
  id: string;
  consultant_id: string;
  iso_year: number;
  iso_week: number;
  customer_id: string;
  project_id: string | null;
  role_id: string | null;
  customer_rate_id: string | null;
  project_rate_id: string | null;
  jira_devops_key: string | null;
  description: string | null;
  display_order: string | number | null;
  work_issue_id: string | null;
};

async function getAppUserIdForAudit(): Promise<string | null> {
  const u = await getCurrentAppUser();
  if (!u?.email) return null;
  const { rows } = await cloudSqlPool.query<{ id: string }>(
    `SELECT id FROM app_users WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1`,
    [u.email]
  );
  return rows[0]?.id ?? null;
}

function snapshotRowDb(r: TimeReportRowDb): Record<string, unknown> {
  return {
    id: r.id,
    entry_line_id: r.entry_line_id,
    customer_id: r.customer_id,
    project_id: r.project_id,
    role_id: r.role_id,
    customer_rate_id: r.customer_rate_id,
    project_rate_id: r.project_rate_id,
    role_name_snapshot: r.role_name_snapshot,
    jira_devops_key: r.jira_devops_key,
    description: r.description,
    entry_date: r.entry_date,
    hours: Number(r.hours ?? 0),
    internal_comment: r.internal_comment,
    rate_snapshot: r.rate_snapshot != null ? Number(r.rate_snapshot) : null,
    currency_snapshot: r.currency_snapshot
      ? parseBillingCurrency(r.currency_snapshot)
      : null,
    display_order: Number(r.display_order ?? 0),
  };
}

type DesiredCell = {
  entry_line_id: string;
  consultant_id: string;
  customer_id: string;
  project_id: string;
  role_id: string | null;
  customer_rate_id: string | null;
  project_rate_id: string | null;
  role_name_snapshot: string | null;
  jira_devops_key: string | null;
  description: string | null;
  entry_date: string;
  hours: number;
  internal_comment: string | null;
  rate_snapshot: number | null;
  currency_snapshot: BillingCurrency | null;
  display_order: number;
};

function desiredCellSnapshot(d: DesiredCell, dbId?: string): Record<string, unknown> {
  return {
    id: dbId,
    entry_line_id: d.entry_line_id,
    customer_id: d.customer_id,
    project_id: d.project_id,
    role_id: d.role_id,
    customer_rate_id: d.customer_rate_id,
    project_rate_id: d.project_rate_id,
    role_name_snapshot: d.role_name_snapshot,
    jira_devops_key: d.jira_devops_key,
    description: d.description,
    entry_date: d.entry_date,
    hours: d.hours,
    internal_comment: d.internal_comment,
    rate_snapshot: d.rate_snapshot,
    currency_snapshot: d.currency_snapshot,
    display_order: d.display_order,
  };
}

function cellDiffers(db: TimeReportRowDb, d: DesiredCell): boolean {
  return (
    db.customer_id !== d.customer_id ||
    db.project_id !== d.project_id ||
    (db.role_id ?? null) !== (d.role_id ?? null) ||
    (db.customer_rate_id ?? null) !== (d.customer_rate_id ?? null) ||
    (db.project_rate_id ?? null) !== (d.project_rate_id ?? null) ||
    (db.role_name_snapshot ?? null) !== (d.role_name_snapshot ?? null) ||
    (db.jira_devops_key ?? "") !== (d.jira_devops_key ?? "") ||
    (db.description ?? "") !== (d.description ?? "") ||
    Number(db.hours ?? 0) !== d.hours ||
    (db.internal_comment ?? "") !== (d.internal_comment ?? "") ||
    Number(db.rate_snapshot ?? 0) !== Number(d.rate_snapshot ?? 0) ||
    (db.currency_snapshot ?? null) !== (d.currency_snapshot ?? null) ||
    Number(db.display_order ?? 0) !== d.display_order
  );
}

async function writeEntryHistory(
  client: PoolClient,
  args: {
    timeReportEntryId: string | null;
    entryLineId: string;
    consultantId: string;
    operation: "insert" | "update" | "delete";
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    sourceRevision: number;
    changedByAppUserId: string | null;
  }
) {
  await client.query(
    `INSERT INTO time_report_entries_history (
       time_report_entry_id, entry_line_id, consultant_id, operation,
       before_json, after_json, changed_by_app_user_id, source_revision
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8::bigint)`,
    [
      args.timeReportEntryId,
      args.entryLineId,
      args.consultantId,
      args.operation,
      args.before ? JSON.stringify(args.before) : null,
      args.after ? JSON.stringify(args.after) : null,
      args.changedByAppUserId,
      args.sourceRevision,
    ]
  );
}

export async function getTimeReportEntries(
  consultantId: string,
  year: number,
  week: number,
  /** Month calendar scope for aggregated month UI only — hides lines from neighbouring months that share this ISO week. */
  calendarMonthForLineFilter?: { year: number; month: number } | null
): Promise<TimeReportWeekData> {
  const consultant = await getConsultantForCurrentUser();
  if (!consultant || consultant.id !== consultantId) {
    return { groups: [], revision: 0 };
  }

  const weekDates = getISOWeekDateStrings(year, week);
  const filterActive = Boolean(calendarMonthForLineFilter);
  const bounds =
    calendarMonthForLineFilter != null
      ? calendarMonthDateBounds(calendarMonthForLineFilter.year, calendarMonthForLineFilter.month)
      : { start: "1970-01-01", end: "1970-01-01" };

  const [{ rows: revRows }, { rows: lineRows }, { rows: entryRows }] = await Promise.all([
    cloudSqlPool.query<{ revision: string | null }>(
      `SELECT revision::text FROM time_report_week_revisions
       WHERE consultant_id = $1 AND iso_year = $2 AND iso_week = $3`,
      [consultantId, year, week]
    ),
    cloudSqlPool.query<TimeReportLineDb>(
      `SELECT id, consultant_id, iso_year, iso_week, customer_id, project_id, role_id,
              customer_rate_id, project_rate_id,
              jira_devops_key, description, display_order, work_issue_id
       FROM time_report_entry_lines l
       WHERE consultant_id = $1 AND iso_year = $2 AND iso_week = $3
         AND (
           NOT $4::boolean
           OR EXISTS (
             SELECT 1 FROM time_report_entries e
             WHERE e.consultant_id = l.consultant_id
               AND e.entry_line_id = l.id
               AND e.entry_date >= $5::date
               AND e.entry_date <= $6::date
           )
           OR (
             NOT EXISTS (
               SELECT 1 FROM time_report_entries e
               WHERE e.consultant_id = l.consultant_id AND e.entry_line_id = l.id
             )
             AND l.created_at::date >= $5::date
             AND l.created_at::date <= $6::date
           )
         )
       ORDER BY display_order ASC NULLS LAST, id ASC`,
      [consultantId, year, week, filterActive, bounds.start, bounds.end]
    ),
    cloudSqlPool.query<TimeReportRowDb>(
      `SELECT id, entry_line_id, customer_id, project_id, role_id, customer_rate_id, project_rate_id,
              role_name_snapshot, jira_devops_key, description,
              entry_date::text AS entry_date, hours, internal_comment, rate_snapshot, currency_snapshot, display_order
       FROM time_report_entries
       WHERE consultant_id = $1 AND entry_date = ANY($2::date[])
       ORDER BY display_order ASC NULLS LAST, entry_date ASC`,
      [consultantId, weekDates]
    ),
  ]);

  const revision = Number(revRows[0]?.revision ?? 0);

  let filteredLines = lineRows;
  let filteredRows = entryRows;
  if (consultant.isExternal) {
    const internalCustomerId = await getInternalCustomerId();
    if (internalCustomerId) {
      filteredLines = filteredLines.filter((r) => r.customer_id !== internalCustomerId);
      filteredRows = filteredRows.filter((r) => r.customer_id !== internalCustomerId);
    }
  }

  const byLineId = new Map<string, TimeReportRowDb[]>();
  for (const r of filteredRows) {
    if (!byLineId.has(r.entry_line_id)) byLineId.set(r.entry_line_id, []);
    byLineId.get(r.entry_line_id)!.push(r);
  }

  const byCustomer = new Map<string, TimeReportEntry[]>();
  for (const line of filteredLines) {
    if (!byCustomer.has(line.customer_id)) {
      byCustomer.set(line.customer_id, []);
    }
    const dayRows = byLineId.get(line.id) ?? [];
    const hours: number[] = [0, 0, 0, 0, 0, 0, 0];
    const comments: Record<number, string> = {};
    for (const row of dayRows) {
      const dayIndex = weekDates.indexOf(row.entry_date);
      if (dayIndex >= 0) {
        hours[dayIndex] = Number(row.hours ?? 0);
        if (row.internal_comment) comments[dayIndex] = row.internal_comment;
      }
    }
    byCustomer.get(line.customer_id)!.push({
      id: line.id,
      displayOrder: Number(line.display_order ?? 0),
      projectId: line.project_id ?? "",
      roleId: lineBillingKey(line),
      jiraDevOpsValue:
        line.jira_devops_key?.trim() ||
        (line.work_issue_id ? `work:${line.work_issue_id}` : ""),
      task: line.description ?? "",
      hours,
      comments,
    });
  }

  const customerIds = [...byCustomer.keys()];
  if (customerIds.length > 0) {
    const { rows: nameRows } = await cloudSqlPool.query<{ id: string; name: string }>(
      `SELECT id::text AS id, name FROM customers WHERE id = ANY($1::uuid[])`,
      [customerIds]
    );
    const nameById = new Map(nameRows.map((r) => [r.id, r.name]));
    customerIds.sort((a, b) => {
      const cmp = (nameById.get(a) ?? "").localeCompare(nameById.get(b) ?? "", "sv", {
        sensitivity: "base",
      });
      if (cmp !== 0) return cmp;
      return a.localeCompare(b);
    });
  }

  const groups = customerIds.map((customerId) => ({
    customerId,
    entries: byCustomer.get(customerId)!,
  }));
  return { groups, revision };
}

import { loadTimeReportEntriesForWeeksSequential } from "./timeReportEntriesBatchLoad";

/**
 * Loads multiple ISO weeks in one server action (same payload per week as getTimeReportEntries).
 * Sequential DB work avoids parallel pool bursts; reduces client server-action count.
 */
export async function getTimeReportEntriesForWeeks(
  consultantId: string,
  weeks: { year: number; week: number }[],
  calendarMonthForLineFilter?: { year: number; month: number } | null
): Promise<TimeReportWeekData[]> {
  return loadTimeReportEntriesForWeeksSequential(
    getTimeReportEntries,
    consultantId,
    weeks,
    calendarMonthForLineFilter
  );
}

export async function getTimeReportMonthTotalHours(
  consultantId: string,
  year: number,
  month: number
): Promise<number> {
  const consultant = await getConsultantForCurrentUser();
  if (!consultant || consultant.id !== consultantId) return 0;

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = new Date(year, month, 0);
  const monthEndStr = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, "0")}-${String(
    monthEnd.getDate()
  ).padStart(2, "0")}`;

  const internalCustomerId = consultant.isExternal
    ? await getInternalCustomerId()
    : null;

  const { rows } = await cloudSqlPool.query<{ total_hours: string | number | null }>(
    internalCustomerId
      ? `SELECT COALESCE(SUM(hours), 0) AS total_hours
         FROM time_report_entries
         WHERE consultant_id = $1
           AND entry_date >= $2::date
           AND entry_date <= $3::date
           AND customer_id <> $4::uuid`
      : `SELECT COALESCE(SUM(hours), 0) AS total_hours
         FROM time_report_entries
         WHERE consultant_id = $1
           AND entry_date >= $2::date
           AND entry_date <= $3::date`,
    internalCustomerId
      ? [consultantId, monthStart, monthEndStr, internalCustomerId]
      : [consultantId, monthStart, monthEndStr]
  );

  return Number(rows[0]?.total_hours ?? 0);
}

export async function saveTimeReportEntries(
  consultantId: string,
  year: number,
  week: number,
  customerGroups: TimeReportCustomerGroup[],
  expectedRevision: number,
  calendarMonthScope?: SaveTimeReportCalendarMonthScope | null,
  deletedLineIds?: string[]
): Promise<SaveTimeReportEntriesResult> {
  const ctx = await getTimeReportAccessContext();
  const consultant = ctx.consultant;
  if (!consultant || consultant.id !== consultantId) {
    return { success: false, error: "Unauthorized" };
  }

  const isExternal = isExternalConsultant(ctx.consultant);
  const weekDates = getISOWeekDateStrings(year, week);
  const scopeBounds = calendarMonthScope
    ? calendarMonthDateBounds(calendarMonthScope.year, calendarMonthScope.month)
    : null;

  const desired: DesiredCell[] = [];
  const desiredLines: Array<{
    id: string;
    consultant_id: string;
    iso_year: number;
    iso_week: number;
    customer_id: string;
    project_id: string | null;
    role_id: string | null;
    customer_rate_id: string | null;
    project_rate_id: string | null;
    jira_devops_key: string | null;
    description: string | null;
    work_issue_id: string | null;
    display_order: number;
  }> = [];
  const explicitDeletedLineIds = new Set(
    (deletedLineIds ?? []).map((v) => v.trim()).filter((v) => v !== "")
  );

  const projectIds = new Set<string>();
  const customerIds = new Set<string>();
  for (const group of customerGroups) {
    if (!ctx.allowedCustomerIds.has(group.customerId)) {
      return { success: false, error: "Unauthorized customer." };
    }
    customerIds.add(group.customerId);
    for (const entry of group.entries) {
      if (isExternal && entry.projectId && !ctx.bookedProjectIds.has(entry.projectId)) {
        return { success: false, error: "Unauthorized project." };
      }
      if (entry.projectId) projectIds.add(entry.projectId);
    }
  }
  const [allProjectRates, allCustomerRates, customers, projectBillingTypes] =
    await Promise.all([
      getProjectRatesByProjectIds(Array.from(projectIds), {
        includeInactive: true,
      }),
      getCustomerRatesByCustomerIds(Array.from(customerIds), {
        includeInactive: true,
      }),
      getCustomersByIds(Array.from(customerIds)),
      getProjectBillingTypesByIds(Array.from(projectIds)),
    ]);

  const customerCurrencyMap = new Map<string, BillingCurrency>();
  for (const c of customers) {
    customerCurrencyMap.set(c.id, parseBillingCurrency(c.billing_currency));
  }

  for (let cgIndex = 0; cgIndex < customerGroups.length; cgIndex++) {
    const group = customerGroups[cgIndex];
    for (let eIndex = 0; eIndex < group.entries.length; eIndex++) {
      const entry = group.entries[eIndex]!;
      const hasContent =
        (entry.hours?.some((h) => (h ?? 0) > 0) ?? false) ||
        Object.values(entry.comments ?? {}).some((c) => (c ?? "").trim() !== "");
      if (hasContent && (!entry.projectId || !entry.roleId)) {
        return {
          success: false,
          error: "Project and Role are required for all rows with hours or comments.",
        };
      }
      const displayOrder = cgIndex * 1000 + eIndex;
      const entryLineId = (entry.id && entry.id.trim() !== "" ? entry.id : randomUUID()) as string;
      let billing = entry.projectId && entry.roleId
        ? resolveBillingSaveIdentity(
            entry.roleId,
            entry.projectId,
            group.customerId,
            allProjectRates,
            allCustomerRates,
            customerCurrencyMap.get(group.customerId) ?? "SEK"
          )
        : {
            role_id: null,
            customer_rate_id: null,
            project_rate_id: null,
            role_name_snapshot: null,
            rate: null,
            currency: customerCurrencyMap.get(group.customerId) ?? "SEK",
          };
      if (entry.projectId && projectBillingTypes.get(entry.projectId) === "fixed") {
        billing = { ...billing, rate: null };
      }
      desiredLines.push({
        id: entryLineId,
        consultant_id: consultantId,
        iso_year: year,
        iso_week: week,
        customer_id: group.customerId,
        project_id: entry.projectId || null,
        role_id: billing.role_id,
        customer_rate_id: billing.customer_rate_id,
        project_rate_id: billing.project_rate_id,
        jira_devops_key: entry.jiraDevOpsValue || null,
        description: (entry.task ?? "").trim() || null,
        work_issue_id: workIssueIdFromLinkKey(entry.jiraDevOpsValue),
        display_order: displayOrder,
      });

      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const entryDate = weekDates[dayIndex]!;
        if (
          scopeBounds &&
          !dateStrInInclusiveBounds(entryDate, scopeBounds.start, scopeBounds.end)
        ) {
          continue;
        }
        const hours = entry.hours[dayIndex] ?? 0;
        const comment = entry.comments[dayIndex]?.trim() ?? "";
        if (hours > 0 && entry.projectId && entry.roleId) {
          desired.push({
            entry_line_id: entryLineId,
            consultant_id: consultantId,
            customer_id: group.customerId,
            project_id: entry.projectId,
            role_id: billing.role_id,
            customer_rate_id: billing.customer_rate_id,
            project_rate_id: billing.project_rate_id,
            role_name_snapshot: billing.role_name_snapshot,
            jira_devops_key: entry.jiraDevOpsValue || null,
            description: (entry.task ?? "").trim() || null,
            entry_date: entryDate,
            hours,
            internal_comment: comment || null,
            rate_snapshot: billing.rate,
            currency_snapshot: billing.rate != null ? billing.currency : null,
            display_order: displayOrder,
          });
        }
      }
    }
  }

  const workIssueIdsByCustomer = new Map<string, string[]>();
  for (const line of desiredLines) {
    if (!line.work_issue_id) continue;
    const list = workIssueIdsByCustomer.get(line.customer_id) ?? [];
    list.push(line.work_issue_id);
    workIssueIdsByCustomer.set(line.customer_id, list);
  }
  for (const [customerId, issueIds] of workIssueIdsByCustomer) {
    const allowed = await workIssueIdsForCustomer(issueIds, customerId);
    if (issueIds.some((id) => !allowed.has(id))) {
      return {
        success: false,
        error: "Work issue must belong to the same customer as the time report row.",
      };
    }
  }

  // Never let one request contain conflicting definitions for the same line id.
  // This otherwise causes non-deterministic "last write wins" behavior.
  const lineShapeById = new Map<string, string>();
  for (const line of desiredLines) {
    if (explicitDeletedLineIds.has(line.id)) continue;
    const shape = [
      line.customer_id,
      line.project_id ?? "",
      line.role_id ?? "",
      line.customer_rate_id ?? "",
      line.project_rate_id ?? "",
      line.jira_devops_key ?? "",
      line.description ?? "",
      line.work_issue_id ?? "",
      String(line.display_order),
    ].join("|");
    const prev = lineShapeById.get(line.id);
    if (prev && prev !== shape) {
      return { success: false, error: "Ambiguous line identity in save payload." };
    }
    lineShapeById.set(line.id, shape);
  }

  try {
    const appUserId = await getAppUserIdForAudit();
    return await withCloudSqlTransaction<SaveTimeReportEntriesResult>(
      `time-report save ${year}-W${week}`,
      async (client, rollback) => {
    await client.query(
      `INSERT INTO time_report_week_revisions (consultant_id, iso_year, iso_week, revision)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (consultant_id, iso_year, iso_week) DO NOTHING`,
      [consultantId, year, week]
    );

    const { rows: revLock } = await client.query<{ revision: string }>(
      `SELECT revision::text FROM time_report_week_revisions
       WHERE consultant_id = $1 AND iso_year = $2 AND iso_week = $3
       FOR UPDATE`,
      [consultantId, year, week]
    );
    const currentRev = Number(revLock[0]?.revision ?? 0);
    if (currentRev !== expectedRevision) {
      return rollback({
        success: false,
        error: "Tidrapporten har uppdaterats någon annanstans. Ladda om innan du sparar igen.",
        code: "revision_conflict",
        currentRevision: currentRev,
      });
    }

    const newRevision = currentRev + 1;

    const { rows: existingLines } = await client.query<TimeReportLineDb>(
      `SELECT id, consultant_id, iso_year, iso_week, customer_id, project_id, role_id,
              customer_rate_id, project_rate_id,
              jira_devops_key, description, display_order, work_issue_id
       FROM time_report_entry_lines
       WHERE consultant_id = $1 AND iso_year = $2 AND iso_week = $3
       FOR UPDATE`,
      [consultantId, year, week]
    );

    const existingLineById = new Map<string, TimeReportLineDb>();
    for (const l of existingLines) existingLineById.set(l.id, l);
    const desiredLineById = new Map<string, (typeof desiredLines)[number]>();
    for (const l of desiredLines) {
      if (explicitDeletedLineIds.has(l.id)) continue;
      desiredLineById.set(l.id, l);
    }

    for (const lineId of explicitDeletedLineIds) {
      if (!existingLineById.has(lineId)) continue;
      // Delete only within the visible scope:
      // - week view: only this ISO week's cells + header
      // - month view: only this calendar month's cells in this ISO week,
      //   then drop header only when no week cells remain.
      if (scopeBounds) {
        await client.query(
          `DELETE FROM time_report_entries
           WHERE consultant_id = $1
             AND entry_line_id = $2
             AND entry_date = ANY($3::date[])
             AND entry_date >= $4::date
             AND entry_date <= $5::date`,
          [consultantId, lineId, weekDates, scopeBounds.start, scopeBounds.end]
        );
        const { rows: rem } = await client.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c
           FROM time_report_entries
           WHERE consultant_id = $1
             AND entry_line_id = $2
             AND entry_date = ANY($3::date[])`,
          [consultantId, lineId, weekDates]
        );
        const remainingInWeek = Number(rem[0]?.c ?? 0);
        if (remainingInWeek === 0) {
          await client.query(
            `DELETE FROM time_report_entry_lines
             WHERE consultant_id = $1 AND iso_year = $2 AND iso_week = $3 AND id = $4`,
            [consultantId, year, week, lineId]
          );
        }
      } else {
        await client.query(
          `DELETE FROM time_report_entries
           WHERE consultant_id = $1
             AND entry_line_id = $2
             AND entry_date = ANY($3::date[])`,
          [consultantId, lineId, weekDates]
        );
        await client.query(
          `DELETE FROM time_report_entry_lines
           WHERE consultant_id = $1 AND iso_year = $2 AND iso_week = $3 AND id = $4`,
          [consultantId, year, week, lineId]
        );
      }
    }

    for (const [lineId, de] of desiredLineById) {
      const ex = existingLineById.get(lineId);
      if (!ex) {
        const monthAnchorDate =
          calendarMonthScope != null
            ? `${calendarMonthScope.year}-${String(calendarMonthScope.month).padStart(2, "0")}-01`
            : null;
        await client.query(
          `INSERT INTO time_report_entry_lines (
             id, consultant_id, iso_year, iso_week, customer_id, project_id, role_id,
             customer_rate_id, project_rate_id,
             jira_devops_key, description, work_issue_id, display_order, created_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, COALESCE($14::date, now()), COALESCE($14::date, now()))`,
          [
            de.id,
            de.consultant_id,
            de.iso_year,
            de.iso_week,
            de.customer_id,
            de.project_id,
            de.role_id,
            de.customer_rate_id,
            de.project_rate_id,
            de.jira_devops_key,
            de.description,
            de.work_issue_id,
            de.display_order,
            monthAnchorDate,
          ]
        );
      } else {
        await client.query(
          `UPDATE time_report_entry_lines SET
             customer_id = $3,
             project_id = $4,
             role_id = $5,
             customer_rate_id = $6,
             project_rate_id = $7,
             jira_devops_key = $8,
             description = $9,
             work_issue_id = $10,
             display_order = $11
           WHERE consultant_id = $1 AND iso_year = $12 AND iso_week = $13 AND id = $2`,
          [
            consultantId,
            lineId,
            de.customer_id,
            de.project_id,
            de.role_id,
            de.customer_rate_id,
            de.project_rate_id,
            de.jira_devops_key,
            de.description,
            de.work_issue_id,
            de.display_order,
            year,
            week,
          ]
        );
      }
    }

    const lineIds = Array.from(desiredLineById.keys());
    const { rows: existingRows } = await client.query<TimeReportRowDb>(
      `SELECT id, entry_line_id, customer_id, project_id, role_id, customer_rate_id, project_rate_id,
              role_name_snapshot, jira_devops_key, description,
              entry_date::text AS entry_date, hours, internal_comment, rate_snapshot, currency_snapshot, display_order
       FROM time_report_entries
       WHERE consultant_id = $1
         AND entry_line_id = ANY($2::uuid[])
         AND entry_date = ANY($3::date[])
       FOR UPDATE`,
      [consultantId, lineIds.length > 0 ? lineIds : [randomUUID()], weekDates]
    );

    const existingByKey = new Map<string, TimeReportRowDb>();
    for (const r of existingRows) {
      existingByKey.set(`${r.entry_line_id}|${r.entry_date}`, r);
    }

    const desiredByKey = new Map<string, DesiredCell>();
    for (const d of desired) {
      if (explicitDeletedLineIds.has(d.entry_line_id)) continue;
      desiredByKey.set(`${d.entry_line_id}|${d.entry_date}`, d);
    }

    for (const [key, ex] of existingByKey) {
      if (!desiredByKey.has(key)) {
        if (
          scopeBounds &&
          !dateStrInInclusiveBounds(ex.entry_date, scopeBounds.start, scopeBounds.end)
        ) {
          continue;
        }
        await writeEntryHistory(client, {
          timeReportEntryId: ex.id,
          entryLineId: ex.entry_line_id,
          consultantId,
          operation: "delete",
          before: snapshotRowDb(ex),
          after: null,
          sourceRevision: newRevision,
          changedByAppUserId: appUserId,
        });
        await client.query(`DELETE FROM time_report_entries WHERE id = $1`, [ex.id]);
      }
    }

    for (const [key, de] of desiredByKey) {
      const ex = existingByKey.get(key);
      if (!ex) {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO time_report_entries (
             consultant_id, customer_id, project_id, role_id, customer_rate_id, project_rate_id,
             role_name_snapshot, jira_devops_key,
             description, entry_date, hours, pm_edited_hours, internal_comment, rate_snapshot, currency_snapshot, display_order,
             entry_line_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11,$11,$12,$13,$14,$15,$16)
           RETURNING id`,
          [
            de.consultant_id,
            de.customer_id,
            de.project_id,
            de.role_id,
            de.customer_rate_id,
            de.project_rate_id,
            de.role_name_snapshot,
            de.jira_devops_key,
            de.description,
            de.entry_date,
            de.hours,
            de.internal_comment,
            de.rate_snapshot,
            de.currency_snapshot,
            de.display_order,
            de.entry_line_id,
          ]
        );
        const newId = ins.rows[0]?.id;
        await writeEntryHistory(client, {
          timeReportEntryId: newId ?? null,
          entryLineId: de.entry_line_id,
          consultantId,
          operation: "insert",
          before: null,
          after: desiredCellSnapshot(de, newId),
          sourceRevision: newRevision,
          changedByAppUserId: appUserId,
        });
      } else if (cellDiffers(ex, de)) {
        await client.query(
          `UPDATE time_report_entries SET
             customer_id = $2,
             project_id = $3,
             role_id = $4,
             customer_rate_id = $5,
             project_rate_id = $6,
             role_name_snapshot = $7,
             jira_devops_key = $8,
             description = $9,
             hours = $10,
             pm_edited_hours = $10,
             internal_comment = $11,
             rate_snapshot = $12,
             currency_snapshot = $13,
             display_order = $14,
             entry_line_id = $15
           WHERE id = $1`,
          [
            ex.id,
            de.customer_id,
            de.project_id,
            de.role_id,
            de.customer_rate_id,
            de.project_rate_id,
            de.role_name_snapshot,
            de.jira_devops_key,
            de.description,
            de.hours,
            de.internal_comment,
            de.rate_snapshot,
            de.currency_snapshot,
            de.display_order,
            de.entry_line_id,
          ]
        );
        await writeEntryHistory(client, {
          timeReportEntryId: ex.id,
          entryLineId: de.entry_line_id,
          consultantId,
          operation: "update",
          before: snapshotRowDb(ex),
          after: desiredCellSnapshot(de, ex.id),
          sourceRevision: newRevision,
          changedByAppUserId: appUserId,
        });
      }
    }

    await client.query(
      `UPDATE time_report_week_revisions
       SET revision = $1::bigint,
           updated_at = now(),
           updated_by_app_user_id = $2
       WHERE consultant_id = $3 AND iso_year = $4 AND iso_week = $5`,
      [newRevision, appUserId, consultantId, year, week]
    );

    return { success: true, revision: newRevision };
      }
    );
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Save failed" };
  }
}

/** Schema requires hours > 0; use a minimal positive value when copying comment-only days. */
const COMMENT_ONLY_PLACEHOLDER_HOURS = 0.01;

function weekRevisionMapKey(year: number, week: number): string {
  return `${year}-W${week}`;
}

function copyEntryPayloadBusinessError(entry: TimeReportEntryCopyPayload): string | null {
  const copyHours = entry.copyHours !== false;
  if (copyHours && !(entry.projectId && entry.roleId)) {
    return "Project and Role are required.";
  }
  return null;
}

async function buildDesiredCellsForCopy(
  consultantId: string,
  customerId: string,
  targetYear: number,
  targetWeek: number,
  entry: TimeReportEntryCopyPayload,
  entryLineId: string
): Promise<{ toInsert: DesiredCell[]; error: string | null }> {
  const copyHours = entry.copyHours !== false;
  const weekDates = getISOWeekDateStrings(targetYear, targetWeek);
  const billing =
    entry.projectId && entry.roleId
      ? await getEffectiveRateSnapshot(entry.projectId, customerId, entry.roleId)
      : {
          role_id: null,
          customer_rate_id: null,
          project_rate_id: null,
          role_name_snapshot: null,
          rate: null,
          currency: "SEK" as BillingCurrency,
        };

  const toInsert: DesiredCell[] = [];
  const displayOrderPlaceholder = 0;

  if (copyHours && entry.projectId && entry.roleId) {
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const rawHours = entry.hours[dayIndex] ?? 0;
      const comment = (entry.comments[dayIndex]?.trim() ?? "") || "";
      const hoursNum = Number(rawHours);
      if (hoursNum > 0) {
        toInsert.push({
          entry_line_id: entryLineId,
          consultant_id: consultantId,
          customer_id: customerId,
          project_id: entry.projectId,
          role_id: billing.role_id,
          customer_rate_id: billing.customer_rate_id,
          project_rate_id: billing.project_rate_id,
          role_name_snapshot: billing.role_name_snapshot,
          jira_devops_key: entry.jiraDevOpsValue || null,
          description: (entry.task ?? "").trim() || null,
          entry_date: weekDates[dayIndex]!,
          hours: hoursNum,
          internal_comment: comment || null,
          rate_snapshot: billing.rate,
          currency_snapshot: billing.rate != null ? billing.currency : null,
          display_order: displayOrderPlaceholder,
        });
      } else if (comment) {
        toInsert.push({
          entry_line_id: entryLineId,
          consultant_id: consultantId,
          customer_id: customerId,
          project_id: entry.projectId,
          role_id: billing.role_id,
          customer_rate_id: billing.customer_rate_id,
          project_rate_id: billing.project_rate_id,
          role_name_snapshot: billing.role_name_snapshot,
          jira_devops_key: entry.jiraDevOpsValue || null,
          description: (entry.task ?? "").trim() || null,
          entry_date: weekDates[dayIndex]!,
          hours: COMMENT_ONLY_PLACEHOLDER_HOURS,
          internal_comment: comment,
          rate_snapshot: billing.rate,
          currency_snapshot: billing.rate != null ? billing.currency : null,
          display_order: displayOrderPlaceholder,
        });
      }
    }
  }

  /* Rows-only copies create `time_report_entry_lines` without day rows (no placeholder hours).
   * `rowOnlyAnchorDate` on the payload is only used for stub header timestamps (see copyEntryToWeekCore). */

  if (copyHours && toInsert.length === 0) {
    return { toInsert: [], error: "Entry has no hours or comments to copy." };
  }

  return { toInsert, error: null };
}

/** Assumes `BEGIN` is active; does not commit or roll back. */
async function copyEntryToWeekCore(
  client: PoolClient,
  consultantId: string,
  appUserId: string | null,
  customerId: string,
  targetYear: number,
  targetWeek: number,
  entry: TimeReportEntryCopyPayload,
  expectedRevision: number,
  entryLineId: string,
  toInsert: DesiredCell[]
): Promise<CopyEntryToWeekResult> {
  const copyHours = entry.copyHours !== false;

  let displayOrderForLine: number;
  if (entry.lineDisplayOrder != null && Number.isFinite(Number(entry.lineDisplayOrder))) {
    displayOrderForLine = Math.trunc(Number(entry.lineDisplayOrder));
  } else {
    const { rows: ordRows } = await client.query<{ display_order: string | number | null }>(
      `SELECT display_order
       FROM time_report_entry_lines
       WHERE consultant_id = $1 AND iso_year = $2 AND iso_week = $3`,
      [consultantId, targetYear, targetWeek]
    );
    const maxOrder =
      ordRows.length && ordRows.every((r) => r.display_order != null)
        ? Math.max(...ordRows.map((r) => Number(r.display_order)))
        : 0;
    displayOrderForLine = maxOrder + 1000;
  }
  for (const r of toInsert) {
    r.display_order = displayOrderForLine;
  }

  await client.query(
    `INSERT INTO time_report_week_revisions (consultant_id, iso_year, iso_week, revision)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (consultant_id, iso_year, iso_week) DO NOTHING`,
    [consultantId, targetYear, targetWeek]
  );

  const { rows: revLock } = await client.query<{ revision: string }>(
    `SELECT revision::text FROM time_report_week_revisions
     WHERE consultant_id = $1 AND iso_year = $2 AND iso_week = $3
     FOR UPDATE`,
    [consultantId, targetYear, targetWeek]
  );
  const currentRev = Number(revLock[0]?.revision ?? 0);
  if (currentRev !== expectedRevision) {
    return {
      success: false,
      error: "Tidrapporten har uppdaterats någon annanstans. Ladda om innan du kopierar igen.",
      code: "revision_conflict",
      currentRevision: currentRev,
    };
  }

  const newRevision = currentRev + 1;
  const rowOnlyLineCreatedAt = !copyHours ? (entry.rowOnlyAnchorDate ?? null) : null;

  const copyBilling =
    entry.projectId && entry.roleId
      ? await getEffectiveRateSnapshot(entry.projectId, customerId, entry.roleId)
      : {
          role_id: null as string | null,
          customer_rate_id: null as string | null,
          project_rate_id: null as string | null,
        };

  await client.query(
    `INSERT INTO time_report_entry_lines (
       id, consultant_id, iso_year, iso_week, customer_id, project_id, role_id,
       customer_rate_id, project_rate_id,
       jira_devops_key, description, work_issue_id, display_order, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, COALESCE($14::date, now()), COALESCE($14::date, now()))`,
    [
      entryLineId,
      consultantId,
      targetYear,
      targetWeek,
      customerId,
      entry.projectId || null,
      copyBilling.role_id,
      copyBilling.customer_rate_id,
      copyBilling.project_rate_id,
      entry.jiraDevOpsValue || null,
      (entry.task ?? "").trim() || null,
      workIssueIdFromLinkKey(entry.jiraDevOpsValue),
      displayOrderForLine,
      rowOnlyLineCreatedAt,
    ]
  );

  for (const de of toInsert) {
    const ins = await client.query<{ id: string }>(
      `INSERT INTO time_report_entries (
         consultant_id, customer_id, project_id, role_id, customer_rate_id, project_rate_id,
         role_name_snapshot, jira_devops_key,
         description, entry_date, hours, pm_edited_hours, internal_comment, rate_snapshot, currency_snapshot, display_order,
         entry_line_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11,$11,$12,$13,$14,$15,$16)
       RETURNING id`,
      [
        de.consultant_id,
        de.customer_id,
        de.project_id,
        de.role_id,
        de.customer_rate_id,
        de.project_rate_id,
        de.role_name_snapshot,
        de.jira_devops_key,
        de.description,
        de.entry_date,
        de.hours,
        de.internal_comment,
        de.rate_snapshot,
        de.currency_snapshot,
        de.display_order,
        de.entry_line_id,
      ]
    );
    const newId = ins.rows[0]?.id;
    await writeEntryHistory(client, {
      timeReportEntryId: newId ?? null,
      entryLineId: de.entry_line_id,
      consultantId,
      operation: "insert",
      before: null,
      after: desiredCellSnapshot(de, newId),
      sourceRevision: newRevision,
      changedByAppUserId: appUserId,
    });
  }

  await client.query(
    `UPDATE time_report_week_revisions
     SET revision = $1::bigint,
         updated_at = now(),
         updated_by_app_user_id = $2
     WHERE consultant_id = $3 AND iso_year = $4 AND iso_week = $5`,
    [newRevision, appUserId, consultantId, targetYear, targetWeek]
  );

  return { success: true, revision: newRevision };
}

export async function copyEntryToWeek(
  consultantId: string,
  targetYear: number,
  targetWeek: number,
  customerId: string,
  entry: TimeReportEntryCopyPayload,
  expectedRevision: number
): Promise<CopyEntryToWeekResult> {
  const ctx = await getTimeReportAccessContext();
  const consultant = ctx.consultant;
  if (!consultant || consultant.id !== consultantId) {
    return { success: false, error: "Unauthorized" };
  }
  if (!ctx.allowedCustomerIds.has(customerId)) {
    return { success: false, error: "Unauthorized customer." };
  }
  if (
    isExternalConsultant(ctx.consultant) &&
    entry.projectId &&
    !ctx.bookedProjectIds.has(entry.projectId)
  ) {
    return { success: false, error: "Unauthorized project." };
  }
  const businessErr = copyEntryPayloadBusinessError(entry);
  if (businessErr) return { success: false, error: businessErr };
  const copyWorkIssueId = workIssueIdFromLinkKey(entry.jiraDevOpsValue);
  if (copyWorkIssueId) {
    const allowed = await workIssueIdsForCustomer([copyWorkIssueId], customerId);
    if (!allowed.has(copyWorkIssueId)) {
      return {
        success: false,
        error: "Work issue must belong to the same customer as the time report row.",
      };
    }
  }

  const entryLineId = entry.lineId?.trim() ? entry.lineId.trim() : randomUUID();
  const built = await buildDesiredCellsForCopy(
    consultantId,
    customerId,
    targetYear,
    targetWeek,
    entry,
    entryLineId
  );
  if (built.error) return { success: false, error: built.error };

  try {
    const appUserId = await getAppUserIdForAudit();
    return await withCloudSqlTransaction<CopyEntryToWeekResult>(
      `time-report copy ${targetYear}-W${targetWeek}`,
      async (client, rollback) => {
        const result = await copyEntryToWeekCore(
          client,
          consultantId,
          appUserId,
          customerId,
          targetYear,
          targetWeek,
          entry,
          expectedRevision,
          entryLineId,
          built.toInsert
        );
        if (!result.success) return rollback(result);
        return result;
      }
    );
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Insert failed" };
  }
}

export async function copyTimeReportEntriesBatch(
  consultantId: string,
  operations: TimeReportCopyBatchOperation[],
  initialWeekRevisions: Record<string, number>
): Promise<CopyTimeReportEntriesBatchResult> {
  const ctx = await getTimeReportAccessContext();
  const consultant = ctx.consultant;
  if (!consultant || consultant.id !== consultantId) {
    return { success: false, error: "Unauthorized" };
  }

  const indexed = operations.map((op, i) => ({ op, i }));
  indexed.sort((a, b) => {
    if (a.op.targetYear !== b.op.targetYear) return a.op.targetYear - b.op.targetYear;
    if (a.op.targetWeek !== b.op.targetWeek) return a.op.targetWeek - b.op.targetWeek;
    return a.i - b.i;
  });

  for (const { op } of indexed) {
    if (!ctx.allowedCustomerIds.has(op.customerId)) {
      return { success: false, error: "Unauthorized customer." };
    }
    if (
      isExternalConsultant(ctx.consultant) &&
      op.entry.projectId &&
      !ctx.bookedProjectIds.has(op.entry.projectId)
    ) {
      return { success: false, error: "Unauthorized project." };
    }
    const be = copyEntryPayloadBusinessError(op.entry);
    if (be) return { success: false, error: be };
    const copyWorkIssueId = workIssueIdFromLinkKey(op.entry.jiraDevOpsValue);
    if (copyWorkIssueId) {
      const allowed = await workIssueIdsForCustomer([copyWorkIssueId], op.customerId);
      if (!allowed.has(copyWorkIssueId)) {
        return {
          success: false,
          error: "Work issue must belong to the same customer as the time report row.",
        };
      }
    }
  }

  const revMap = new Map<string, number>();
  for (const [k, v] of Object.entries(initialWeekRevisions)) {
    revMap.set(k, Number(v));
  }

  try {
    return await withCloudSqlTransaction<CopyTimeReportEntriesBatchResult>(
      "time-report copy batch",
      async (client, rollback) => {
        const appUserId = await getAppUserIdForAudit();

    for (const { op } of indexed) {
      const key = weekRevisionMapKey(op.targetYear, op.targetWeek);
      const expected = revMap.get(key);
      if (expected === undefined) {
        return rollback({
          success: false,
          error: `Saknar revision för vecka ${key}. Ladda om och försök igen.`,
        });
      }

      const entryLineId = op.entry.lineId?.trim() ? op.entry.lineId.trim() : randomUUID();
      const built = await buildDesiredCellsForCopy(
        consultantId,
        op.customerId,
        op.targetYear,
        op.targetWeek,
        op.entry,
        entryLineId
      );
      if (built.error) {
        return rollback({ success: false, error: built.error });
      }

      const res = await copyEntryToWeekCore(
        client,
        consultantId,
        appUserId,
        op.customerId,
        op.targetYear,
        op.targetWeek,
        op.entry,
        expected,
        entryLineId,
        built.toInsert
      );
      if (!res.success) {
        return rollback(res);
      }
      revMap.set(key, res.revision);
    }

    return { success: true, weekRevisions: Object.fromEntries(revMap) };
      }
    );
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Insert failed" };
  }
}

/** Lightweight revision check for visibility refresh (same semantics as load). */
export async function getTimeReportWeekRevision(
  consultantId: string,
  year: number,
  week: number
): Promise<number | null> {
  const consultant = await getConsultantForCurrentUser();
  if (!consultant || consultant.id !== consultantId) return null;
  const { rows } = await cloudSqlPool.query<{ revision: string | null }>(
    `SELECT revision::text FROM time_report_week_revisions
     WHERE consultant_id = $1 AND iso_year = $2 AND iso_week = $3`,
    [consultantId, year, week]
  );
  return Number(rows[0]?.revision ?? 0);
}

/** Batch revision lookup for month view (`${year}-W${week}` keys, missing weeks → 0). */
export async function getTimeReportWeekRevisions(
  consultantId: string,
  weeks: { year: number; week: number }[]
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const w of weeks) {
    out[`${w.year}-W${w.week}`] = 0;
  }

  const consultant = await getConsultantForCurrentUser();
  if (!consultant || consultant.id !== consultantId || weeks.length === 0) {
    return out;
  }

  const years = weeks.map((w) => w.year);
  const wks = weeks.map((w) => w.week);
  const { rows } = await cloudSqlPool.query<{
    iso_year: number;
    iso_week: number;
    revision: string;
  }>(
    `SELECT iso_year, iso_week, revision::text
     FROM time_report_week_revisions
     WHERE consultant_id = $1
       AND (iso_year, iso_week) IN (SELECT * FROM unnest($2::int[], $3::int[]) AS t(y, wk))`,
    [consultantId, years, wks]
  );
  for (const r of rows) {
    out[`${r.iso_year}-W${r.iso_week}`] = Number(r.revision);
  }
  return out;
}

function parseDateOnlyLocal(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export type LogHoursAgainstWorkIssueResult =
  | { success: true; loggedHours: number }
  | { success: false; error: string; code?: "revision_conflict" | "unauthorized" };

/**
 * Log time on a Work issue as a new Time Report row (never merges same-day cells).
 * Uses optimistic concurrency via week revision lock.
 * The optional MCP identity must come from verified authentication after Work project access checks.
 */
export async function logHoursAgainstWorkIssue(input: {
  customerId: string;
  plannerProjectId: string;
  workIssueId: string;
  date: string;
  hours: number;
  /** Billing item id (role UUID or custom cr:/pr: key), same as Time Report Role. */
  roleId: string;
  note?: string | null;
  lineDescription?: string | null;
}, workMcpUser?: McpUser): Promise<LogHoursAgainstWorkIssueResult> {
  if (workMcpUser && (workMcpUser.role === "customer" || !workMcpUser.appKeys.includes("work"))) {
    return { success: false, error: "Work access is required to log hours.", code: "unauthorized" };
  }

  const ctx = await getTimeReportAccessContext(workMcpUser);
  const consultant = ctx.consultant;
  if (!consultant?.id) {
    return { success: false, error: "No consultant profile linked.", code: "unauthorized" };
  }
  if (!ctx.allowedCustomerIds.has(input.customerId)) {
    return { success: false, error: "Unauthorized customer.", code: "unauthorized" };
  }
  if (
    isExternalConsultant(consultant) &&
    !ctx.bookedProjectIds.has(input.plannerProjectId)
  ) {
    return { success: false, error: "Unauthorized project.", code: "unauthorized" };
  }

  const hours = Math.round(Number(input.hours) * 100) / 100;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return { success: false, error: "Hours must be between 0 and 24." };
  }

  const entryDate = parseDateOnlyLocal(input.date);
  if (!entryDate) {
    return { success: false, error: "Invalid date." };
  }
  const dateStr = input.date.trim();
  const { year, week } = getYearWeekForDate(entryDate);

  const allowed = await workIssueIdsForCustomer([input.workIssueId], input.customerId);
  if (!allowed.has(input.workIssueId)) {
    return {
      success: false,
      error: "Work issue must belong to the same customer as the time report row.",
    };
  }

  const resolved = await resolveBillingForWorkIssueLog(
    input.plannerProjectId,
    input.customerId,
    input.roleId
  );
  if (!resolved.ok) {
    return { success: false, error: resolved.error };
  }
  const lineBilling = resolved.billing;

  const linkKey = workIssueLinkKey(input.workIssueId);
  const note = (input.note ?? "").trim() || null;
  const lineDescription = (input.lineDescription ?? "").trim() || null;
  const appUserId = ctx.appUser?.id ?? null;

  try {
    return await withCloudSqlTransaction<LogHoursAgainstWorkIssueResult>(
      `work-issue time log ${year}-W${week}`,
      async (client, rollback) => {
        await client.query(
          `INSERT INTO time_report_week_revisions (consultant_id, iso_year, iso_week, revision)
           VALUES ($1, $2, $3, 0)
           ON CONFLICT (consultant_id, iso_year, iso_week) DO NOTHING`,
          [consultant.id, year, week]
        );

        const { rows: revLock } = await client.query<{ revision: string }>(
          `SELECT revision::text FROM time_report_week_revisions
           WHERE consultant_id = $1 AND iso_year = $2 AND iso_week = $3
           FOR UPDATE`,
          [consultant.id, year, week]
        );
        const currentRev = Number(revLock[0]?.revision ?? 0);
        const newRevision = currentRev + 1;

        // Each Work log creates its own line+entry so same-day logs (e.g. with/without
        // notes) stay as separate records. Time report unique is per line+date.

        const { rows: ordRows } = await client.query<{
          display_order: string | number | null;
        }>(
          `SELECT display_order
           FROM time_report_entry_lines
           WHERE consultant_id = $1 AND iso_year = $2 AND iso_week = $3`,
          [consultant.id, year, week]
        );
        const maxOrder =
          ordRows.length && ordRows.every((r) => r.display_order != null)
            ? Math.max(...ordRows.map((r) => Number(r.display_order)))
            : 0;
        const displayOrder = maxOrder + 1000;
        const entryLineId = randomUUID();

        await client.query(
          `INSERT INTO time_report_entry_lines (
             id, consultant_id, iso_year, iso_week, customer_id, project_id, role_id,
             customer_rate_id, project_rate_id,
             jira_devops_key, description, work_issue_id, display_order, created_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now(), now())`,
          [
            entryLineId,
            consultant.id,
            year,
            week,
            input.customerId,
            input.plannerProjectId,
            lineBilling.role_id,
            lineBilling.customer_rate_id,
            lineBilling.project_rate_id,
            linkKey,
            lineDescription,
            input.workIssueId,
            displayOrder,
          ]
        );

        if (hours > 99.99) {
          return rollback({
            success: false,
            error: "Hours for that day would exceed the maximum.",
          });
        }

        const desired: DesiredCell = {
          entry_line_id: entryLineId,
          consultant_id: consultant.id,
          customer_id: input.customerId,
          project_id: input.plannerProjectId,
          role_id: lineBilling.role_id,
          customer_rate_id: lineBilling.customer_rate_id,
          project_rate_id: lineBilling.project_rate_id,
          role_name_snapshot: lineBilling.role_name_snapshot,
          jira_devops_key: linkKey,
          description: lineDescription,
          entry_date: dateStr,
          hours,
          internal_comment: note,
          rate_snapshot: lineBilling.rate,
          currency_snapshot:
            lineBilling.rate != null ? lineBilling.currency : null,
          display_order: displayOrder,
        };

        const ins = await client.query<{ id: string }>(
          `INSERT INTO time_report_entries (
             consultant_id, customer_id, project_id, role_id, customer_rate_id, project_rate_id,
             role_name_snapshot, jira_devops_key,
             description, entry_date, hours, pm_edited_hours, internal_comment, rate_snapshot, currency_snapshot, display_order,
             entry_line_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11,$11,$12,$13,$14,$15,$16)
           RETURNING id`,
          [
            desired.consultant_id,
            desired.customer_id,
            desired.project_id,
            desired.role_id,
            desired.customer_rate_id,
            desired.project_rate_id,
            desired.role_name_snapshot,
            desired.jira_devops_key,
            desired.description,
            desired.entry_date,
            desired.hours,
            desired.internal_comment,
            desired.rate_snapshot,
            desired.currency_snapshot,
            desired.display_order,
            desired.entry_line_id,
          ]
        );
        const newId = ins.rows[0]?.id;
        await writeEntryHistory(client, {
          timeReportEntryId: newId ?? null,
          entryLineId,
          consultantId: consultant.id,
          operation: "insert",
          before: null,
          after: desiredCellSnapshot(desired, newId),
          sourceRevision: newRevision,
          changedByAppUserId: appUserId,
        });

        await client.query(
          `UPDATE time_report_week_revisions
           SET revision = $1::bigint,
               updated_at = now(),
               updated_by_app_user_id = $2
           WHERE consultant_id = $3 AND iso_year = $4 AND iso_week = $5`,
          [newRevision, appUserId, consultant.id, year, week]
        );

        const { rows: sumRows } = await client.query<{
          hours: string | number | null;
        }>(
          `SELECT COALESCE(SUM(e.hours), 0) AS hours
           FROM time_report_entry_lines l
           JOIN time_report_entries e
             ON e.entry_line_id = l.id
            AND e.consultant_id = l.consultant_id
            AND l.iso_year = EXTRACT(ISOYEAR FROM e.entry_date)::int
            AND l.iso_week = EXTRACT(WEEK FROM e.entry_date)::int
           WHERE l.work_issue_id = $1`,
          [input.workIssueId]
        );

        return {
          success: true,
          loggedHours: Number(sumRows[0]?.hours ?? 0),
        };
      }
    );
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to log time",
    };
  }
}

async function sumLoggedHoursForWorkIssue(
  client: PoolClient,
  workIssueId: string
): Promise<number> {
  const { rows } = await client.query<{ hours: string | number | null }>(
    `SELECT COALESCE(SUM(e.hours), 0) AS hours
     FROM time_report_entry_lines l
     JOIN time_report_entries e
       ON e.entry_line_id = l.id
      AND e.consultant_id = l.consultant_id
      AND l.iso_year = EXTRACT(ISOYEAR FROM e.entry_date)::int
      AND l.iso_week = EXTRACT(WEEK FROM e.entry_date)::int
     WHERE l.work_issue_id = $1`,
    [workIssueId]
  );
  return Number(rows[0]?.hours ?? 0);
}

type OwnedWorkIssueEntry = TimeReportRowDb & {
  work_issue_id: string;
  iso_year: number;
  iso_week: number;
};

async function loadOwnedWorkIssueEntry(
  client: PoolClient,
  consultantId: string,
  workIssueId: string,
  entryId: string
): Promise<OwnedWorkIssueEntry | null> {
  const { rows } = await client.query<OwnedWorkIssueEntry>(
    `SELECT e.id, e.entry_line_id, e.customer_id, e.project_id, e.role_id,
            e.customer_rate_id, e.project_rate_id, e.role_name_snapshot,
            e.jira_devops_key, e.description, e.entry_date::text AS entry_date,
            e.hours, e.internal_comment, e.rate_snapshot, e.currency_snapshot,
            e.display_order, l.work_issue_id, l.iso_year, l.iso_week
     FROM time_report_entries e
     JOIN time_report_entry_lines l
       ON l.id = e.entry_line_id
      AND l.consultant_id = e.consultant_id
      AND l.iso_year = EXTRACT(ISOYEAR FROM e.entry_date)::int
      AND l.iso_week = EXTRACT(WEEK FROM e.entry_date)::int
     WHERE e.id = $1
       AND e.consultant_id = $2
       AND l.work_issue_id = $3
     FOR UPDATE OF e, l`,
    [entryId, consultantId, workIssueId]
  );
  return rows[0] ?? null;
}

async function bumpWeekRevision(
  client: PoolClient,
  consultantId: string,
  year: number,
  week: number,
  appUserId: string | null
): Promise<number> {
  await client.query(
    `INSERT INTO time_report_week_revisions (consultant_id, iso_year, iso_week, revision)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (consultant_id, iso_year, iso_week) DO NOTHING`,
    [consultantId, year, week]
  );
  const { rows: revLock } = await client.query<{ revision: string }>(
    `SELECT revision::text FROM time_report_week_revisions
     WHERE consultant_id = $1 AND iso_year = $2 AND iso_week = $3
     FOR UPDATE`,
    [consultantId, year, week]
  );
  const newRevision = Number(revLock[0]?.revision ?? 0) + 1;
  await client.query(
    `UPDATE time_report_week_revisions
     SET revision = $1::bigint,
         updated_at = now(),
         updated_by_app_user_id = $2
     WHERE consultant_id = $3 AND iso_year = $4 AND iso_week = $5`,
    [newRevision, appUserId, consultantId, year, week]
  );
  return newRevision;
}

/**
 * Update the current consultant's Work entry. Moves between weeks commit atomically
 * and preserve the entry ID and its billing snapshots.
 */
export async function updateWorkIssueTimeEntry(input: {
  customerId: string;
  plannerProjectId: string;
  workIssueId: string;
  entryId: string;
  hours: number;
  date: string;
  note?: string | null;
  lineDescription?: string | null;
}, workMcpUser?: McpUser): Promise<LogHoursAgainstWorkIssueResult> {
  if (workMcpUser && (workMcpUser.role === "customer" || !workMcpUser.appKeys.includes("work"))) {
    return { success: false, error: "Work access is required to edit hours.", code: "unauthorized" };
  }

  const ctx = await getTimeReportAccessContext(workMcpUser);
  const consultant = ctx.consultant;
  if (!consultant?.id) {
    return { success: false, error: "No consultant profile linked.", code: "unauthorized" };
  }
  if (!ctx.allowedCustomerIds.has(input.customerId)) {
    return { success: false, error: "Unauthorized customer.", code: "unauthorized" };
  }

  const hours = Math.round(Number(input.hours) * 100) / 100;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return { success: false, error: "Hours must be between 0 and 24." };
  }
  const entryDate = parseDateOnlyLocal(input.date);
  if (!entryDate) {
    return { success: false, error: "Invalid date." };
  }
  const dateStr = input.date.trim();
  const appUserId = ctx.appUser?.id ?? null;

  try {
    return await withCloudSqlTransaction<LogHoursAgainstWorkIssueResult>(
      `work-issue time update`,
      async (client, rollback) => {
        const existing = await loadOwnedWorkIssueEntry(
          client,
          consultant.id,
          input.workIssueId,
          input.entryId
        );
        if (!existing) {
          return await rollback({
            success: false,
            error: "Time entry not found.",
          });
        }

        if (existing.customer_id !== input.customerId ||
            (isExternalConsultant(consultant) && existing.project_id && !ctx.bookedProjectIds.has(existing.project_id))) {
          return rollback({ success: false, error: "Unauthorized project.", code: "unauthorized" });
        }

        const note = input.note === undefined ? existing.internal_comment : (input.note ?? "").trim() || null;
        const oldDate = existing.entry_date.slice(0, 10);
        const oldWeek = {
          year: Number(existing.iso_year),
          week: Number(existing.iso_week),
        };
        const nextWeek = getYearWeekForDate(entryDate);

        if (oldDate === dateStr) {
          const newRevision = await bumpWeekRevision(
            client,
            consultant.id,
            oldWeek.year,
            oldWeek.week,
            appUserId
          );
          await client.query(
            `UPDATE time_report_entries SET
               hours = $2,
               pm_edited_hours = $2,
               internal_comment = $3
             WHERE id = $1`,
            [existing.id, hours, note]
          );
          await writeEntryHistory(client, {
            timeReportEntryId: existing.id,
            entryLineId: existing.entry_line_id,
            consultantId: consultant.id,
            operation: "update",
            before: snapshotRowDb(existing),
            after: {
              ...snapshotRowDb(existing),
              hours,
              internal_comment: note,
            },
            sourceRevision: newRevision,
            changedByAppUserId: appUserId,
          });
          return {
            success: true,
            loggedHours: await sumLoggedHoursForWorkIssue(
              client,
              input.workIssueId
            ),
          };
        }

        if (
          oldWeek.year === nextWeek.year &&
          oldWeek.week === nextWeek.week
        ) {
          const { rows: conflict } = await client.query<{ id: string }>(
            `SELECT id FROM time_report_entries
             WHERE entry_line_id = $1 AND consultant_id = $2
               AND entry_date = $3::date AND id <> $4
             LIMIT 1
             FOR UPDATE`,
            [existing.entry_line_id, consultant.id, dateStr, existing.id]
          );
          if (conflict[0]) {
            return await rollback({
              success: false,
              error: "You already have time on that date for this issue.",
            });
          }
          const newRevision = await bumpWeekRevision(
            client,
            consultant.id,
            oldWeek.year,
            oldWeek.week,
            appUserId
          );
          await client.query(
            `UPDATE time_report_entries SET
               entry_date = $2::date,
               hours = $3,
               pm_edited_hours = $3,
               internal_comment = $4
             WHERE id = $1`,
            [existing.id, dateStr, hours, note]
          );
          await writeEntryHistory(client, {
            timeReportEntryId: existing.id,
            entryLineId: existing.entry_line_id,
            consultantId: consultant.id,
            operation: "update",
            before: snapshotRowDb(existing),
            after: {
              ...snapshotRowDb(existing),
              entry_date: dateStr,
              hours,
              internal_comment: note,
            },
            sourceRevision: newRevision,
            changedByAppUserId: appUserId,
          });
          return {
            success: true,
            loggedHours: await sumLoggedHoursForWorkIssue(
              client,
              input.workIssueId
            ),
          };
        }

        // Create the destination line and move the entry in the same transaction.
        const newRevision = await bumpWeekRevision(
          client,
          consultant.id,
          oldWeek.year,
          oldWeek.week,
          appUserId
        );
        const targetRevision = await bumpWeekRevision(client, consultant.id, nextWeek.year, nextWeek.week, appUserId);
        const entryLineId = randomUUID();
        const { rows: orderRows } = await client.query<{ display_order: number }>(
          `SELECT COALESCE(MAX(display_order), 0) + 1000 AS display_order
           FROM time_report_entry_lines WHERE consultant_id = $1 AND iso_year = $2 AND iso_week = $3`,
          [consultant.id, nextWeek.year, nextWeek.week]
        );
        const displayOrder = Number(orderRows[0].display_order);
        await client.query(
          `INSERT INTO time_report_entry_lines (
             id, consultant_id, iso_year, iso_week, customer_id, project_id, role_id,
             customer_rate_id, project_rate_id, jira_devops_key, description, work_issue_id, display_order
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [entryLineId, consultant.id, nextWeek.year, nextWeek.week, existing.customer_id, existing.project_id,
            existing.role_id, existing.customer_rate_id, existing.project_rate_id, existing.jira_devops_key,
            existing.description, input.workIssueId, displayOrder]
        );
        await client.query(
          `UPDATE time_report_entries SET entry_line_id = $2, entry_date = $3::date,
             hours = $4, pm_edited_hours = $4, internal_comment = $5, display_order = $6 WHERE id = $1`,
          [existing.id, entryLineId, dateStr, hours, note, displayOrder]
        );
        await writeEntryHistory(client, {
          timeReportEntryId: existing.id,
          entryLineId: existing.entry_line_id,
          consultantId: consultant.id,
          operation: "delete",
          before: snapshotRowDb(existing),
          after: null,
          sourceRevision: newRevision,
          changedByAppUserId: appUserId,
        });
        await writeEntryHistory(client, {
          timeReportEntryId: existing.id,
          entryLineId,
          consultantId: consultant.id,
          operation: "insert",
          before: null,
          after: { ...snapshotRowDb(existing), entry_line_id: entryLineId, entry_date: dateStr, hours, internal_comment: note, display_order: displayOrder },
          sourceRevision: targetRevision,
          changedByAppUserId: appUserId,
        });

        return {
          success: true,
          loggedHours: await sumLoggedHoursForWorkIssue(client, input.workIssueId),
        };
      }
    );
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to update time",
    };
  }
}

export async function deleteWorkIssueTimeEntry(input: {
  customerId: string;
  workIssueId: string;
  entryId: string;
}, workMcpUser?: McpUser): Promise<LogHoursAgainstWorkIssueResult> {
  if (workMcpUser && (workMcpUser.role === "customer" || !workMcpUser.appKeys.includes("work"))) {
    return { success: false, error: "Work access is required to delete hours.", code: "unauthorized" };
  }

  const ctx = await getTimeReportAccessContext(workMcpUser);
  const consultant = ctx.consultant;
  if (!consultant?.id) {
    return { success: false, error: "No consultant profile linked.", code: "unauthorized" };
  }
  if (!ctx.allowedCustomerIds.has(input.customerId)) {
    return { success: false, error: "Unauthorized customer.", code: "unauthorized" };
  }

  const appUserId = ctx.appUser?.id ?? null;

  try {
    return await withCloudSqlTransaction<LogHoursAgainstWorkIssueResult>(
      `work-issue time delete`,
      async (client, rollback) => {
        const existing = await loadOwnedWorkIssueEntry(
          client,
          consultant.id,
          input.workIssueId,
          input.entryId
        );
        if (!existing) {
          return await rollback({
            success: false,
            error: "Time entry not found.",
          });
        }

        if (existing.customer_id !== input.customerId ||
            (isExternalConsultant(consultant) && existing.project_id && !ctx.bookedProjectIds.has(existing.project_id))) {
          return rollback({ success: false, error: "Unauthorized project.", code: "unauthorized" });
        }

        const year = Number(existing.iso_year);
        const week = Number(existing.iso_week);
        const newRevision = await bumpWeekRevision(
          client,
          consultant.id,
          year,
          week,
          appUserId
        );
        await writeEntryHistory(client, {
          timeReportEntryId: existing.id,
          entryLineId: existing.entry_line_id,
          consultantId: consultant.id,
          operation: "delete",
          before: snapshotRowDb(existing),
          after: null,
          sourceRevision: newRevision,
          changedByAppUserId: appUserId,
        });
        await client.query(`DELETE FROM time_report_entries WHERE id = $1`, [
          existing.id,
        ]);

        return {
          success: true,
          loggedHours: await sumLoggedHoursForWorkIssue(client, input.workIssueId),
        };
      }
    );
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to delete time",
    };
  }
}
