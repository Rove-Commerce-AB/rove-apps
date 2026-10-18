-- Align consultant hard-delete with customer: do not cascade-wipe time/planning history.
-- Application code also blocks delete when history exists; this enforces it in the DB.

-- time_report_entry_lines.consultant_id: CASCADE → RESTRICT
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public'
    AND rel.relname = 'time_report_entry_lines'
    AND c.contype = 'f'
    AND pg_get_constraintdef(c.oid) ILIKE '%consultant_id%REFERENCES%consultants%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE time_report_entry_lines DROP CONSTRAINT %I', con_name);
  END IF;
  ALTER TABLE time_report_entry_lines
    ADD CONSTRAINT time_report_entry_lines_consultant_id_fkey
    FOREIGN KEY (consultant_id) REFERENCES consultants (id) ON DELETE RESTRICT;
END $$;

-- time_report_entries.consultant_id: CASCADE → RESTRICT
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public'
    AND rel.relname = 'time_report_entries'
    AND c.contype = 'f'
    AND pg_get_constraintdef(c.oid) ILIKE '%consultant_id%REFERENCES%consultants%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE time_report_entries DROP CONSTRAINT %I', con_name);
  END IF;
  ALTER TABLE time_report_entries
    ADD CONSTRAINT time_report_entries_consultant_id_fkey
    FOREIGN KEY (consultant_id) REFERENCES consultants (id) ON DELETE RESTRICT;
END $$;

-- allocations.consultant_id: CASCADE → RESTRICT (when FK exists)
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public'
    AND rel.relname = 'allocations'
    AND c.contype = 'f'
    AND pg_get_constraintdef(c.oid) ILIKE '%consultant_id%REFERENCES%consultants%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE allocations DROP CONSTRAINT %I', con_name);
    ALTER TABLE allocations
      ADD CONSTRAINT allocations_consultant_id_fkey
      FOREIGN KEY (consultant_id) REFERENCES consultants (id) ON DELETE RESTRICT;
  END IF;
END $$;
