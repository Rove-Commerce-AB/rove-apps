-- Run before deploying the People MCP access tab. Safe to rerun.

BEGIN;

ALTER TABLE app_user_apps
  ADD COLUMN IF NOT EXISTS mcp_access BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS app_user_mcp_tokens (
  app_user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  encrypted_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
