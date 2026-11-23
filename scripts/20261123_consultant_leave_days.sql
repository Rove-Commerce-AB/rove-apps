-- Day-level planned leave for Planner Availability view.
-- Rolls up to weekly allocations on absence projects. Safe to rerun.

BEGIN;

CREATE TABLE IF NOT EXISTS consultant_leave_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  leave_date date NOT NULL,
  hours numeric(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  note text NULL,
  created_by_email text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consultant_leave_days_unique
    UNIQUE (consultant_id, project_id, leave_date)
);

CREATE INDEX IF NOT EXISTS consultant_leave_days_consultant_date_idx
  ON consultant_leave_days (consultant_id, leave_date);

CREATE INDEX IF NOT EXISTS consultant_leave_days_date_idx
  ON consultant_leave_days (leave_date);

CREATE INDEX IF NOT EXISTS consultant_leave_days_project_idx
  ON consultant_leave_days (project_id);

DROP TRIGGER IF EXISTS trg_consultant_leave_days_updated_at ON consultant_leave_days;
CREATE TRIGGER trg_consultant_leave_days_updated_at
  BEFORE UPDATE ON consultant_leave_days
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION consultant_leave_days_assert_absence_project()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM projects p WHERE p.id = NEW.project_id AND p.type = 'absence'
  ) THEN
    RAISE EXCEPTION 'consultant_leave_days.project_id must reference an absence project';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consultant_leave_days_absence_project ON consultant_leave_days;
CREATE TRIGGER trg_consultant_leave_days_absence_project
  BEFORE INSERT OR UPDATE OF project_id ON consultant_leave_days
  FOR EACH ROW
  EXECUTE FUNCTION consultant_leave_days_assert_absence_project();

COMMIT;
