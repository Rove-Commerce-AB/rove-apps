import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import {
  cloudSqlPool,
  isTransientCloudSqlConnectError,
} from "@/lib/cloudSqlPool";
import { findCustomerForPasswordLogin } from "@/lib/customerPasswordQueries";
import { debugLog, timedDebug } from "@/lib/debugLogs";
import {
  isValidEmailFormat,
  normalizeEmail,
  verifyPassword,
} from "@/lib/passwords";
import { isAppKey, type AppKey } from "@/lib/peopleTypes";

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  if (n <= 0) return undefined;
  return Math.floor(n);
}

async function fetchAppKeysForUserId(appUserId: string): Promise<AppKey[]> {
  const { rows } = await cloudSqlPool.query<{ app_keys: string[] }>(
    `SELECT COALESCE(
       (
         SELECT array_agg(a.key)
         FROM app_user_apps aua
         JOIN apps a ON a.id = aua.app_id
         WHERE aua.app_user_id = $1
       ),
       ARRAY[]::text[]
     ) AS app_keys`,
    [appUserId]
  );
  return (rows[0]?.app_keys ?? []).filter(isAppKey);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      id: "customer-password",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const emailRaw =
          typeof credentials?.email === "string" ? credentials.email : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        const email = normalizeEmail(emailRaw);

        if (!isValidEmailFormat(email) || !password) {
          return null;
        }

        const user = await findCustomerForPasswordLogin(email);
        if (!user?.password_hash) return null;
        if (!verifyPassword(password, user.password_hash)) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const email = user.email ?? null;
      try {
        const { rows } = await timedDebug(
          "auth",
          "signIn app_user lookup",
          () =>
            cloudSqlPool.query(
              "SELECT id FROM app_users WHERE lower(trim(email)) = lower(trim($1))",
              [email]
            ),
          { email }
        );
        const allowed = rows.length > 0;
        debugLog("auth", "signIn decision", { email, allowed });
        return allowed;
      } catch (e) {
        console.error("[auth] signIn app_user lookup failed", {
          email,
          error: e instanceof Error ? e.message : String(e),
        });
        if (isTransientCloudSqlConnectError(e)) {
          return false;
        }
        throw e;
      }
    },
    async jwt({ token, trigger, account, profile }) {
      const email = token.email ?? null;
      if (!email) return token;

      const refreshMs =
        parsePositiveInt(process.env.AUTH_DB_REFRESH_MS) ?? 15 * 60 * 1000;
      const lastSyncedAt =
        typeof token.appUserSyncedAt === "number" ? token.appUserSyncedAt : 0;
      const shouldSync =
        trigger === "signIn" ||
        trigger === "update" ||
        !token.appUserId ||
        !token.role ||
        !Array.isArray(token.appKeys) ||
        Date.now() - lastSyncedAt > refreshMs;

      if (!shouldSync) {
        if (typeof token.appUserId === "string") {
          try {
            token.appKeys = await fetchAppKeysForUserId(token.appUserId);
          } catch (e) {
            if (!isTransientCloudSqlConnectError(e)) throw e;
            console.warn(
              "[auth] jwt app keys refresh failed; using cached grants",
              { email, error: e instanceof Error ? e.message : String(e) }
            );
          }
        }
        return token;
      }

      let rows: {
        id: string;
        role: string;
        name: string | null;
        must_change_password: boolean;
        app_keys: string[];
      }[] = [];
      try {
        const result = await timedDebug(
          "auth",
          "jwt app_user lookup",
          () =>
            cloudSqlPool.query(
              `SELECT
                 u.id,
                 u.role,
                 u.name,
                 u.must_change_password,
                 COALESCE(
                   array_agg(a.key) FILTER (WHERE a.key IS NOT NULL),
                   ARRAY[]::text[]
                 ) AS app_keys
               FROM app_users u
               LEFT JOIN app_user_apps aua ON aua.app_user_id = u.id
               LEFT JOIN apps a ON a.id = aua.app_id
               WHERE lower(trim(u.email)) = lower(trim($1))
               GROUP BY u.id, u.role, u.name, u.must_change_password`,
              [email]
            ),
          { email, trigger: trigger ?? "session" }
        );
        rows = result.rows as typeof rows;
      } catch (e) {
        const hasCachedIdentity =
          typeof token.appUserId === "string" || Boolean(token.role);
        if (isTransientCloudSqlConnectError(e) && hasCachedIdentity) {
          console.warn(
            "[auth] jwt app_user lookup failed; using cached token until next refresh",
            { email, error: e instanceof Error ? e.message : String(e) }
          );
          token.appUserSyncedAt = Date.now();
          return token;
        }
        throw e;
      }

      if (rows[0]) {
        token.appUserId = rows[0].id;
        const dbRole = rows[0].role;
        if (
          dbRole === "admin" ||
          dbRole === "member" ||
          dbRole === "customer"
        ) {
          token.role = dbRole;
        } else {
          token.role = undefined;
        }
        token.appKeys = rows[0].app_keys.filter(isAppKey);
        token.name = rows[0].name ?? token.name;
        token.mustChangePassword = Boolean(rows[0].must_change_password);
        token.appUserSyncedAt = Date.now();
      } else {
        token.appUserId = undefined;
        token.role = undefined;
        token.appKeys = undefined;
        token.mustChangePassword = false;
        token.appUserSyncedAt = Date.now();
      }

      debugLog("auth", "jwt hydrated", {
        email,
        found: Boolean(rows[0]),
        role: token.role ?? null,
        mustChangePassword: token.mustChangePassword ?? false,
      });

      return token;
    },
    async session({ session, token }) {
      const role =
        token.role === "admin" ||
        token.role === "member" ||
        token.role === "customer"
          ? token.role
          : "member";
      session.user.role = role;
      session.user.appUserId =
        typeof token.appUserId === "string" ? token.appUserId : "";
      session.user.appKeys = Array.isArray(token.appKeys) ? token.appKeys : [];
      session.user.mustChangePassword = Boolean(token.mustChangePassword);
      if (typeof token.name === "string") {
        session.user.name = token.name;
      }
      debugLog("auth", "session hydrated", {
        email: session.user.email ?? null,
        hasAppUserId: Boolean(session.user.appUserId),
        role: session.user.role,
        mustChangePassword: session.user.mustChangePassword,
      });
      return session;
    },
  },
});
