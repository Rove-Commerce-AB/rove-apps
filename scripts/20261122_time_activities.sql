-- Central time-report activity catalog + per-project enablement / custom activities.
-- Selected in the same time-report field as Jira/Work via link key activity:<id>.

CREATE TABLE IF NOT EXISTS time_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  default_on_new_projects boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_activities_name_nonempty CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS time_activities_name_uidx
  ON time_activities (lower(trim(name)));

CREATE TABLE IF NOT EXISTS project_time_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  -- Catalog activity when set; NULL means project-custom.
  activity_id uuid REFERENCES time_activities (id) ON DELETE CASCADE,
  custom_name text,
  is_enabled boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_time_activities_catalog_or_custom CHECK (
    (
      activity_id IS NOT NULL
      AND (custom_name IS NULL OR length(trim(custom_name)) = 0)
    )
    OR (
      activity_id IS NULL
      AND custom_name IS NOT NULL
      AND length(trim(custom_name)) > 0
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS project_time_activities_catalog_uidx
  ON project_time_activities (project_id, activity_id)
  WHERE activity_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS project_time_activities_custom_name_uidx
  ON project_time_activities (project_id, lower(trim(custom_name)))
  WHERE activity_id IS NULL;

CREATE INDEX IF NOT EXISTS project_time_activities_project_idx
  ON project_time_activities (project_id)
  WHERE is_enabled;

COMMENT ON TABLE time_activities IS
  'Org-wide catalog of non-board time activities (e.g. Project management).';
COMMENT ON TABLE project_time_activities IS
  'Per-project enabled catalog activities and project-custom time activities.';

INSERT INTO time_activities (name, display_order, default_on_new_projects)
SELECT v.name, v.display_order, v.default_on_new_projects
FROM (
  VALUES
    ('Project management', 10, true),
    ('Standing meetings', 20, true),
    ('Investigation', 30, true)
) AS v(name, display_order, default_on_new_projects)
WHERE NOT EXISTS (
  SELECT 1
  FROM time_activities t
  WHERE lower(trim(t.name)) = lower(trim(v.name))
);
