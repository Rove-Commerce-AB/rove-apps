-- Apply before deploying project instructions. Safe to rerun.

BEGIN;

ALTER TABLE work_projects
  ADD COLUMN IF NOT EXISTS agents_md TEXT NOT NULL DEFAULT '';

COMMIT;
