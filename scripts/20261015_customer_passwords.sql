-- Customer login passwords. Replaces email OTP. Safe to rerun.

BEGIN;

DROP TABLE IF EXISTS login_email_otps;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS password_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

COMMIT;
