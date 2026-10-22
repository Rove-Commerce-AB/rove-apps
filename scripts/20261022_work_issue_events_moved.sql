-- Allow work_issue_events.kind = 'moved' (cross-board routing from Support Inbox).
-- Safe to rerun.

BEGIN;

ALTER TABLE work_issue_events
  DROP CONSTRAINT IF EXISTS work_issue_events_kind_check;
ALTER TABLE work_issue_events
  ADD CONSTRAINT work_issue_events_kind_check
  CHECK (kind IN (
    'created',
    'title',
    'status',
    'owner',
    'assignees',
    'labels',
    'description',
    'current_state',
    'next_step',
    'comment',
    'file',
    'relation',
    'estimate',
    'priority',
    'requirement',
    'out_of_scope',
    'reference',
    'sprint',
    'schedule',
    'type',
    'component',
    'pre_deploy',
    'moved'
  ));

COMMIT;
