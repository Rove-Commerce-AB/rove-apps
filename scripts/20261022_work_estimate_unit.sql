-- Per-project estimate unit: hours | currency | points.
-- work_issues.estimate_hours remains the numeric estimate value (unit-agnostic).
-- Currency display inherits customers.billing_currency.
-- Safe to rerun.

BEGIN;

ALTER TABLE work_projects
  ADD COLUMN IF NOT EXISTS estimate_unit text NOT NULL DEFAULT 'hours';

ALTER TABLE work_projects
  DROP CONSTRAINT IF EXISTS work_projects_estimate_unit_check;
ALTER TABLE work_projects
  ADD CONSTRAINT work_projects_estimate_unit_check
  CHECK (estimate_unit IN ('hours', 'currency', 'points'));

COMMENT ON COLUMN work_projects.estimate_unit IS
  'Unit for work_issues.estimate_hours on this project: hours, currency (customer billing_currency), or points.';

COMMENT ON COLUMN work_issues.estimate_hours IS
  'Numeric estimate value; unit is work_projects.estimate_unit (hours, currency, or points).';

COMMIT;
