-- Queue Slack webhook deliveries after a monitor's final failed check or recovery.
-- Apply to rove-erp-test before rove-erp. Safe to rerun.

BEGIN;

CREATE TABLE IF NOT EXISTS monitoring.slack_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES monitoring.incidents(id) ON DELETE RESTRICT,
  notification_id uuid NOT NULL REFERENCES monitoring.slack_notifications(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT slack_notification_outbox_event_type_valid
    CHECK (event_type IN ('down', 'recovery')),
  CONSTRAINT slack_notification_outbox_status_valid
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  CONSTRAINT slack_notification_outbox_attempt_count_nonnegative
    CHECK (attempt_count >= 0),
  CONSTRAINT slack_notification_outbox_incident_notification_event_unique
    UNIQUE (incident_id, notification_id, event_type)
);

CREATE INDEX IF NOT EXISTS slack_notification_outbox_pending_idx
  ON monitoring.slack_notification_outbox (next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS slack_notification_outbox_lease_idx
  ON monitoring.slack_notification_outbox (lease_until)
  WHERE status = 'sending';

-- The test instance may not have a worker IAM database role yet.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'rove-support-worker@continual-mind-442414-e0.iam'
  ) THEN
    GRANT SELECT ON monitoring.slack_notifications,
      monitoring.monitor_slack_notifications
      TO "rove-support-worker@continual-mind-442414-e0.iam";
    GRANT SELECT, INSERT, UPDATE ON monitoring.slack_notification_outbox
      TO "rove-support-worker@continual-mind-442414-e0.iam";
  END IF;
END;
$$;

COMMIT;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'monitoring'
  AND table_name = 'slack_notification_outbox';
