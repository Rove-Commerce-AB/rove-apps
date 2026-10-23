import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";

export type JiraIssueOption = {
  value: string;
  label: string;
  url?: string | null;
  summary: string | null;
};

export type DevOpsWorkItemOption = {
  value: string;
  label: string;
  title: string | null;
};

export type ClickUpItemOption = {
  value: string;
  label: string;
  url?: string | null;
  summary: string | null;
};

/** Jira issues for a project key (project_key = projects.jira_project_key). */
export async function getJiraIssuesByProjectKey(
  projectKey: string
): Promise<JiraIssueOption[]> {
  const trimmedProjectKey = projectKey.trim();
  if (!trimmedProjectKey) return [];
  const { rows } = await cloudSqlPool.query<{
    jira_key: string;
    summary: string | null;
    url: string | null;
  }>(
    `SELECT jira_key, summary, url
     FROM jira_issues
     WHERE project_key = $1
        OR jira_key LIKE $2
     ORDER BY jira_key`,
    [trimmedProjectKey, `${trimmedProjectKey}-%`]
  );
  return rows.map((row) => ({
    value: row.jira_key,
    label: row.summary ? `${row.jira_key}: ${row.summary}` : row.jira_key,
    url: row.url ?? null,
    summary: row.summary,
  }));
}

/** DevOps work items for a project name (project = projects.devops_project). */
export async function getDevOpsWorkItemsByProject(
  projectName: string
): Promise<DevOpsWorkItemOption[]> {
  if (!projectName.trim()) return [];
  const { rows } = await cloudSqlPool.query<{
    work_item_id: number;
    title: string | null;
  }>(
    `SELECT work_item_id, title FROM devops_work_items WHERE project = $1 ORDER BY work_item_id`,
    [projectName.trim()]
  );
  return rows.map((row) => ({
    value: String(row.work_item_id),
    label: row.title
      ? `${row.work_item_id}: ${row.title}`
      : String(row.work_item_id),
    title: row.title,
  }));
}

/** ClickUp items for a folder (folder_id = projects.clickup_project_id). */
export async function getClickUpItemsByProjectKey(
  projectKey: string
): Promise<ClickUpItemOption[]> {
  if (!projectKey.trim()) return [];
  const { rows } = await cloudSqlPool.query<{
    clickup_id: string;
    summary: string | null;
    url: string | null;
  }>(
    `SELECT clickup_id, summary, url FROM clickup WHERE folder_id = $1 ORDER BY clickup_id`,
    [projectKey.trim()]
  );
  return rows.map((row) => ({
    value: row.clickup_id,
    label: row.summary ? `${row.clickup_id}: ${row.summary}` : row.clickup_id,
    url: row.url ?? null,
    summary: row.summary,
  }));
}
