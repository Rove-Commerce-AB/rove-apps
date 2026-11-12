-- Scope approval for fixed-price t-shirt Work issues.
-- Approving locks size + scope text/requirements until unlocked.
-- Safe to rerun.

BEGIN;

ALTER TABLE work_issues
  ADD COLUMN IF NOT EXISTS scope_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS scope_approved_by_app_user_id uuid
    REFERENCES app_users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS work_issues_scope_approved_at_idx
  ON work_issues (scope_approved_at)
  WHERE scope_approved_at IS NOT NULL;

COMMENT ON COLUMN work_issues.scope_approved_at IS
  'When set, size and scope fields are locked (fixed-price t-shirt workflow).';
COMMENT ON COLUMN work_issues.scope_approved_by_app_user_id IS
  'App user who last approved the issue scope.';

COMMIT;
