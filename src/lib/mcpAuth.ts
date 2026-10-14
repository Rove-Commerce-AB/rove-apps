import "server-only";

import { createHash } from "node:crypto";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { isAppKey, isAppUserRole, isCustomerAssignableAppKey, type AppKey, type AppUserRole } from "@/lib/peopleTypes";

export type McpUser = {
  id: string;
  role: AppUserRole;
  appKeys: AppKey[];
};

export async function authenticateMcpRequest(request: Request): Promise<McpUser | null> {
  const match = /^Bearer[ \t]+(rove_mcp_[A-Za-z0-9_-]{43})$/i.exec(request.headers.get("authorization") ?? "");

  if (!match) {
    return null;
  }

  const tokenHash = createHash("sha256").update(match[1]).digest("hex");
  const { rows } = await cloudSqlPool.query<{ id: string; role: string; app_keys: string[] }>(
    `SELECT u.id, u.role,
       ARRAY(
         SELECT a.key
         FROM app_user_apps ua
         JOIN apps a ON a.id = ua.app_id
         WHERE ua.app_user_id = u.id AND ua.mcp_access = true
         ORDER BY a.key
       ) AS app_keys
     FROM app_user_mcp_tokens t
     JOIN app_users u ON u.id = t.app_user_id
     WHERE t.token_hash = $1`,
    [tokenHash]
  );
  const user = rows[0];

  if (!user || !isAppUserRole(user.role)) {
    return null;
  }

  const appKeys = user.app_keys.filter(isAppKey).filter((appKey) => user.role !== "customer" || isCustomerAssignableAppKey(appKey));

  return { id: user.id, role: user.role, appKeys };
}
