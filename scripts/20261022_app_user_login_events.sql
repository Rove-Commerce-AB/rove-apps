-- Login history for app users (used for customer password logins).
-- Safe to rerun.

BEGIN;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS app_user_login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  success BOOLEAN NOT NULL,
  provider TEXT NOT NULL DEFAULT 'customer-password',
  ip TEXT NULL,
  user_agent TEXT NULL
);

CREATE INDEX IF NOT EXISTS app_user_login_events_user_occurred_idx
  ON app_user_login_events (app_user_id, occurred_at DESC);

COMMENT ON TABLE app_user_login_events IS
  'Auth attempt history; written on customer-password sign-in (success and failure).';

COMMIT;
