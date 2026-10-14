"use server";

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { assertAdmin } from "@/lib/accessGuards";
import { cloudSqlPool, withCloudSqlTransaction } from "@/lib/cloudSqlPool";
import { isAppKey, isCustomerAssignableAppKey, type AppKey } from "@/lib/peopleTypes";

export type PersonMcpAccess = {
  hasToken: boolean;
  appKeys: AppKey[];
  mcpAppKeys: AppKey[];
};

function encryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error("AUTH_SECRET is required to manage MCP tokens");
  }

  return Buffer.from(hkdfSync("sha256", secret, "", "rove:mcp-token-encryption:v1", 32));
}

function encryptToken(token: string, appUserId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(appUserId));
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);

  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptToken(value: string, appUserId: string): string {
  const [version, iv, tag, encrypted, extra] = value.split(".");

  if (version !== "v1" || !iv || !tag || !encrypted || extra !== undefined) {
    throw new Error("Invalid encrypted MCP token");
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(appUserId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export async function getPersonMcpAccess(appUserId: string): Promise<PersonMcpAccess> {
  await assertAdmin();
  const { rows } = await cloudSqlPool.query<{
    has_token: boolean;
    app_keys: string[];
    mcp_app_keys: string[];
  }>(
    `SELECT EXISTS (SELECT 1 FROM app_user_mcp_tokens t WHERE t.app_user_id = u.id) AS has_token,
            COALESCE(array_agg(a.key) FILTER (WHERE a.key IS NOT NULL), ARRAY[]::text[]) AS app_keys,
            COALESCE(array_agg(a.key) FILTER (WHERE ua.mcp_access), ARRAY[]::text[]) AS mcp_app_keys
     FROM app_users u
     LEFT JOIN app_user_apps ua ON ua.app_user_id = u.id
     LEFT JOIN apps a ON a.id = ua.app_id
     WHERE u.id = $1
     GROUP BY u.id`,
    [appUserId]
  );
  const row = rows[0];

  if (!row) {
    throw new Error("User not found");
  }

  return {
    hasToken: row.has_token,
    appKeys: row.app_keys.filter(isAppKey),
    mcpAppKeys: row.mcp_app_keys.filter(isAppKey),
  };
}

export async function generatePersonMcpToken(appUserId: string): Promise<void> {
  await assertAdmin();
  const { rows } = await cloudSqlPool.query<{ id: string }>("SELECT id FROM app_users WHERE id = $1", [appUserId]);
  const user = rows[0];

  if (!user) {
    throw new Error("User not found");
  }

  const token = `rove_mcp_${randomBytes(32).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const encryptedToken = encryptToken(token, user.id);
  const result = await cloudSqlPool.query(
    `INSERT INTO app_user_mcp_tokens (app_user_id, token_hash, encrypted_token)
     VALUES ($1, $2, $3)
     ON CONFLICT (app_user_id) DO NOTHING`,
    [user.id, tokenHash, encryptedToken]
  );

  if (result.rowCount !== 1) {
    throw new Error("This user already has a token. Reload the tab to manage it.");
  }
}

export async function revealPersonMcpToken(appUserId: string): Promise<string> {
  await assertAdmin();
  const { rows } = await cloudSqlPool.query<{ app_user_id: string; encrypted_token: string }>(
    "SELECT app_user_id, encrypted_token FROM app_user_mcp_tokens WHERE app_user_id = $1",
    [appUserId]
  );
  const row = rows[0];

  if (!row) {
    throw new Error("No access token exists for this user");
  }

  try {
    return decryptToken(row.encrypted_token, row.app_user_id);
  } catch {
    throw new Error("Unable to read this token. Revoke it and generate a new one.");
  }
}

export async function revokePersonMcpToken(appUserId: string): Promise<void> {
  await assertAdmin();
  await cloudSqlPool.query("DELETE FROM app_user_mcp_tokens WHERE app_user_id = $1", [appUserId]);
}

export async function setPersonMcpAppAccess(appUserId: string, appKey: AppKey, enabled: boolean): Promise<void> {
  await assertAdmin();

  if (!isAppKey(appKey) || typeof enabled !== "boolean") {
    throw new Error("Invalid MCP app access");
  }

  await withCloudSqlTransaction("people-set-mcp-app-access", async (client) => {
    const { rows } = await client.query<{ role: string }>("SELECT role FROM app_users WHERE id = $1 FOR UPDATE", [appUserId]);
    const user = rows[0];

    if (!user) {
      throw new Error("User not found");
    }

    if (enabled && user.role === "customer" && !isCustomerAssignableAppKey(appKey)) {
      throw new Error("Customer users can only be granted Work");
    }

    const result = await client.query(
      `UPDATE app_user_apps ua
       SET mcp_access = $3
       FROM apps a
       WHERE ua.app_user_id = $1 AND ua.app_id = a.id AND a.key = $2`,
      [appUserId, appKey, enabled]
    );

    if (result.rowCount !== 1) {
      throw new Error("Enable App access for this app first");
    }
  });
}
