import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { revalidateProjectManagerNavCache } from "@/lib/layoutShell";
import { enableDefaultActivitiesForProjectQuery } from "@/lib/timeActivitiesQueries";
import * as q from "./projectsQueries";

export type {
  ProjectRecord,
  CreateProjectInput,
  UpdateProjectInput,
  IntegrationProjectOption,
  ProjectWithCustomer,
} from "./projectsQueries";

export async function createProject(input: q.CreateProjectInput) {
  const project = await q.createProjectQuery(input);
  try {
    await enableDefaultActivitiesForProjectQuery(project.id);
  } catch (error) {
    // Table may not exist yet before migration; project create should still succeed.
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
    if (code !== "42P01") throw error;
  }
  return project;
}

export async function updateProject(id: string, input: q.UpdateProjectInput) {
  if (input.project_manager_id !== undefined) {
    const { rows } = await cloudSqlPool.query<{
      project_manager_id: string | null;
    }>(`SELECT project_manager_id FROM projects WHERE id = $1`, [id]);
    const previousPm = rows[0]?.project_manager_id ?? null;
    await q.updateProjectQuery(id, input);
    if (previousPm) revalidateProjectManagerNavCache(previousPm);
    const nextPm = input.project_manager_id ?? null;
    if (nextPm && nextPm !== previousPm) {
      revalidateProjectManagerNavCache(nextPm);
    }
    return;
  }
  return q.updateProjectQuery(id, input);
}

export async function deleteProject(id: string) {
  return q.deleteProjectQuery(id);
}

export async function getUniqueJiraAndDevopsProjects() {
  return q.fetchUniqueJiraAndDevopsProjects();
}

export async function getProjectWithDetailsById(id: string) {
  return q.fetchProjectWithDetailsById(id);
}

export async function getProjects() {
  return q.fetchProjects();
}

export async function getProjectsWithDetails() {
  return q.fetchProjectsWithDetails();
}

export async function getProjectsByCustomerIds(customerIds: string[]) {
  return q.fetchProjectsByCustomerIds(customerIds);
}

export async function getProjectsByIds(ids: string[]) {
  return q.fetchProjectsByIds(ids);
}

export async function getProjectBillingTypesByIds(ids: string[]) {
  return q.fetchProjectBillingTypesByIds(ids);
}

export async function getProjectsWithCustomerNames(ids: string[]) {
  return q.fetchProjectsWithCustomerNames(ids);
}

export async function getProjectsWithCustomer(ids: string[] = []) {
  return q.fetchProjectsWithCustomer(ids);
}

export async function getProjectsAvailableForConsultant(
  consultantId: string | null
) {
  return q.fetchProjectsAvailableForConsultant(consultantId);
}
