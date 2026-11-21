-- User notification preferences + email digest outbox (Work assign/comment/mention).
-- Apply to rove-erp-test before rove-erp. Safe to rerun.

BEGIN;

CREATE TABLE IF NOT EXISTS user_notification_prefs (
  app_user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  work_assign_in_app boolean NOT NULL DEFAULT true,
  work_assign_email boolean NOT NULL DEFAULT true,
  work_comment_in_app boolean NOT NULL DEFAULT true,
  work_comment_email boolean NOT NULL DEFAULT true,
  work_mention_in_app boolean NOT NULL DEFAULT true,
  -- Mentions email is always on in app logic; column kept for consistency.
  work_mention_email boolean NOT NULL DEFAULT true,
  work_done_in_app boolean NOT NULL DEFAULT true,
  work_done_email boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  -- Soft link only (no FK): deploy role may lack REFERENCES on user_notifications.
  notification_id uuid,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text,
  CONSTRAINT notification_email_outbox_status_valid
    CHECK (status IN ('pending', 'sending', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS notification_email_outbox_pending_idx
  ON notification_email_outbox (app_user_id, created_at)
  WHERE status = 'pending';

COMMIT;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('user_notification_prefs', 'notification_email_outbox')
ORDER BY table_name;
