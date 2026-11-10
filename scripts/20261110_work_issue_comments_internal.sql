-- Internal comments: hidden from customer-role Support case views.
ALTER TABLE work_issue_comments
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN work_issue_comments.is_internal IS
  'When true, comment is staff-only and omitted from customer Support views.';
