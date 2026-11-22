"use server";

import * as q from "./timeActivitiesQueries";

export type { TimeActivity, ProjectTimeActivity } from "./timeActivitiesQueries";

export async function getTimeActivities() {
  return q.fetchTimeActivities();
}

export async function createTimeActivity(name: string) {
  return q.createTimeActivityQuery({ name });
}

export async function updateTimeActivity(
  id: string,
  input: {
    name?: string;
    isActive?: boolean;
    defaultOnNewProjects?: boolean;
  }
) {
  return q.updateTimeActivityQuery(id, input);
}

export async function deleteTimeActivity(id: string) {
  return q.deleteTimeActivityQuery(id);
}

export async function getProjectActivitySettings(projectId: string) {
  return q.fetchProjectActivitySettings(projectId);
}

export async function setProjectCatalogActivityEnabled(
  projectId: string,
  activityId: string,
  enabled: boolean
) {
  return q.setProjectCatalogActivityEnabledQuery(
    projectId,
    activityId,
    enabled
  );
}

export async function createProjectCustomActivity(
  projectId: string,
  name: string
) {
  return q.createProjectCustomActivityQuery(projectId, name);
}

export async function updateProjectCustomActivity(
  id: string,
  input: { name?: string; isEnabled?: boolean }
) {
  return q.updateProjectCustomActivityQuery(id, input);
}

export async function deleteProjectCustomActivity(id: string) {
  return q.deleteProjectCustomActivityQuery(id);
}
