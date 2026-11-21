-- Track HubSpot company export on radar companies.

ALTER TABLE radar_companies
  ADD COLUMN IF NOT EXISTS hubspot_company_id TEXT;

ALTER TABLE radar_companies
  ADD COLUMN IF NOT EXISTS hubspot_exported_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS radar_companies_hubspot_company_id_idx
  ON radar_companies (hubspot_company_id)
  WHERE hubspot_company_id IS NOT NULL;
