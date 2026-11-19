-- Rove Radar MVP: app catalogue, schema, customer org number, demo seed.
-- Safe to rerun. Does not grant the app to any existing users.

BEGIN;

INSERT INTO apps (key, name)
VALUES ('radar', 'Radar')
ON CONFLICT (key) DO NOTHING;

-- Optional link key for matching Radar companies to Rove customers.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS organization_number TEXT;

UPDATE customers
SET organization_number = NULLIF(regexp_replace(organization_number, '[^0-9]', '', 'g'), '')
WHERE organization_number IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_organization_number_digits_chk'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_organization_number_digits_chk
      CHECK (
        organization_number IS NULL
        OR organization_number ~ '^[0-9]{10}$'
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS customers_organization_number_uidx
  ON customers (organization_number)
  WHERE organization_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Audiences
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS radar_audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused')),
  priority INTEGER NOT NULL DEFAULT 100,
  sni_prefixes TEXT[] NOT NULL DEFAULT '{}',
  counties TEXT[] NOT NULL DEFAULT '{}',
  employee_min INTEGER,
  employee_max INTEGER,
  revenue_min_sek BIGINT,
  revenue_max_sek BIGINT,
  estimated_company_count INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_radar_audiences_updated_at ON radar_audiences;
CREATE TRIGGER trg_radar_audiences_updated_at
  BEFORE UPDATE ON radar_audiences
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Companies
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS radar_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_number TEXT NOT NULL,
  name TEXT NOT NULL,
  legal_form TEXT,
  county TEXT,
  municipality TEXT,
  sni_code TEXT,
  sni_description TEXT,
  employee_count INTEGER,
  revenue_sek BIGINT,
  financials_origin TEXT NOT NULL DEFAULT 'unknown'
    CHECK (financials_origin IN ('unknown', 'demo', 'licensed')),
  business_model TEXT
    CHECK (
      business_model IS NULL
      OR business_model IN ('d2c', 'b2b', 'wholesale', 'other')
    ),
  source TEXT NOT NULL DEFAULT 'bolagsverket',
  source_ref TEXT,
  source_fetched_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  matched_customer_id UUID REFERENCES customers (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT radar_companies_orgnr_digits_chk
    CHECK (organization_number ~ '^[0-9]{10}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS radar_companies_orgnr_uidx
  ON radar_companies (organization_number);

CREATE INDEX IF NOT EXISTS radar_companies_sni_idx
  ON radar_companies (sni_code);

CREATE INDEX IF NOT EXISTS radar_companies_county_idx
  ON radar_companies (county);

CREATE INDEX IF NOT EXISTS radar_companies_matched_customer_idx
  ON radar_companies (matched_customer_id)
  WHERE matched_customer_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_radar_companies_updated_at ON radar_companies;
CREATE TRIGGER trg_radar_companies_updated_at
  BEFORE UPDATE ON radar_companies
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS radar_company_audiences (
  company_id UUID NOT NULL REFERENCES radar_companies (id) ON DELETE CASCADE,
  audience_id UUID NOT NULL REFERENCES radar_audiences (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, audience_id)
);

CREATE INDEX IF NOT EXISTS radar_company_audiences_audience_idx
  ON radar_company_audiences (audience_id);

-- ---------------------------------------------------------------------------
-- Domains & technologies
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS radar_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES radar_companies (id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'customer', 'import', 'demo')),
  content_hash TEXT,
  last_fetched_at TIMESTAMPTZ,
  last_scanned_at TIMESTAMPTZ,
  scan_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (scan_status IN ('pending', 'scanned', 'failed', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS radar_domains_company_host_uidx
  ON radar_domains (company_id, hostname);

CREATE INDEX IF NOT EXISTS radar_domains_scan_idx
  ON radar_domains (scan_status, last_scanned_at NULLS FIRST);

DROP TRIGGER IF EXISTS trg_radar_domains_updated_at ON radar_domains;
CREATE TRIGGER trg_radar_domains_updated_at
  BEFORE UPDATE ON radar_domains
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS radar_technologies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES radar_domains (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES radar_companies (id) ON DELETE CASCADE,
  technology_key TEXT NOT NULL,
  technology_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  outcome TEXT NOT NULL DEFAULT 'identified'
    CHECK (outcome IN ('identified', 'not_identified')),
  confidence NUMERIC(4, 3) NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL DEFAULT 'webanalyze',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS radar_technologies_domain_key_outcome_uidx
  ON radar_technologies (domain_id, technology_key, outcome);

CREATE INDEX IF NOT EXISTS radar_technologies_company_idx
  ON radar_technologies (company_id);

CREATE INDEX IF NOT EXISTS radar_technologies_key_idx
  ON radar_technologies (technology_key)
  WHERE outcome = 'identified';

DROP TRIGGER IF EXISTS trg_radar_technologies_updated_at ON radar_technologies;
CREATE TRIGGER trg_radar_technologies_updated_at
  BEFORE UPDATE ON radar_technologies
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Prospects
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS radar_prospect_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES app_users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_radar_prospect_lists_updated_at ON radar_prospect_lists;
CREATE TRIGGER trg_radar_prospect_lists_updated_at
  BEFORE UPDATE ON radar_prospect_lists
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS radar_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES radar_companies (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'interesting'
    CHECK (status IN ('interesting', 'irrelevant')),
  notes TEXT,
  marked_by UUID REFERENCES app_users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS radar_prospects_company_uidx
  ON radar_prospects (company_id);

DROP TRIGGER IF EXISTS trg_radar_prospects_updated_at ON radar_prospects;
CREATE TRIGGER trg_radar_prospects_updated_at
  BEFORE UPDATE ON radar_prospects
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS radar_prospect_list_members (
  list_id UUID NOT NULL REFERENCES radar_prospect_lists (id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES radar_companies (id) ON DELETE CASCADE,
  added_by UUID REFERENCES app_users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, company_id)
);

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS radar_job_configs (
  job_type TEXT PRIMARY KEY
    CHECK (job_type IN ('company_import', 'domain_enrichment', 'tech_scan')),
  schedule_enabled BOOLEAN NOT NULL DEFAULT false,
  schedule_cron TEXT NOT NULL DEFAULT '0 3 * * *',
  paused BOOLEAN NOT NULL DEFAULT false,
  max_items_per_run INTEGER NOT NULL DEFAULT 100,
  max_parallelism INTEGER NOT NULL DEFAULT 2,
  request_delay_ms INTEGER NOT NULL DEFAULT 500,
  skip_unchanged BOOLEAN NOT NULL DEFAULT true,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_radar_job_configs_updated_at ON radar_job_configs;
CREATE TRIGGER trg_radar_job_configs_updated_at
  BEFORE UPDATE ON radar_job_configs
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

INSERT INTO radar_job_configs (job_type, schedule_enabled, paused)
VALUES
  ('company_import', false, false),
  ('domain_enrichment', false, false),
  ('tech_scan', false, false)
ON CONFLICT (job_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS radar_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL
    CHECK (job_type IN ('company_import', 'domain_enrichment', 'tech_scan')),
  trigger TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger IN ('manual', 'schedule', 'worker')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'paused', 'cancelled')),
  requested_by UUID REFERENCES app_users (id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  processed_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS radar_job_runs_type_created_idx
  ON radar_job_runs (job_type, created_at DESC);

CREATE INDEX IF NOT EXISTS radar_job_runs_status_idx
  ON radar_job_runs (status)
  WHERE status IN ('queued', 'running');

DROP TRIGGER IF EXISTS trg_radar_job_runs_updated_at ON radar_job_runs;
CREATE TRIGGER trg_radar_job_runs_updated_at
  BEFORE UPDATE ON radar_job_runs
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Demo seed (clearly marked is_demo / financials_origin = demo)
-- ---------------------------------------------------------------------------

INSERT INTO radar_audiences (
  id, name, status, priority, sni_prefixes, counties,
  employee_min, employee_max, revenue_min_sek, revenue_max_sek, estimated_company_count, notes
)
VALUES
  (
    'a1000000-0000-4000-8000-000000000001',
    'Swedish mid-market fashion D2C',
    'active',
    10,
    ARRAY['47'],
    ARRAY['Stockholm', 'Västra Götaland', 'Skåne'],
    10,
    249,
    10000000,
    500000000,
    3,
    'Demo audience for Radar MVP walkthrough'
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'B2B wholesale / manufacturing',
    'active',
    20,
    ARRAY['46', '25'],
    ARRAY[]::TEXT[],
    50,
    999,
    NULL,
    NULL,
    2,
    'Demo audience'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO radar_companies (
  id, organization_number, name, legal_form, county, municipality, sni_code, sni_description,
  employee_count, revenue_sek, financials_origin, business_model, source, source_ref,
  source_fetched_at, is_demo
)
VALUES
  (
    'c1000000-0000-4000-8000-000000000001',
    '5560000001',
    'Nordic Weave AB',
    'AB',
    'Stockholm',
    'Stockholm',
    '47710',
    'Retail sale of clothing in specialised stores',
    85,
    120000000,
    'demo',
    'd2c',
    'demo',
    'seed',
    now(),
    true
  ),
  (
    'c1000000-0000-4000-8000-000000000002',
    '5560000002',
    'Coastal Gear Sweden AB',
    'AB',
    'Västra Götaland',
    'Göteborg',
    '47721',
    'Retail sale of footwear',
    42,
    68000000,
    'demo',
    'd2c',
    'demo',
    'seed',
    now(),
    true
  ),
  (
    'c1000000-0000-4000-8000-000000000003',
    '5560000003',
    'Skåne Outdoor Retail AB',
    'AB',
    'Skåne',
    'Malmö',
    '47640',
    'Retail sale of sporting equipment',
    28,
    41000000,
    'demo',
    'd2c',
    'demo',
    'seed',
    now(),
    true
  ),
  (
    'c1000000-0000-4000-8000-000000000004',
    '5560000004',
    'Industri Parts Nordic AB',
    'AB',
    'Östergötland',
    'Linköping',
    '46690',
    'Wholesale of other machinery and equipment',
    160,
    310000000,
    'demo',
    'b2b',
    'demo',
    'seed',
    now(),
    true
  ),
  (
    'c1000000-0000-4000-8000-000000000005',
    '5560000005',
    'MetalForm Components AB',
    'AB',
    'Jönköping',
    'Jönköping',
    '25990',
    'Manufacture of other fabricated metal products',
    95,
    175000000,
    'demo',
    'wholesale',
    'demo',
    'seed',
    now(),
    true
  )
ON CONFLICT (organization_number) DO NOTHING;

INSERT INTO radar_company_audiences (company_id, audience_id)
VALUES
  ('c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000002'),
  ('c1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000002')
ON CONFLICT (company_id, audience_id) DO NOTHING;

INSERT INTO radar_domains (
  id, company_id, hostname, is_primary, source, scan_status, last_scanned_at, content_hash
)
VALUES
  (
    'd1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'nordicweave.example',
    true,
    'demo',
    'scanned',
    now(),
    'demo-hash-1'
  ),
  (
    'd1000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000002',
    'coastalgear.example',
    true,
    'demo',
    'scanned',
    now(),
    'demo-hash-2'
  ),
  (
    'd1000000-0000-4000-8000-000000000003',
    'c1000000-0000-4000-8000-000000000003',
    'skaneoutdoor.example',
    true,
    'demo',
    'pending',
    NULL,
    NULL
  ),
  (
    'd1000000-0000-4000-8000-000000000004',
    'c1000000-0000-4000-8000-000000000004',
    'industriparts.example',
    true,
    'demo',
    'scanned',
    now(),
    'demo-hash-4'
  ),
  (
    'd1000000-0000-4000-8000-000000000005',
    'c1000000-0000-4000-8000-000000000005',
    'metalform.example',
    true,
    'demo',
    'scanned',
    now(),
    'demo-hash-5'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO radar_technologies (
  domain_id, company_id, technology_key, technology_name, category, outcome, confidence, source, detected_at
)
VALUES
  (
    'd1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    'litium',
    'Litium',
    'ecommerce',
    'identified',
    0.92,
    'demo',
    now()
  ),
  (
    'd1000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000002',
    'shopify',
    'Shopify',
    'ecommerce',
    'identified',
    0.88,
    'demo',
    now()
  ),
  (
    'd1000000-0000-4000-8000-000000000004',
    'c1000000-0000-4000-8000-000000000004',
    'norce',
    'Norce',
    'ecommerce',
    'identified',
    0.85,
    'demo',
    now()
  ),
  (
    'd1000000-0000-4000-8000-000000000005',
    'c1000000-0000-4000-8000-000000000005',
    'unknown_stack',
    'Unknown stack',
    'other',
    'not_identified',
    0.40,
    'demo',
    now()
  )
ON CONFLICT (domain_id, technology_key, outcome) DO NOTHING;

INSERT INTO radar_prospect_lists (id, name, description)
VALUES (
  'e1000000-0000-4000-8000-000000000001',
  'Q1 outreach – fashion',
  'Demo prospect list'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;

SELECT key, name FROM apps WHERE key = 'radar';
SELECT job_type, schedule_enabled, paused FROM radar_job_configs ORDER BY job_type;
SELECT count(*) AS demo_companies FROM radar_companies WHERE is_demo;
