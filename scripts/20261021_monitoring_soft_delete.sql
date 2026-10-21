-- Retain monitor history while allowing admins to remove monitors from service.
-- Apply to rove-erp-test before rove-erp, before deploying the corresponding app code.
-- Safe to rerun.

BEGIN;

ALTER TABLE monitoring.monitors
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS monitors_active_name_idx
  ON monitoring.monitors (name) WHERE deleted_at IS NULL;

COMMIT;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'monitoring'
  AND table_name = 'monitors'
  AND column_name = 'deleted_at';
