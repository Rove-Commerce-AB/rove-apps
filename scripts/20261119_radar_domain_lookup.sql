-- Domain enrichment: heuristic lookup status + allow source=lookup
ALTER TABLE radar_companies
  ADD COLUMN IF NOT EXISTS domain_lookup_status TEXT
    CHECK (
      domain_lookup_status IS NULL
      OR domain_lookup_status IN ('found', 'not_found', 'skipped')
    );

ALTER TABLE radar_companies
  ADD COLUMN IF NOT EXISTS domain_lookup_at TIMESTAMPTZ;

ALTER TABLE radar_domains
  DROP CONSTRAINT IF EXISTS radar_domains_source_check;

ALTER TABLE radar_domains
  ADD CONSTRAINT radar_domains_source_check
  CHECK (source IN ('manual', 'customer', 'import', 'demo', 'lookup'));

UPDATE radar_job_configs
SET max_items_per_run = 200
WHERE job_type = 'domain_enrichment'
  AND max_items_per_run <= 100;
