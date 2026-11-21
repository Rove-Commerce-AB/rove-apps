import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { addRadarDomain } from "@/lib/radar/companies";
import {
  hostnameCandidatesFromName,
  resolveDomainFromName,
} from "@/lib/radar/domainGuess";
import { refreshCompanyCustomerMatch } from "@/lib/radar/matching";
import { normalizeHostname } from "@/lib/radar/orgNumber";

export type DomainEnrichmentProgress = {
  message: string;
  processed: number;
  found: number;
  notFound: number;
  errors: number;
};

async function setLookupStatus(
  companyId: string,
  status: "found" | "not_found" | "skipped"
): Promise<void> {
  await cloudSqlPool.query(
    `UPDATE radar_companies
     SET domain_lookup_status = $2,
         domain_lookup_at = now()
     WHERE id = $1`,
    [companyId, status]
  );
}

/**
 * Enrich companies that lack a domain: customer URL first, then name→hostname guess.
 */
export async function runDomainEnrichmentJob(options: {
  maxItems: number;
  delayMs: number;
  isPaused?: () => Promise<boolean>;
  onProgress?: (progress: DomainEnrichmentProgress) => void | Promise<void>;
}): Promise<{
  processed: number;
  found: number;
  notFound: number;
  errors: number;
  message: string;
}> {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    name: string;
    organization_number: string;
  }>(
    `SELECT c.id, c.name, c.organization_number
     FROM radar_companies c
     WHERE NOT EXISTS (
         SELECT 1 FROM radar_domains d WHERE d.company_id = c.id
       )
       AND (
         c.domain_lookup_status IS NULL
         OR (
           c.domain_lookup_status = 'not_found'
           AND c.domain_lookup_at < now() - interval '30 days'
         )
       )
     ORDER BY c.updated_at ASC
     LIMIT $1`,
    [options.maxItems]
  );

  let processed = 0;
  let found = 0;
  let notFound = 0;
  let errors = 0;

  const report = async () => {
    await options.onProgress?.({
      message: `Step 1/1 · Domains (${processed}/${rows.length}) · found ${found} · not found ${notFound}`,
      processed,
      found,
      notFound,
      errors,
    });
  };

  await report();

  for (const row of rows) {
    if (options.isPaused && (await options.isPaused())) break;

    try {
      await refreshCompanyCustomerMatch(row.id);

      const { rows: refreshed } = await cloudSqlPool.query<{
        url: string | null;
      }>(
        `SELECT cust.url
         FROM radar_companies c
         LEFT JOIN customers cust ON cust.id = c.matched_customer_id
         WHERE c.id = $1`,
        [row.id]
      );
      const customerHost = refreshed[0]?.url
        ? normalizeHostname(refreshed[0].url)
        : null;

      if (customerHost) {
        await addRadarDomain({
          companyId: row.id,
          hostname: customerHost,
          isPrimary: true,
          source: "customer",
        });
        await setLookupStatus(row.id, "found");
        found += 1;
        processed += 1;
      } else {
        const resolved = await resolveDomainFromName({
          name: row.name,
          organizationNumber: row.organization_number,
          timeoutMs: 8000,
          delayMs: Math.min(options.delayMs, 200),
        });

        if (resolved) {
          await addRadarDomain({
            companyId: row.id,
            hostname: resolved.hostname,
            isPrimary: true,
            source: "lookup",
          });
          await setLookupStatus(row.id, "found");
          found += 1;
        } else {
          // Too-short / empty slug → skipped; otherwise not_found for retry later
          const candidates = hostnameCandidatesFromName(row.name);
          await setLookupStatus(
            row.id,
            candidates.length === 0 ? "skipped" : "not_found"
          );
          notFound += 1;
        }
        processed += 1;
      }
    } catch {
      errors += 1;
      processed += 1;
    }

    await report();

    if (options.delayMs > 0) {
      await new Promise((r) => setTimeout(r, options.delayMs));
    }
  }

  const message = `Domains: found ${found}, not found ${notFound}, errors ${errors} (of ${processed})`;
  await options.onProgress?.({
    message,
    processed,
    found,
    notFound,
    errors,
  });

  return { processed, found, notFound, errors, message };
}
