import { cloudSqlPool } from "@/lib/cloudSqlPool";

export type TimeActivity = {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  defaultOnNewProjects: boolean;
};

export type ProjectTimeActivity = {
  id: string;
  projectId: string;
  /** Catalog id when from central list; null for project-custom. */
  activityId: string | null;
  name: string;
  isEnabled: boolean;
  isCustom: boolean;
  displayOrder: number;
};

type CatalogRow = {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  default_on_new_projects: boolean;
};

type ProjectRow = {
  id: string;
  project_id: string;
  activity_id: string | null;
  custom_name: string | null;
  catalog_name: string | null;
  is_enabled: boolean;
  display_order: number;
};

function mapCatalog(row: CatalogRow): TimeActivity {
  return {
    id: row.id,
    name: row.name,
    displayOrder: row.display_order,
    isActive: row.is_active,
    defaultOnNewProjects: row.default_on_new_projects,
  };
}

function mapProject(row: ProjectRow): ProjectTimeActivity {
  const isCustom = row.activity_id == null;
  const name = (isCustom ? row.custom_name : row.catalog_name)?.trim() || "";
  return {
    id: row.id,
    projectId: row.project_id,
    activityId: row.activity_id,
    name,
    isEnabled: row.is_enabled,
    isCustom,
    displayOrder: row.display_order,
  };
}

const PROJECT_SELECT = `
  pta.id,
  pta.project_id,
  pta.activity_id,
  pta.custom_name,
  ta.name AS catalog_name,
  pta.is_enabled,
  pta.display_order
`;

export async function fetchTimeActivities(): Promise<TimeActivity[]> {
  const { rows } = await cloudSqlPool.query<CatalogRow>(
    `SELECT id, name, display_order, is_active, default_on_new_projects
     FROM time_activities
     ORDER BY display_order ASC, lower(name) ASC`
  );
  return rows.map(mapCatalog);
}

export async function createTimeActivityQuery(input: {
  name: string;
  defaultOnNewProjects?: boolean;
}): Promise<TimeActivity> {
  const name = input.name.trim();
  if (!name) throw new Error("Activity name is required");
  const { rows: maxRows } = await cloudSqlPool.query<{ max: number | null }>(
    `SELECT MAX(display_order) AS max FROM time_activities`
  );
  const displayOrder = (maxRows[0]?.max ?? 0) + 10;
  const { rows } = await cloudSqlPool.query<CatalogRow>(
    `INSERT INTO time_activities (name, display_order, default_on_new_projects)
     VALUES ($1, $2, $3)
     RETURNING id, name, display_order, is_active, default_on_new_projects`,
    [name, displayOrder, input.defaultOnNewProjects ?? true]
  );
  if (!rows[0]) throw new Error("Failed to create activity");
  return mapCatalog(rows[0]);
}

export async function updateTimeActivityQuery(
  id: string,
  input: {
    name?: string;
    isActive?: boolean;
    defaultOnNewProjects?: boolean;
  }
): Promise<TimeActivity> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Activity name is required");
    sets.push(`name = $${i++}`);
    values.push(name);
  }
  if (input.isActive !== undefined) {
    sets.push(`is_active = $${i++}`);
    values.push(input.isActive);
  }
  if (input.defaultOnNewProjects !== undefined) {
    sets.push(`default_on_new_projects = $${i++}`);
    values.push(input.defaultOnNewProjects);
  }
  if (sets.length === 0) throw new Error("Nothing to update");
  sets.push(`updated_at = now()`);
  values.push(id);
  const { rows } = await cloudSqlPool.query<CatalogRow>(
    `UPDATE time_activities
     SET ${sets.join(", ")}
     WHERE id = $${i}
     RETURNING id, name, display_order, is_active, default_on_new_projects`,
    values
  );
  if (!rows[0]) throw new Error("Activity not found");
  return mapCatalog(rows[0]);
}

