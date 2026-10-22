-- Support mail → case: Gmail sync mapping + shared Support Inbox board flag.
-- Apply to rove-erp-test before rove-erp. Safe to rerun.

BEGIN;

ALTER TABLE work_projects
  ADD COLUMN IF NOT EXISTS is_support_inbox boolean NOT NULL DEFAULT false;

-- At most one active Support Inbox board in the whole system.
CREATE UNIQUE INDEX IF NOT EXISTS work_projects_one_support_inbox
  ON work_projects ((true))
  WHERE is_support_inbox AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS support_mail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id text NOT NULL,
  gmail_thread_id text NOT NULL,
  from_email text NOT NULL,
  subject text NOT NULL DEFAULT '',
  received_at timestamptz,
  customer_id uuid REFERENCES customers (id) ON DELETE SET NULL,
  match_kind text NOT NULL,
  work_issue_id uuid NOT NULL REFERENCES work_issues (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_mail_messages_match_kind_check
    CHECK (match_kind IN ('exact', 'domain', 'inbox', 'thread')),
  CONSTRAINT support_mail_messages_gmail_message_id_nonempty
    CHECK (btrim(gmail_message_id) <> ''),
  CONSTRAINT support_mail_messages_gmail_thread_id_nonempty
    CHECK (btrim(gmail_thread_id) <> ''),
  CONSTRAINT support_mail_messages_from_email_nonempty
    CHECK (btrim(from_email) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS support_mail_messages_gmail_message_id_uidx
  ON support_mail_messages (gmail_message_id);

CREATE INDEX IF NOT EXISTS support_mail_messages_gmail_thread_id_idx
  ON support_mail_messages (gmail_thread_id);

CREATE INDEX IF NOT EXISTS support_mail_messages_work_issue_id_idx
  ON support_mail_messages (work_issue_id);

CREATE INDEX IF NOT EXISTS support_mail_messages_customer_id_idx
  ON support_mail_messages (customer_id);

COMMIT;
