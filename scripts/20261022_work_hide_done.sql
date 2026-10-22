-- DEPRECATED: superseded by scripts/20261022_work_issue_hidden_from_board.sql
-- (per-issue hidden_from_board_at). Safe no-op if that migration already ran.

BEGIN;

ALTER TABLE work_projects
  DROP COLUMN IF EXISTS hide_done;

COMMIT;
