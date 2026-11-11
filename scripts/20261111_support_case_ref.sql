-- Stable Support case reference (SUP-n), independent of Work board moves.
-- Apply to rove-erp-test before rove-erp. Safe to rerun.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS support_case_ref_seq
  AS bigint
  START WITH 10001
  INCREMENT BY 1
  MINVALUE 10001
  OWNED BY NONE;

ALTER TABLE work_issues
  ADD COLUMN IF NOT EXISTS support_case_number bigint NULL;

ALTER TABLE work_issues
  ADD COLUMN IF NOT EXISTS support_ack_sent_at timestamptz NULL;

CREATE UNIQUE INDEX IF NOT EXISTS work_issues_support_case_number_uidx
  ON work_issues (support_case_number)
  WHERE support_case_number IS NOT NULL;

COMMENT ON COLUMN work_issues.support_case_number IS
  'Stable Support case id formatted as SUP-{n}; survives board moves.';
COMMENT ON COLUMN work_issues.support_ack_sent_at IS
  'When the automatic thank-you / case-number ack was sent to the reporter.';

COMMIT;
