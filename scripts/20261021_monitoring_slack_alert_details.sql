-- Preserve the check result and retry settings used in Slack incident messages.
-- Apply to rove-erp-test before rove-erp. Safe to rerun.

BEGIN;

ALTER TABLE monitoring.incidents
  ADD COLUMN IF NOT EXISTS confirmation_retry_count integer,
  ADD COLUMN IF NOT EXISTS confirmation_retry_delay_seconds integer;

ALTER TABLE monitoring.slack_notification_outbox
  ADD COLUMN IF NOT EXISTS result_http_status integer,
  ADD COLUMN IF NOT EXISTS result_error_code text;

COMMIT;

SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'monitoring'
  AND ((table_name = 'incidents' AND column_name IN
    ('confirmation_retry_count', 'confirmation_retry_delay_seconds'))
    OR (table_name = 'slack_notification_outbox' AND column_name IN
    ('result_http_status', 'result_error_code')))
ORDER BY table_name, column_name;
