import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { normalizeHostname, normalizeOrganizationNumber } from "@/lib/radar/orgNumber";
import { RADAR_PRIORITY_TECHNOLOGIES } from "@/lib/radar/types";

export async function findMatchedCustomerId(input: {
  organizationNumber: string;
  hostnames?: string[];
}): Promise<string | null> {
  const org = normalizeOrganizationNumber(input.organizationNumber);
  if (org) {
    const { rows } = await cloudSqlPool.query<{ id: string }>(
      `SELECT id FROM customers
       WHERE organization_number = $1
       LIMIT 1`,
      [org]
    );
    if (rows[0]) return rows[0].id;
  }

  const hosts = (input.hostnames ?? [])
    .map(normalizeHostname)
    .filter((h): h is string => Boolean(h));
  if (hosts.length === 0) return null;

  const { rows } = await cloudSqlPool.query<{ id: string }>(
    `SELECT id
     FROM customers
     WHERE url IS NOT NULL
       AND (
         lower(regexp_replace(url, '^https?://(www\\.)?', '', 'i')) = ANY($1::text[])
         OR lower(regexp_replace(split_part(regexp_replace(url, '^https?://', '', 'i'), '/', 1), '^www\\.', '')) = ANY($1::text[])
       )
     LIMIT 1`,
    [hosts]
  );
  return rows[0]?.id ?? null;
}

export async function refreshCompanyCustomerMatch(
  companyId: string
): Promise<string | null> {
  const { rows: companyRows } = await cloudSqlPool.query<{
    organization_number: string;
  }>(
    `SELECT organization_number FROM radar_companies WHERE id = $1`,
    [companyId]
  );
  if (!companyRows[0]) return null;

  const { rows: domainRows } = await cloudSqlPool.query<{ hostname: string }>(
    `SELECT hostname FROM radar_domains WHERE company_id = $1`,
    [companyId]
  );

  const matched = await findMatchedCustomerId({
    organizationNumber: companyRows[0].organization_number,
    hostnames: domainRows.map((d) => d.hostname),
  });

  await cloudSqlPool.query(
    `UPDATE radar_companies SET matched_customer_id = $2 WHERE id = $1`,
    [companyId, matched]
  );
  return matched;
}

export function buildOfferSignals(input: {
  isExistingCustomer: boolean;
  audienceCount: number;
  technologyKeys: string[];
}): string[] {
  const signals: string[] = [];
  if (input.isExistingCustomer) {
    signals.push("Existing Rove customer");
  } else {
    signals.push("New prospect");
  }
  if (input.audienceCount > 0) {
    signals.push(`In ${input.audienceCount} active target group(s)`);
  }
  const priority = new Set(
    RADAR_PRIORITY_TECHNOLOGIES.map((t) => t.key)
  );
  const hits = input.technologyKeys.filter((k) => priority.has(k as never));
  if (hits.length > 0) {
    signals.push(
      `Priority platform: ${hits
        .map(
          (k) =>
            RADAR_PRIORITY_TECHNOLOGIES.find((t) => t.key === k)?.name ?? k
        )
        .join(", ")}`
    );
  } else if (input.technologyKeys.length === 0) {
    signals.push("Technology not yet identified");
  }
  return signals;
}
