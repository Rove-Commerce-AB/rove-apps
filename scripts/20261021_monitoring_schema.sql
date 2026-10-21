-- Rove Support monitoring tables in the existing rove-erp PostgreSQL database.
-- Additive and safe to rerun. Apply to rove-erp-test before rove-erp.
-- No existing public table, role, search_path, or customer row is changed.

BEGIN;

CREATE SCHEMA IF NOT EXISTS monitoring;

CREATE TABLE IF NOT EXISTS monitoring.monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  customer_name_snapshot text NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  interval_seconds integer NOT NULL DEFAULT 60,
  retry_delay_seconds integer,
  timeout_ms integer NOT NULL DEFAULT 10000,
  expected_status_min integer NOT NULL DEFAULT 200,
  expected_status_max integer NOT NULL DEFAULT 299,
  auth_secret_ref text,
  next_due_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monitors_name_nonempty CHECK (btrim(name) <> ''),
  CONSTRAINT monitors_url_nonempty CHECK (btrim(url) <> ''),
  CONSTRAINT monitors_interval_range CHECK (interval_seconds BETWEEN 30 AND 86400),
  CONSTRAINT monitors_retry_delay_positive CHECK (retry_delay_seconds IS NULL OR retry_delay_seconds > 0),
  CONSTRAINT monitors_timeout_positive CHECK (timeout_ms > 0),
  CONSTRAINT monitors_expected_status_range CHECK (
    expected_status_min BETWEEN 100 AND 599
    AND expected_status_max BETWEEN expected_status_min AND 599
  )
);

CREATE INDEX IF NOT EXISTS monitors_due_idx
  ON monitoring.monitors (next_due_at) WHERE enabled;
CREATE INDEX IF NOT EXISTS monitors_customer_idx
  ON monitoring.monitors (customer_id);