export async function deleteTimeActivityQuery(id: string): Promise<void> {
  const { rows } = await cloudSqlPool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
     FROM project_time_activities
     WHERE activity_id = $1`,
    [id]
  );
  if (Number(rows[0]?.n ?? 0) > 0) {
    throw new Error(
      "Activity is used on projects. Disable it instead of deleting."
    );
  }
  await cloudSqlPool.query(`DELETE FROM time_activities WHERE id = $1`, [id]);
}

export async function fetchProjectTimeActivities(
  projectId: string
): Promise<ProjectTimeActivity[]> {
  const { rows } = await cloudSqlPool.query<ProjectRow>(
    `SELECT ${PROJECT_SELECT}
     FROM project_time_activities pta
     LEFT JOIN time_activities ta ON ta.id = pta.activity_id
     WHERE pta.project_id = $1
     ORDER BY pta.display_order ASC, lower(COALESCE(pta.custom_name, ta.name)) ASC`,
    [projectId]
  );
  return rows.map(mapProject);
}

/** Enabled activities for time-report picker. */
export async function fetchEnabledProjectTimeActivities(
  projectId: string
): Promise<ProjectTimeActivity[]> {
  const { rows } = await cloudSqlPool.query<ProjectRow>(
    `SELECT ${PROJECT_SELECT}
     FROM project_time_activities pta
     LEFT JOIN time_activities ta ON ta.id = pta.activity_id
     WHERE pta.project_id = $1
       AND pta.is_enabled = true
       AND (pta.activity_id IS NULL OR ta.is_active = true)
     ORDER BY pta.display_order ASC, lower(COALESCE(pta.custom_name, ta.name)) ASC`,
    [projectId]
  );
  return rows.map(mapProject);
}

export async function fetchProjectTimeActivitiesByIds(
  ids: string[]
): Promise<ProjectTimeActivity[]> {
  if (ids.length === 0) return [];
  const { rows } = await cloudSqlPool.query<ProjectRow>(
    `SELECT ${PROJECT_SELECT}
     FROM project_time_activities pta
     LEFT JOIN time_activities ta ON ta.id = pta.activity_id
     WHERE pta.id = ANY($1::uuid[])`,
    [ids]
  );
  return rows.map(mapProject);
}

/** Catalog + current project rows for the settings UI. */
export async function fetchProjectActivitySettings(projectId: string): Promise<{
  catalog: TimeActivity[];
  project: ProjectTimeActivity[];
}> {
  const [catalog, project] = await Promise.all([
    fetchTimeActivities(),
    fetchProjectTimeActivities(projectId),
  ]);
  return {
    catalog: catalog.filter((a) => a.isActive),
    project,
  };
}

export async function setProjectCatalogActivityEnabledQuery(
  projectId: string,
  activityId: string,
  enabled: boolean
): Promise<ProjectTimeActivity> {
  const existing = await cloudSqlPool.query<ProjectRow>(
    `SELECT ${PROJECT_SELECT}
     FROM project_time_activities pta
     LEFT JOIN time_activities ta ON ta.id = pta.activity_id
     WHERE pta.project_id = $1 AND pta.activity_id = $2`,
    [projectId, activityId]
  );
  if (existing.rows[0]) {
    await cloudSqlPool.query(
      `UPDATE project_time_activities
       SET is_enabled = $2, updated_at = now()
       WHERE id = $1`,
      [existing.rows[0].id, enabled]
    );
    const refreshed = await cloudSqlPool.query<ProjectRow>(
      `SELECT ${PROJECT_SELECT}
       FROM project_time_activities pta
       LEFT JOIN time_activities ta ON ta.id = pta.activity_id
       WHERE pta.id = $1`,
      [existing.rows[0].id]
    );
    if (!refreshed.rows[0]) throw new Error("Failed to update activity");
    return mapProject(refreshed.rows[0]);
  }

  if (!enabled) {
    // Nothing to create when turning off an unused catalog activity.
    const catalog = await cloudSqlPool.query<CatalogRow>(
      `SELECT id, name, display_order, is_active, default_on_new_projects
       FROM time_activities WHERE id = $1`,
      [activityId]
    );
    if (!catalog.rows[0]) throw new Error("Activity not found");
    return {
      id: "",
      projectId,
      activityId,
      name: catalog.rows[0].name,
      isEnabled: false,
      isCustom: false,
      displayOrder: catalog.rows[0].display_order,
    };
  }

  const { rows: maxRows } = await cloudSqlPool.query<{ max: number | null }>(
    `SELECT MAX(display_order) AS max
     FROM project_time_activities WHERE project_id = $1`,
    [projectId]
  );
  const displayOrder = (maxRows[0]?.max ?? 0) + 10;
  const inserted = await cloudSqlPool.query<{ id: string }>(
    `INSERT INTO project_time_activities
       (project_id, activity_id, custom_name, is_enabled, display_order)
     VALUES ($1, $2, NULL, true, $3)
     RETURNING id`,
    [projectId, activityId, displayOrder]
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error("Failed to enable activity");
  const refreshed = await cloudSqlPool.query<ProjectRow>(
    `SELECT ${PROJECT_SELECT}
     FROM project_time_activities pta
     LEFT JOIN time_activities ta ON ta.id = pta.activity_id
     WHERE pta.id = $1`,
    [id]
  );
  if (!refreshed.rows[0]) throw new Error("Failed to enable activity");
  return mapProject(refreshed.rows[0]);
}

export async function createProjectCustomActivityQuery(
  projectId: string,
  name: string
): Promise<ProjectTimeActivity> {
  const customName = name.trim();
  if (!customName) throw new Error("Activity name is required");
  const { rows: maxRows } = await cloudSqlPool.query<{ max: number | null }>(
    `SELECT MAX(display_order) AS max
     FROM project_time_activities WHERE project_id = $1`,
    [projectId]
  );
  const displayOrder = (maxRows[0]?.max ?? 0) + 10;
  const inserted = await cloudSqlPool.query<{ id: string }>(
    `INSERT INTO project_time_activities
       (project_id, activity_id, custom_name, is_enabled, display_order)
     VALUES ($1, NULL, $2, true, $3)
     RETURNING id`,
    [projectId, customName, displayOrder]
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error("Failed to create activity");
  const refreshed = await cloudSqlPool.query<ProjectRow>(
    `SELECT ${PROJECT_SELECT}
     FROM project_time_activities pta
     LEFT JOIN time_activities ta ON ta.id = pta.activity_id
     WHERE pta.id = $1`,
    [id]
  );
  if (!refreshed.rows[0]) throw new Error("Failed to create activity");
  return mapProject(refreshed.rows[0]);
}

export async function updateProjectCustomActivityQuery(
  id: string,
  input: { name?: string; isEnabled?: boolean }
): Promise<ProjectTimeActivity> {
  const existing = await cloudSqlPool.query<{
    id: string;
    activity_id: string | null;
  }>(`SELECT id, activity_id FROM project_time_activities WHERE id = $1`, [id]);
  if (!existing.rows[0]) throw new Error("Activity not found");
  if (existing.rows[0].activity_id != null && input.name !== undefined) {
    throw new Error("Rename catalog activities in General settings");
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (input.name !== undefined) {
    const customName = input.name.trim();
    if (!customName) throw new Error("Activity name is required");
    sets.push(`custom_name = $${i++}`);
    values.push(customName);
  }
  if (input.isEnabled !== undefined) {
    sets.push(`is_enabled = $${i++}`);
    values.push(input.isEnabled);
  }
  if (sets.length === 0) throw new Error("Nothing to update");
  sets.push(`updated_at = now()`);
  values.push(id);
  await cloudSqlPool.query(
    `UPDATE project_time_activities SET ${sets.join(", ")} WHERE id = $${i}`,
    values
  );
  const refreshed = await cloudSqlPool.query<ProjectRow>(
    `SELECT ${PROJECT_SELECT}
     FROM project_time_activities pta
     LEFT JOIN time_activities ta ON ta.id = pta.activity_id
     WHERE pta.id = $1`,
    [id]
  );
  if (!refreshed.rows[0]) throw new Error("Activity not found");
  return mapProject(refreshed.rows[0]);
}

export async function deleteProjectCustomActivityQuery(id: string): Promise<void> {
  const existing = await cloudSqlPool.query<{
    activity_id: string | null;
  }>(`SELECT activity_id FROM project_time_activities WHERE id = $1`, [id]);
  if (!existing.rows[0]) return;
  if (existing.rows[0].activity_id != null) {
    throw new Error("Disable catalog activities instead of deleting them");
  }
  const used = await cloudSqlPool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
     FROM time_report_entry_lines
     WHERE jira_devops_key = $1`,
    [`activity:${id}`]
  );
  if (Number(used.rows[0]?.n ?? 0) > 0) {
    await cloudSqlPool.query(
      `UPDATE project_time_activities
       SET is_enabled = false, updated_at = now()
       WHERE id = $1`,
      [id]
    );
    return;
  }
  await cloudSqlPool.query(
    `DELETE FROM project_time_activities WHERE id = $1`,
    [id]
  );
}

/** Enable catalog defaults on a newly created project. */
export async function enableDefaultActivitiesForProjectQuery(
  projectId: string
): Promise<void> {
  await cloudSqlPool.query(
    `INSERT INTO project_time_activities
       (project_id, activity_id, custom_name, is_enabled, display_order)
     SELECT $1, ta.id, NULL, true, ta.display_order
     FROM time_activities ta
     WHERE ta.is_active = true
       AND ta.default_on_new_projects = true
       AND NOT EXISTS (
         SELECT 1 FROM project_time_activities pta
         WHERE pta.project_id = $1 AND pta.activity_id = ta.id
       )`,
    [projectId]
  );
}
