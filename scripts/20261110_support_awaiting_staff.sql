-- Staff signal: customer sent follow-up mail on an existing support case.
-- Safe to rerun.

BEGIN;

ALTER TABLE work_issues
  ADD COLUMN IF NOT EXISTS support_awaiting_staff_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS work_issues_support_awaiting_staff_idx
  ON work_issues (support_awaiting_staff_at DESC NULLS LAST)
  WHERE support_awaiting_staff_at IS NOT NULL;

COMMENT ON COLUMN work_issues.support_awaiting_staff_at IS
  'When set, customer follow-up mail is awaiting a staff email reply or visible comment.';

-- Backfill open cases where latest thread inbound is still unanswered.
UPDATE work_issues i
SET support_awaiting_staff_at = sub.last_thread_at
FROM (
  SELECT m.work_issue_id,
         MAX(COALESCE(m.received_at, m.created_at)) AS last_thread_at
  FROM support_mail_messages m
  WHERE m.match_kind = 'thread'
  GROUP BY m.work_issue_id
) sub
WHERE i.id = sub.work_issue_id
  AND i.support_awaiting_staff_at IS NULL
  AND sub.last_thread_at > COALESCE(
    (
      SELECT MAX(COALESCE(o.received_at, o.created_at))
      FROM support_mail_messages o
      WHERE o.work_issue_id = i.id
        AND o.match_kind = 'outbound'
    ),
    '-infinity'::timestamptz
  )
  AND sub.last_thread_at > COALESCE(
    (
      SELECT MAX(c.created_at)
      FROM work_issue_comments c
      WHERE c.issue_id = i.id
        AND COALESCE(c.is_internal, false) = false
        AND c.body NOT LIKE 'Follow-up email from %'
    ),
    '-infinity'::timestamptz
  );

COMMIT;
