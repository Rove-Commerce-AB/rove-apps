-- Fortnox PAXML payroll export support:
-- - employment_number on consultants (matches Fortnox anställningsnummer)
-- - absence_code on absence projects (PAXml tidkod, e.g. SEM, SJK, VAB)

ALTER TABLE consultants
  ADD COLUMN IF NOT EXISTS employment_number text;

COMMENT ON COLUMN consultants.employment_number IS
  'Fortnox / payroll employment number (anställningsnummer). Required for PAXML export.';

CREATE UNIQUE INDEX IF NOT EXISTS consultants_employment_number_uidx
  ON consultants (employment_number)
  WHERE employment_number IS NOT NULL AND btrim(employment_number) <> '';

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS absence_code text;

COMMENT ON COLUMN projects.absence_code IS
  'PAXml tidkod for absence projects (SEM, SJK, VAB, FPE, KOM, PEM, …). Null when type <> absence.';

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_absence_code_when_absence;

ALTER TABLE projects
  ADD CONSTRAINT projects_absence_code_when_absence
  CHECK (
    absence_code IS NULL
    OR type = 'absence'
  );

-- Seed PAXml codes for known Rove absence projects (safe to re-run).
UPDATE projects
SET absence_code = 'SEM'
WHERE type = 'absence'
  AND name = 'Vacation'
  AND absence_code IS DISTINCT FROM 'SEM';

UPDATE projects
SET absence_code = 'SJK'
WHERE type = 'absence'
  AND name = 'Sick leave'
  AND absence_code IS DISTINCT FROM 'SJK';

UPDATE projects
SET absence_code = 'VAB'
WHERE type = 'absence'
  AND name = 'VAB'
  AND absence_code IS DISTINCT FROM 'VAB';

UPDATE projects
SET absence_code = 'FPE'
WHERE type = 'absence'
  AND name = 'Parental leave'
  AND absence_code IS DISTINCT FROM 'FPE';
