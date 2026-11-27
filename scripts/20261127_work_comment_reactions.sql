-- Work comment reactions + notification prefs for reaction events.
-- Safe to rerun.

BEGIN;

CREATE TABLE IF NOT EXISTS work_issue_comment_reactions (
  comment_id uuid NOT NULL REFERENCES work_issue_comments(id) ON DELETE CASCADE,
  app_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  reaction text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, app_user_id, reaction),
  CONSTRAINT work_issue_comment_reactions_type_valid
    CHECK (reaction IN ('seen', 'agree', 'good', 'thanks'))
);

CREATE INDEX IF NOT EXISTS work_issue_comment_reactions_comment_idx
  ON work_issue_comment_reactions (comment_id);

ALTER TABLE user_notification_prefs
  ADD COLUMN IF NOT EXISTS work_comment_reaction_in_app boolean NOT NULL DEFAULT true;

ALTER TABLE user_notification_prefs
  ADD COLUMN IF NOT EXISTS work_comment_reaction_email boolean NOT NULL DEFAULT true;

COMMIT;
