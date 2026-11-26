-- On-demand translation cache + per-user reading language preference.
-- Safe to rerun.

BEGIN;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS translation_lang text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_users_translation_lang_check'
  ) THEN
    ALTER TABLE app_users
      ADD CONSTRAINT app_users_translation_lang_check
      CHECK (
        translation_lang IS NULL
        OR translation_lang IN ('en', 'pl', 'sv')
      );
  END IF;
END $$;

COMMENT ON COLUMN app_users.translation_lang IS
  'Preferred language for on-demand Translate (en/pl/sv). NULL = en.';

CREATE TABLE IF NOT EXISTS translation_cache (
  source_hash text NOT NULL,
  target_lang text NOT NULL,
  source_lang text NULL,
  translated_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_hash, target_lang),
  CONSTRAINT translation_cache_target_lang_check
    CHECK (target_lang IN ('en', 'pl', 'sv'))
);

CREATE INDEX IF NOT EXISTS translation_cache_created_at_idx
  ON translation_cache (created_at);

COMMENT ON TABLE translation_cache IS
  'Cached Google Translate results keyed by sha256(source text) + target lang.';

COMMIT;
