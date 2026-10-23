import "server-only";

import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/appUsers";
import { parseBillingCurrency, type BillingCurrency } from "@/lib/currency";
import {
  parseWorkEstimateUnit,
  type WorkEstimateUnit,
} from "@/lib/workEstimate";
import {
  canSeeWorkEstimates,
  canSeeWorkReportedTime,
} from "@/lib/workAccess";
import { fetchLoggedHoursByIssueIds } from "@/lib/workIssuesQueries";
import { workIssueKey } from "@/lib/workIssueKey";
import { workSprintLabel } from "@/lib/workSprintLabel";
import { DEFAULT_CUSTOMER_COLOR } from "@/lib/constants";
import {
  fetchMemberWorkProjectIds,
  fetchMyWorkIssues,
} from "@/lib/workMyIssuesQueries";
import { resolveWorkCustomerColor } from "@/lib/workStatusColors";
import type { WorkIssuePriority, WorkIssueType } from "@/lib/workTypes";

export type WorkMyIssue = {
  id: string;
  key: string;
  title: string;
  issueType: WorkIssueType;
  priority: WorkIssuePriority | null;
  statusId: string;
  statusName: string;
  isDone: boolean;
  customerId: string;
  customerName: string;
  customerColor: string;
  projectId: string;
  projectTitle: string;
  /** 0-based index of status in the project column order. */
  statusIndex: number;
  statusCount: number;
  sprintLabel: string | null;
  showEstimates: boolean;
  showReportedTime: boolean;
  estimateUnit: WorkEstimateUnit;
  billingCurrency: BillingCurrency;
  estimateHours: number | null;
  loggedHours: number;
  dueDate: string | null;
  isOwner: boolean;
  isAssignee: boolean;
};

export async function listMyWorkIssues(): Promise<WorkMyIssue[]> {
  const user = await getCurrentAppUser();
  if (!user || !user.appKeys.includes("work")) redirect("/access-denied");

  const projectIds = await fetchMemberWorkProjectIds(user.id);
  const rows = await fetchMyWorkIssues(projectIds, user.id);
  const actor = { id: user.id, role: user.role };
  const needsHours = rows.some((row) =>
    canSeeWorkReportedTime(
      actor,
      row.work_show_reported_time_to_customer_users
    )
  );
  const loggedHours = needsHours
    ? await fetchLoggedHoursByIssueIds(rows.map((row) => row.id))
    : new Map<string, number>();

  return rows.map((row) => {
    const showEstimates = canSeeWorkEstimates(
      actor,
      row.work_show_estimates_to_customer_users
    );
    const showReportedTime = canSeeWorkReportedTime(
      actor,
      row.work_show_reported_time_to_customer_users
    );
    return {
      id: row.id,
      key: workIssueKey(row.project_prefix, row.number),
      title: row.title,
      issueType: row.issue_type,
      priority: row.priority,
      statusId: row.status_id,
      statusName: row.status_name,
      isDone: row.is_done,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerColor: resolveWorkCustomerColor(
        row.customer_color ?? DEFAULT_CUSTOMER_COLOR
      ),
      projectId: row.project_id,
      projectTitle: row.project_title,
      statusIndex: Number(row.status_index) || 0,
      statusCount: Math.max(1, Number(row.status_count) || 1),
      sprintLabel:
        row.sprint_number == null
          ? null
          : workSprintLabel({
              number: row.sprint_number,
              title: row.sprint_title ?? "",
            }),
      showEstimates,
      showReportedTime,
      estimateUnit: parseWorkEstimateUnit(row.estimate_unit),
      billingCurrency: parseBillingCurrency(row.billing_currency),
      estimateHours: showEstimates
        ? row.estimate_hours == null
          ? null
          : Number(row.estimate_hours)
        : null,
      loggedHours: showReportedTime ? loggedHours.get(row.id) ?? 0 : 0,
      dueDate: typeof row.due_date === "string" ? row.due_date : null,
      isOwner: row.is_owner,
      isAssignee: row.is_assignee,
    };
  });
}
