import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";

export type SupportMailMatchKind = "exact" | "domain";

export type SupportMailMatch = {
  customerId: string;
  kind: SupportMailMatchKind;
};

/** Domains that must never drive unique-domain customer matching. */
const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.se",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "gmx.com",
  "gmx.net",
  "zoho.com",
  "yandex.com",
  "qq.com",
]);

const SKIP_LOCAL_PARTS = new Set([
  "mailer-daemon",
  "postmaster",
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "notifications",
  "notification",
  "bounce",
  "bounces",
]);

export function extractEmailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

export function shouldSkipSender(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return true;
  const local = normalized.slice(0, normalized.indexOf("@"));
  if (SKIP_LOCAL_PARTS.has(local)) return true;
  if (local.endsWith("-noreply") || local.endsWith(".noreply")) return true;
  const supportBox =
    process.env.GMAIL_SUPPORT_IMPERSONATE?.trim().toLowerCase() ||
    "support@rove.se";
  if (normalized === supportBox) return true;
  // Internal staff mail on the shared inbox is triage noise, not a customer case.
  const domain = extractEmailDomain(normalized);
  if (domain === "rove.se") return true;
  return false;
}

function hostFromCustomerUrl(url: string | null): string | null {
  if (!url?.trim()) return null;
  try {
    const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const host = new URL(withProto).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

function domainVariantsFor(domain: string): string[] {
  const variants = [domain];
  const labels = domain.split(".");
  // tpl.postnord.com → also try postnord.com
  if (labels.length > 2) {
    variants.push(labels.slice(1).join("."));
  }
  return variants;
}

function domainMatches(
  candidate: string | null,
  variants: string[]
): boolean {
  if (!candidate) return false;
  return variants.some((d) => candidate === d || candidate.endsWith(`.${d}`));
}

/**
 * Hybrid match: exact contact / customer-user email first;
 * else unique non-public domain across contacts, users, and customer URL.
 */
export async function matchCustomerForSupportMail(
  fromEmail: string
): Promise<SupportMailMatch | null> {
  const email = fromEmail.trim().toLowerCase();
  if (!email || shouldSkipSender(email)) return null;

  const { rows: exact } = await cloudSqlPool.query<{ id: string }>(
    `SELECT c.id
     FROM customers c
     WHERE c.is_active
       AND NOT c.is_internal
       AND (
         lower(btrim(coalesce(c.contact_email, ''))) = $1
         OR EXISTS (
           SELECT 1
           FROM customer_app_users cau
           JOIN app_users u ON u.id = cau.app_user_id
           WHERE cau.customer_id = c.id
             AND lower(btrim(u.email)) = $1
         )
       )
     ORDER BY c.name
     LIMIT 2`,
    [email]
  );
  if (exact.length === 1) {
    return { customerId: exact[0].id, kind: "exact" };
  }
  if (exact.length > 1) return null;

  const domain = extractEmailDomain(email);
  if (!domain || PUBLIC_EMAIL_DOMAINS.has(domain)) return null;

  const variants = domainVariantsFor(domain);

  const { rows: candidates } = await cloudSqlPool.query<{
    id: string;
    contact_email: string | null;
    url: string | null;
    user_domains: string[] | null;
  }>(
    `SELECT c.id,
            c.contact_email,
            c.url,
            array_remove(array_agg(DISTINCT lower(split_part(u.email, '@', 2))), null)
              AS user_domains
     FROM customers c
     LEFT JOIN customer_app_users cau ON cau.customer_id = c.id
     LEFT JOIN app_users u ON u.id = cau.app_user_id
     WHERE c.is_active
       AND NOT c.is_internal
     GROUP BY c.id, c.contact_email, c.url`,
    []
  );

  const matchedIds = new Set<string>();
  for (const row of candidates) {
    const contactDomain = row.contact_email
      ? extractEmailDomain(row.contact_email)
      : null;
    const host = hostFromCustomerUrl(row.url);
    const userHit = (row.user_domains ?? []).some((d) =>
      domainMatches(d, variants)
    );
    if (
      domainMatches(contactDomain, variants) ||
      domainMatches(host, variants) ||
      userHit
    ) {
      matchedIds.add(row.id);
    }
  }

  if (matchedIds.size !== 1) return null;
  return { customerId: [...matchedIds][0], kind: "domain" };
}
