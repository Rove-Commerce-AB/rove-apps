-- Travel expense claims (Reseräkning) for Rove staff under Time report.
-- Safe to rerun.

BEGIN;

CREATE TABLE IF NOT EXISTS travel_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  destination TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',
  departure_date DATE,
  return_date DATE,
  form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS travel_expenses_user_updated_idx
  ON travel_expenses (app_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS travel_expenses_user_departure_idx
  ON travel_expenses (app_user_id, departure_date DESC NULLS LAST);

DROP TRIGGER IF EXISTS trg_travel_expenses_updated_at ON travel_expenses;
CREATE TRIGGER trg_travel_expenses_updated_at
  BEFORE UPDATE ON travel_expenses
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

COMMIT;