CREATE TABLE IF NOT EXISTS monitoring.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id uuid NOT NULL REFERENCES monitoring.monitors(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL,
  confirmed_at timestamptz NOT NULL,
  recovered_at timestamptz,
  last_failure_at timestamptz NOT NULL,
  failure_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incidents_time_order CHECK (
    confirmed_at >= started_at
    AND last_failure_at >= started_at
    AND (recovered_at IS NULL OR recovered_at >= started_at)
  ),
  CONSTRAINT incidents_failure_count_positive CHECK (failure_count > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS incidents_one_open_per_monitor_idx
  ON monitoring.incidents (monitor_id) WHERE recovered_at IS NULL;
CREATE INDEX IF NOT EXISTS incidents_monitor_started_idx
  ON monitoring.incidents (monitor_id, started_at DESC);

CREATE TABLE IF NOT EXISTS monitoring.monitor_state (
  monitor_id uuid PRIMARY KEY REFERENCES monitoring.monitors(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'unknown',
  last_checked_at timestamptz,
  last_up_at timestamptz,
  last_down_at timestamptz,
  last_latency_ms integer,
  active_incident_id uuid REFERENCES monitoring.incidents(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monitor_state_status_valid CHECK (status IN ('unknown', 'up', 'down')),
  CONSTRAINT monitor_state_latency_nonnegative CHECK (
    last_latency_ms IS NULL OR last_latency_ms >= 0
  )
);

CREATE TABLE IF NOT EXISTS monitoring.check_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id uuid NOT NULL REFERENCES monitoring.monitors(id) ON DELETE RESTRICT,
  scheduled_at timestamptz NOT NULL,
  phase text NOT NULL DEFAULT 'ready',
  retry_due_at timestamptz,
  lease_until timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  result_event_id uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_runs_monitor_schedule_unique UNIQUE (monitor_id, scheduled_at),
  CONSTRAINT check_runs_phase_valid CHECK (
    phase IN ('ready', 'checking', 'waiting_retry', 'complete')
  ),
  CONSTRAINT check_runs_attempt_count_range CHECK (attempt_count BETWEEN 0 AND 2)
);

CREATE INDEX IF NOT EXISTS check_runs_ready_idx
  ON monitoring.check_runs (scheduled_at) WHERE phase = 'ready';
CREATE INDEX IF NOT EXISTS check_runs_retry_idx
  ON monitoring.check_runs (retry_due_at) WHERE phase = 'waiting_retry';
CREATE INDEX IF NOT EXISTS check_runs_lease_idx
  ON monitoring.check_runs (lease_until) WHERE phase = 'checking';

CREATE TABLE IF NOT EXISTS monitoring.slack_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_channel_id text NOT NULL UNIQUE,
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT slack_channels_id_nonempty CHECK (btrim(slack_channel_id) <> ''),
  CONSTRAINT slack_channels_name_nonempty CHECK (btrim(display_name) <> '')
);

CREATE TABLE IF NOT EXISTS monitoring.monitor_slack_channels (
  monitor_id uuid NOT NULL REFERENCES monitoring.monitors(id) ON DELETE RESTRICT,
  channel_id uuid NOT NULL REFERENCES monitoring.slack_channels(id) ON DELETE RESTRICT,
  alert_on_down boolean NOT NULL DEFAULT true,
  alert_on_recovery boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (monitor_id, channel_id),
  CONSTRAINT monitor_slack_channels_enabled CHECK (alert_on_down OR alert_on_recovery)
);

CREATE INDEX IF NOT EXISTS monitor_slack_channels_channel_idx
  ON monitoring.monitor_slack_channels (channel_id);

CREATE TABLE IF NOT EXISTS monitoring.alert_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES monitoring.incidents(id) ON DELETE RESTRICT,
  channel_id uuid NOT NULL REFERENCES monitoring.slack_channels(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alert_outbox_incident_channel_event_unique
    UNIQUE (incident_id, channel_id, event_type),
  CONSTRAINT alert_outbox_event_type_valid CHECK (event_type IN ('down', 'recovery')),
  CONSTRAINT alert_outbox_status_valid CHECK (
    status IN ('pending', 'sending', 'sent', 'failed')
  ),
  CONSTRAINT alert_outbox_attempt_count_nonnegative CHECK (attempt_count >= 0)
);

CREATE INDEX IF NOT EXISTS alert_outbox_pending_idx
  ON monitoring.alert_outbox (next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS alert_outbox_lease_idx
  ON monitoring.alert_outbox (lease_until) WHERE status = 'sending';

CREATE TABLE IF NOT EXISTS monitoring.history_export_outbox (
  event_id uuid PRIMARY KEY,
  monitor_id uuid NOT NULL REFERENCES monitoring.monitors(id) ON DELETE RESTRICT,
  checked_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  exported_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT history_export_outbox_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT history_export_outbox_attempt_count_nonnegative CHECK (attempt_count >= 0)
);

CREATE INDEX IF NOT EXISTS history_export_outbox_pending_idx
  ON monitoring.history_export_outbox (next_attempt_at)
  WHERE exported_at IS NULL;
CREATE INDEX IF NOT EXISTS history_export_outbox_exported_idx
  ON monitoring.history_export_outbox (exported_at)
  WHERE exported_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS monitoring.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE DEFAULT 'global',
  default_interval_seconds integer NOT NULL DEFAULT 60,
  default_timeout_ms integer NOT NULL DEFAULT 10000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settings_singleton CHECK (setting_key = 'global'),
  CONSTRAINT settings_interval_range CHECK (default_interval_seconds BETWEEN 30 AND 86400),
  CONSTRAINT settings_timeout_positive CHECK (default_timeout_ms > 0)
);

INSERT INTO monitoring.settings (setting_key)
VALUES ('global')
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS monitoring.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT audit_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS audit_events_changed_idx
  ON monitoring.audit_events (changed_at DESC);

CREATE TABLE IF NOT EXISTS monitoring.worker_heartbeat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_key text NOT NULL UNIQUE,
  last_seen_at timestamptz NOT NULL,
  last_check_at timestamptz,
  last_export_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worker_heartbeat_key_nonempty CHECK (btrim(worker_key) <> '')
);

COMMIT;

-- Read-only verification result for the SQL runner.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'monitoring' AND table_type = 'BASE TABLE'
ORDER BY table_name;
