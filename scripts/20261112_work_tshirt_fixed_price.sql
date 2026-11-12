-- Work t-shirt sizes + optional fixed price by size (customer → project override).
-- Replaces estimate unit `points` with `tshirt`. Safe to rerun.

BEGIN;

-- ---------------------------------------------------------------------------
-- work_projects: unit check + fixed-price flag
-- ---------------------------------------------------------------------------
UPDATE work_projects
SET estimate_unit = 'tshirt'
WHERE estimate_unit = 'points';

ALTER TABLE work_projects
  DROP CONSTRAINT IF EXISTS work_projects_estimate_unit_check;
ALTER TABLE work_projects
  ADD CONSTRAINT work_projects_estimate_unit_check
  CHECK (estimate_unit IN ('hours', 'currency', 'tshirt'));

ALTER TABLE work_projects
  ADD COLUMN IF NOT EXISTS fixed_price_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN work_projects.estimate_unit IS
  'Unit for estimates on this project: hours, currency (customer billing_currency), or tshirt (XS–XL).';
COMMENT ON COLUMN work_projects.fixed_price_enabled IS
  'When estimate_unit is tshirt: use customer/project size prices for display (not billing).';

-- ---------------------------------------------------------------------------
-- work_issues: t-shirt size
-- ---------------------------------------------------------------------------
ALTER TABLE work_issues
  ADD COLUMN IF NOT EXISTS estimate_size text;

ALTER TABLE work_issues
  DROP CONSTRAINT IF EXISTS work_issues_estimate_size_check;
ALTER TABLE work_issues
  ADD CONSTRAINT work_issues_estimate_size_check
  CHECK (
    estimate_size IS NULL
    OR estimate_size IN ('xs', 's', 'm', 'l', 'xl')
  );

COMMENT ON COLUMN work_issues.estimate_size IS
  'T-shirt size when work_projects.estimate_unit is tshirt; otherwise unused.';
COMMENT ON COLUMN work_issues.estimate_hours IS
  'Numeric estimate value; unit is work_projects.estimate_unit (hours or currency). Unused for tshirt.';

-- ---------------------------------------------------------------------------
-- Size price catalogs (planner project_id for project overrides)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_size_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  size text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'SEK',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_size_prices_size_check
    CHECK (size IN ('xs', 's', 'm', 'l', 'xl')),
  CONSTRAINT customer_size_prices_amount_check
    CHECK (amount >= 0),
  CONSTRAINT customer_size_prices_customer_size_key
    UNIQUE (customer_id, size)
);

CREATE TABLE IF NOT EXISTS project_size_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  size text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'SEK',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_size_prices_size_check
    CHECK (size IN ('xs', 's', 'm', 'l', 'xl')),
  CONSTRAINT project_size_prices_amount_check
    CHECK (amount >= 0),
  CONSTRAINT project_size_prices_project_size_key
    UNIQUE (project_id, size)
);

CREATE INDEX IF NOT EXISTS customer_size_prices_customer_id_idx
  ON customer_size_prices (customer_id);
CREATE INDEX IF NOT EXISTS project_size_prices_project_id_idx
  ON project_size_prices (project_id);

COMMIT;
