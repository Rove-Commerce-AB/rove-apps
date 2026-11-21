import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import {
  fetchJeByOrganizationNumber,
  isScbApiConfigured,
} from "@/lib/radar/scb/scbApi";
import { resolveSniDescription } from "@/lib/radar/sniSections";
import {
  formatOrganizationNumber,
  normalizeOrganizationNumber,
} from "@/lib/radar/orgNumber";
import type { RadarSearchHit } from "@/lib/radar/types";

export type { RadarSearchHit };

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export async function searchRadarDirectory(
  query: string,
  options?: { limit?: number }
): Promise<RadarSearchHit[]> {
  const raw = query.trim();
  if (raw.length < 2) return [];
  const limit = Math.min(options?.limit ?? 30, 50);
  const org = normalizeOrganizationNumber(raw);
  const orgDigits = digitsOnly(raw);

  // Exact / near-exact org number path
  if (org || (orgDigits.length >= 6 && orgDigits.length <= 10)) {
    const needle = org ?? orgDigits;
    const { rows } = await cloudSqlPool.query(
      `SELECT
         d.organization_number,
         d.name,
         d.legal_form,
         d.sni_code,
         d.county,
         d.municipality,
         c.id AS company_id,
         p.status AS prospect_status
       FROM radar_scb_directory d
       LEFT JOIN radar_companies c
         ON c.organization_number = d.organization_number
       LEFT JOIN radar_prospects p ON p.company_id = c.id
       WHERE d.organization_number LIKE $1
       ORDER BY
         CASE WHEN d.organization_number = $2 THEN 0 ELSE 1 END,
         d.name
       LIMIT $3`,
      [`${needle}%`, org ?? needle, limit]
    );

    let hits = rows.map((row) => mapHit(row, "directory"));

    // Live AFR enrichment when exact orgnr and API configured
    if (org && isScbApiConfigured()) {
      try {
        const live = await fetchJeByOrganizationNumber(org);
        if (live) {
          const existing = hits.find((h) => h.organization_number === org);
          const liveHit: RadarSearchHit = {
            organization_number: org,
            organization_number_formatted: formatOrganizationNumber(org),
            name: live.namn || existing?.name || org,
            legal_form:
              live.jurform === "49"
                ? "AB"
                : live.jurform ?? existing?.legal_form ?? null,
            sni_code:
              live.primarNaringsgren?.naringsgren ??
              existing?.sni_code ??
              null,
            sni_description: resolveSniDescription(
              live.primarNaringsgren?.naringsgren ?? existing?.sni_code
            ),
            county: existing?.county ?? null,
            municipality:
              live.postAdress?.postOrt ?? existing?.municipality ?? null,
            company_id: existing?.company_id ?? null,
            prospect_status: existing?.prospect_status ?? null,
            in_radar: Boolean(existing?.company_id),
            source: "scb_live",
          };
          hits = [
            liveHit,
            ...hits.filter((h) => h.organization_number !== org),
          ];
        }
      } catch {
        // Keep directory hits if live lookup fails
      }
    }

    // Also surface Radar-only companies not yet in directory
    if (org) {
      const { rows: radarOnly } = await cloudSqlPool.query(
        `SELECT
           c.organization_number,
           c.name,
           c.legal_form,
           c.sni_code,
           c.county,
           c.municipality,
           c.id AS company_id,
           p.status AS prospect_status
         FROM radar_companies c
         LEFT JOIN radar_prospects p ON p.company_id = c.id
         WHERE c.organization_number = $1
         LIMIT 1`,
        [org]
      );
      if (radarOnly[0] && !hits.some((h) => h.organization_number === org)) {
        hits.unshift(mapHit(radarOnly[0], "radar"));
      }
    }

    return hits.slice(0, limit);
  }

  // Name search via trigram / ILIKE
  const { rows } = await cloudSqlPool.query(
    `SELECT
       d.organization_number,
       d.name,
       d.legal_form,
       d.sni_code,
       d.county,
       d.municipality,
       c.id AS company_id,
       p.status AS prospect_status,
       similarity(d.name, $1) AS sim
     FROM radar_scb_directory d
     LEFT JOIN radar_companies c
       ON c.organization_number = d.organization_number
     LEFT JOIN radar_prospects p ON p.company_id = c.id
     WHERE d.name % $1 OR d.name ILIKE $2
     ORDER BY sim DESC NULLS LAST, d.name
     LIMIT $3`,
    [raw, `%${raw}%`, limit]
  );

  return rows.map((row) => mapHit(row, "directory"));
}

function mapHit(
  row: Record<string, unknown>,
  source: RadarSearchHit["source"]
): RadarSearchHit {
  const org = String(row.organization_number);
  const sni = (row.sni_code as string | null) ?? null;
  return {
    organization_number: org,
    organization_number_formatted: formatOrganizationNumber(org),
    name: String(row.name),
    legal_form: (row.legal_form as string | null) ?? null,
    sni_code: sni,
    sni_description: resolveSniDescription(sni),
    county: (row.county as string | null) ?? null,
    municipality: (row.municipality as string | null) ?? null,
    company_id: row.company_id ? String(row.company_id) : null,
    prospect_status: (row.prospect_status as string | null) ?? null,
    in_radar: Boolean(row.company_id),
    source,
  };
}

export async function countScbDirectoryRows(): Promise<number> {
  const { rows } = await cloudSqlPool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM radar_scb_directory`
  );
  return Number(rows[0]?.count ?? 0);
}
