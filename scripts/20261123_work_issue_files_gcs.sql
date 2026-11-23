-- Work issue files: store blobs in GCS; DB keeps metadata (+ legacy BYTEA during migration).
BEGIN;

ALTER TABLE work_issue_files
  ADD COLUMN IF NOT EXISTS storage_key TEXT;

ALTER TABLE work_issue_files
  ALTER COLUMN content DROP NOT NULL;

-- Every row must have either a GCS object key or legacy BYTEA content.
ALTER TABLE work_issue_files
  DROP CONSTRAINT IF EXISTS work_issue_files_payload_chk;

ALTER TABLE work_issue_files
  ADD CONSTRAINT work_issue_files_payload_chk
  CHECK (
    (storage_key IS NOT NULL AND length(btrim(storage_key)) > 0)
    OR content IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS work_issue_files_storage_key_idx
  ON work_issue_files (storage_key)
  WHERE storage_key IS NOT NULL;

COMMIT;
