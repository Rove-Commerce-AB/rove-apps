-- SCB company directory for Radar Search (bulk-file index)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS radar_scb_directory (
  organization_number TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  legal_form TEXT,
  sni_code TEXT,
  county TEXT,
  municipality TEXT,
  postort TEXT,
  postnr TEXT,
  source_ref TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_radar_scb_directory_name_trgm
  ON radar_scb_directory USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_radar_scb_directory_sni
  ON radar_scb_directory (sni_code);

CREATE INDEX IF NOT EXISTS idx_radar_scb_directory_county
  ON radar_scb_directory (county);

-- Expand job_type checks for directory sync
ALTER TABLE radar_job_configs
  DROP CONSTRAINT IF EXISTS radar_job_configs_job_type_check;
ALTER TABLE radar_job_configs
  ADD CONSTRAINT radar_job_configs_job_type_check
  CHECK (job_type IN (
    'company_import',
    'domain_enrichment',
    'tech_scan',
    'scb_directory_sync'
  ));

ALTER TABLE radar_job_runs
  DROP CONSTRAINT IF EXISTS radar_job_runs_job_type_check;
ALTER TABLE radar_job_runs
  ADD CONSTRAINT radar_job_runs_job_type_check
  CHECK (job_type IN (
    'company_import',
    'domain_enrichment',
    'tech_scan',
    'scb_directory_sync'
  ));

INSERT INTO radar_job_configs (
  job_type,
  schedule_enabled,
  schedule_cron,
  paused,
  max_items_per_run,
  request_delay_ms
)
VALUES (
  'scb_directory_sync',
  false,
  '0 4 * * 1',
  false,
  0,
  0
)
ON CONFLICT (job_type) DO NOTHING;
