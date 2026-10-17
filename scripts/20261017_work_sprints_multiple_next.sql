-- Allow multiple upcoming (status = 'next') sprints per project so teams can
-- plan several sprints ahead. Closing the current sprint still promotes the
-- earliest upcoming sprint (by starts_on).
DROP INDEX IF EXISTS work_sprints_one_next_idx;
