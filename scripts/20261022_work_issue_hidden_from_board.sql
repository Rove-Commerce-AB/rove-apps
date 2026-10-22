-- Soft-hide Done issues from the board (history kept for AI/search).
-- Replaces project-level hide_done preference.
-- Safe to rerun.

BEGIN;

ALTER TABLE work_issues
  ADD COLUMN IF NOT EXISTS hidden_from_board_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS work_issues_project_hidden_idx
  ON work_issues (project_id)
  WHERE hidden_from_board_at IS NOT NULL;

COMMENT ON COLUMN work_issues.hidden_from_board_at IS
  'When set, issue is hidden from the board Done column until unhidden or moved to a non-done status.';

-- Stop using shared column preference (safe if never applied).
ALTER TABLE work_projects
  DROP COLUMN IF EXISTS hide_done;

COMMIT;
