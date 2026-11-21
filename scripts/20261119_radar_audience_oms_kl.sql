-- Target groups: store selected SCB omsättningsklasser explicitly.
-- Safe to rerun.

BEGIN;

ALTER TABLE radar_audiences
  ADD COLUMN IF NOT EXISTS oms_kl_codes INTEGER[] NOT NULL DEFAULT '{}';

COMMIT;
