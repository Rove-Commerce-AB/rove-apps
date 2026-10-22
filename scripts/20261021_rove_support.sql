-- Rove Support: app catalogue, contracts, Work support-board flag.
-- Apply to rove-erp-test before rove-erp. Safe to rerun.

BEGIN;

INSERT INTO apps (key, name)
VALUES ('support', 'Support')
ON CONFLICT (key) DO NOTHING;

-- Customer users may be granted Work and Support only.
CREATE OR REPLACE FUNCTION enforce_customer_user_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'customer_app_users' THEN
    IF EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = NEW.customer_id AND c.is_internal
    ) THEN
      RAISE EXCEPTION 'Customer users cannot be linked to the internal customer'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM app_users u
      WHERE u.id = NEW.app_user_id AND u.role = 'customer'
    ) THEN
      RAISE EXCEPTION 'Only customer-role users can be linked to a customer'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1 FROM consultants c
      WHERE c.app_user_id = NEW.app_user_id
    ) THEN
      RAISE EXCEPTION 'A consultant cannot also be a customer user'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'consultants' THEN
    IF NEW.app_user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM app_users u
      WHERE u.id = NEW.app_user_id AND u.role = 'customer'
    ) THEN
      RAISE EXCEPTION 'A customer user cannot have a consultant profile'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'app_users' THEN
    IF NEW.role = 'customer' AND EXISTS (
      SELECT 1 FROM consultants c WHERE c.app_user_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'A consultant cannot also be a customer user'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'customers' THEN
    IF NEW.contact_app_user_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM customer_app_users cau
        WHERE cau.customer_id = NEW.id
          AND cau.app_user_id = NEW.contact_app_user_id
      ) THEN
        RAISE EXCEPTION 'Contact must be a customer user assigned to this customer'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'app_user_apps' THEN
    IF EXISTS (
      SELECT 1 FROM app_users u
      WHERE u.id = NEW.app_user_id AND u.role = 'customer'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM apps a
        WHERE a.id = NEW.app_id AND a.key IN ('work', 'support')
      ) THEN
        RAISE EXCEPTION 'Customer users can only be granted the Work or Support app'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Grant Support to existing staff who already have any app access.
INSERT INTO app_user_apps (app_user_id, app_id)
SELECT u.id, a.id
FROM app_users u
CROSS JOIN apps a
WHERE a.key = 'support'
  AND u.role IN ('admin', 'member')
  AND EXISTS (SELECT 1 FROM app_user_apps x WHERE x.app_user_id = u.id)
ON CONFLICT DO NOTHING;

ALTER TABLE work_projects
  ADD COLUMN IF NOT EXISTS is_support_board boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS work_projects_one_support_board_per_customer
  ON work_projects (customer_id)
  WHERE is_support_board AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS support_contract_tiers (
  code text PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

INSERT INTO support_contract_tiers (code, name, sort_order) VALUES
  ('bas', 'Base', 1),
  ('utokad', 'Extended', 2)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS support_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  tier_code text NOT NULL REFERENCES support_contract_tiers(code),
  active boolean NOT NULL DEFAULT true,
  value_amount numeric(12, 2),
  value_currency text NOT NULL DEFAULT 'SEK',
  starts_on date,
  ends_on date,
  notes text,
  contact_markdown text NOT NULL DEFAULT '',
  support_work_project_id uuid REFERENCES work_projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_app_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT support_contracts_value_nonnegative
    CHECK (value_amount IS NULL OR value_amount >= 0),
  CONSTRAINT support_contracts_currency_nonempty
    CHECK (btrim(value_currency) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS support_contracts_one_active_per_customer
  ON support_contracts (customer_id)
  WHERE active;

CREATE INDEX IF NOT EXISTS support_contracts_customer_idx
  ON support_contracts (customer_id);

COMMIT;

SELECT key, name FROM apps WHERE key IN ('work', 'support') ORDER BY key;
SELECT code, name FROM support_contract_tiers ORDER BY sort_order;
SELECT to_regclass('support_contracts') AS support_contracts;
