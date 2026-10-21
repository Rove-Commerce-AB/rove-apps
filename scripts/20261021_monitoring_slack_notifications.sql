-- Add webhook destinations for Rove Support monitoring.
-- Apply to rove-erp-test before rove-erp. Safe to rerun.
-- A webhook URL is a credential: never put real URLs in this file or logs.

BEGIN;

CREATE TABLE IF NOT EXISTS monitoring.slack_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  webhook_url text NOT NULL,
  username text NOT NULL,
  channel_name text NOT NULL,
  default_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT slack_notifications_name_nonempty CHECK (btrim(name) <> ''),
  CONSTRAINT slack_notifications_username_nonempty CHECK (btrim(username) <> ''),
  CONSTRAINT slack_notifications_channel_name_valid CHECK (
    channel_name ~ '^#[^[:space:]]+$'
  ),
  CONSTRAINT slack_notifications_webhook_url_valid CHECK (
    webhook_url ~ '^https://hooks[.]slack[.]com/services/[A-Za-z0-9/_-]+$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS slack_notifications_name_unique_idx
  ON monitoring.slack_notifications (lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS slack_notifications_webhook_url_unique_idx
  ON monitoring.slack_notifications (webhook_url);

COMMENT ON TABLE monitoring.slack_notifications IS
  'Incoming Slack webhook destinations. webhook_url is a credential; restrict SELECT access.';
COMMENT ON COLUMN monitoring.slack_notifications.username IS
  'Descriptive name only; current Slack app webhooks cannot override the posting username.';
COMMENT ON COLUMN monitoring.slack_notifications.channel_name IS
  'Descriptive channel only; the webhook itself selects the destination channel.';
COMMENT ON COLUMN monitoring.slack_notifications.default_enabled IS
  'When creating a monitor, the UI should create an enabled route for this destination if true.';

CREATE TABLE IF NOT EXISTS monitoring.monitor_slack_notifications (
  monitor_id uuid NOT NULL REFERENCES monitoring.monitors(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES monitoring.slack_notifications(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  alert_on_down boolean NOT NULL DEFAULT true,
  alert_on_recovery boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (monitor_id, notification_id),
  CONSTRAINT monitor_slack_notifications_alert_type_valid CHECK (
    NOT enabled OR alert_on_down OR alert_on_recovery
  )
);

CREATE INDEX IF NOT EXISTS monitor_slack_notifications_notification_idx
  ON monitoring.monitor_slack_notifications (notification_id);

-- Defaults apply only when a monitor is created; changing a destination's
-- default_enabled flag does not rewrite routes on existing monitors.
CREATE OR REPLACE FUNCTION monitoring.attach_default_slack_notifications()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO monitoring.monitor_slack_notifications (monitor_id, notification_id)
  SELECT NEW.id, id
  FROM monitoring.slack_notifications
  WHERE default_enabled
  ON CONFLICT (monitor_id, notification_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS monitors_attach_default_slack_notifications
  ON monitoring.monitors;
CREATE TRIGGER monitors_attach_default_slack_notifications
AFTER INSERT ON monitoring.monitors
FOR EACH ROW
EXECUTE FUNCTION monitoring.attach_default_slack_notifications();

COMMIT;

-- Read-only verification result for the SQL runner.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'monitoring'
  AND table_name IN ('slack_notifications', 'monitor_slack_notifications')
ORDER BY table_name;
