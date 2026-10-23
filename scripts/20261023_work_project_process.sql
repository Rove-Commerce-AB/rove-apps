-- Board process instructions (human-facing), separate from agents_md.
-- Safe to rerun.

BEGIN;

ALTER TABLE work_projects
  ADD COLUMN IF NOT EXISTS process_notes_md TEXT NOT NULL DEFAULT '';

ALTER TABLE work_projects
  ADD COLUMN IF NOT EXISTS process_steps JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
