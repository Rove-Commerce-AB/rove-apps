-- Radar: store SCB omsättningsklass / anställningsklass (not estimated SEK).
-- Safe to rerun.

BEGIN;

ALTER TABLE radar_companies
  ADD COLUMN IF NOT EXISTS oms_kl INTEGER,
  ADD COLUMN IF NOT EXISTS oms_kl_label TEXT,
  ADD COLUMN IF NOT EXISTS oms_ar INTEGER,
  ADD COLUMN IF NOT EXISTS anst_kl INTEGER,
  ADD COLUMN IF NOT EXISTS anst_kl_label TEXT,
  ADD COLUMN IF NOT EXISTS lan_kod TEXT;

ALTER TABLE radar_companies
  DROP CONSTRAINT IF EXISTS radar_companies_financials_origin_check;

ALTER TABLE radar_companies
  ADD CONSTRAINT radar_companies_financials_origin_check
  CHECK (financials_origin IN ('unknown', 'demo', 'licensed', 'scb'));

COMMIT;
