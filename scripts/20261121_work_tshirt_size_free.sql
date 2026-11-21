-- Add t-shirt estimate size `free` (free of charge).
-- Apply to rove-erp-test before rove-erp. Safe to rerun.

BEGIN;

ALTER TABLE work_issues
  DROP CONSTRAINT IF EXISTS work_issues_estimate_size_check;

ALTER TABLE work_issues
  ADD CONSTRAINT work_issues_estimate_size_check
  CHECK (
    estimate_size IS NULL
    OR estimate_size IN ('xs', 's', 'm', 'l', 'xl', 'free')
  );

COMMENT ON COLUMN work_issues.estimate_size IS
  'T-shirt size when work_projects.estimate_unit is tshirt (xs–xl or free); otherwise unused.';

-- Catalog tables stay priced sizes only (xs–xl). Snapshot tables allow free.

ALTER TABLE work_issue_scope_approvals
  DROP CONSTRAINT IF EXISTS work_issue_scope_approvals_size_check;

ALTER TABLE work_issue_scope_approvals
  ADD CONSTRAINT work_issue_scope_approvals_size_check
  CHECK (size IN ('xs', 's', 'm', 'l', 'xl', 'free'));

ALTER TABLE work_issue_deliveries
  DROP CONSTRAINT IF EXISTS work_issue_deliveries_size_check;

ALTER TABLE work_issue_deliveries
  ADD CONSTRAINT work_issue_deliveries_size_check
  CHECK (size IN ('xs', 's', 'm', 'l', 'xl', 'free'));

-- Looker snapshot view uses the same size domain when recreated from script.
-- Live constraint on work_issue_scope_approvals is updated above.

COMMIT;
