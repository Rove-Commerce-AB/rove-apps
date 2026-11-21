-- Owner on radar prospects (staff app_users), same idea as Work issue owner.

ALTER TABLE radar_prospects
  ADD COLUMN IF NOT EXISTS owner_app_user_id UUID
    REFERENCES app_users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS radar_prospects_owner_idx
  ON radar_prospects (owner_app_user_id)
  WHERE owner_app_user_id IS NOT NULL;
