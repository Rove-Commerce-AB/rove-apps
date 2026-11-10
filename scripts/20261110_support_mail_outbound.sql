-- Allow outbound reply rows on support_mail_messages.
BEGIN;

ALTER TABLE support_mail_messages
  DROP CONSTRAINT IF EXISTS support_mail_messages_match_kind_check;

ALTER TABLE support_mail_messages
  ADD CONSTRAINT support_mail_messages_match_kind_check
  CHECK (match_kind IN ('exact', 'domain', 'inbox', 'thread', 'outbound'));

COMMIT;
