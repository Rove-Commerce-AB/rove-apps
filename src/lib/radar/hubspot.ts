import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { formatOrganizationNumber } from "@/lib/radar/orgNumber";
import type {
  HubSpotDuplicateMatch,
  HubSpotExistingMode,
  HubSpotExportPreview,
  HubSpotExportResult,
} from "@/lib/radar/hubspotTypes";

export type {
  HubSpotDuplicateMatch,
  HubSpotExistingMode,
  HubSpotExportPreview,
  HubSpotExportResult,
} from "@/lib/radar/hubspotTypes";

const HUBSPOT_API = "https://api.hubapi.com";

type RadarExportRow = {
  id: string;
  name: string;
  organization_number: string;
  county: string | null;
  sni_code: string | null;
  sni_description: string | null;
  primary_hostname: string | null;
  technologies: string[];
};

export function isHubSpotConfigured(): boolean {
  return Boolean(process.env.HUBSPOT_PRIVATE_APP_TOKEN?.trim());
}

function hubspotToken(): string {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "HubSpot is not configured. Set HUBSPOT_PRIVATE_APP_TOKEN."
    );
  }
  return token;
}

function orgNumberProperty(): string | null {
  const key = process.env.HUBSPOT_ORG_NUMBER_PROPERTY?.trim();
  return key || null;
}

function buildDescription(row: RadarExportRow): string {
  const parts = [
    `Org: ${formatOrganizationNumber(row.organization_number)}`,
    row.sni_code
      ? `SNI: ${row.sni_code}${row.sni_description ? ` – ${row.sni_description}` : ""}`
      : null,
    row.technologies.length > 0
      ? `Tech: ${row.technologies.slice(0, 8).join(", ")}`
      : null,
    "Source: Rove Radar",
  ].filter(Boolean);
  return parts.join("\n");
}

function toHubSpotProperties(row: RadarExportRow): Record<string, string> {
  const props: Record<string, string> = {
    name: row.name,
    description: buildDescription(row),
  };
  if (row.primary_hostname) {
    props.domain = row.primary_hostname;
    props.website = `https://${row.primary_hostname}`;
  }
  if (row.county) {
    props.state = row.county;
  }
  const orgProp = orgNumberProperty();
  if (orgProp) {
    props[orgProp] = row.organization_number;
  }
  return props;
}

async function loadCompaniesForExport(
  companyIds: string[]
): Promise<RadarExportRow[]> {
  if (companyIds.length === 0) return [];
  const { rows } = await cloudSqlPool.query(
    `SELECT
       c.id,
       c.name,
       c.organization_number,
       c.county,
       c.sni_code,
       c.sni_description,
       (
         SELECT d.hostname FROM radar_domains d
         WHERE d.company_id = c.id
         ORDER BY d.is_primary DESC, d.hostname
         LIMIT 1
       ) AS primary_hostname,
       COALESCE((
         SELECT array_agg(DISTINCT t.technology_name ORDER BY t.technology_name)
         FROM radar_technologies t
         WHERE t.company_id = c.id AND t.outcome = 'identified'
       ), '{}') AS technologies
     FROM radar_companies c
     WHERE c.id = ANY($1::uuid[])`,
    [companyIds]
  );
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    organization_number: String(row.organization_number),
    county: (row.county as string | null) ?? null,
    sni_code: (row.sni_code as string | null) ?? null,
    sni_description: (row.sni_description as string | null) ?? null,
    primary_hostname: (row.primary_hostname as string | null) ?? null,
    technologies: (row.technologies as string[]) ?? [],
  }));
}

async function markExported(
  stamps: Array<{ companyId: string; hubspotCompanyId: string }>
): Promise<void> {
  for (const stamp of stamps) {
    await cloudSqlPool.query(
      `UPDATE radar_companies
       SET hubspot_company_id = $2,
           hubspot_exported_at = now()
       WHERE id = $1`,
      [stamp.companyId, stamp.hubspotCompanyId]
    );
  }
}

type HubSpotHit = { id: string; name: string | null; domain: string | null };

async function hubspotSearch(body: unknown): Promise<
  Array<{ id: string; properties?: { name?: string; domain?: string } }>
> {
  const token = hubspotToken();
  const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/companies/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    results?: Array<{
      id: string;
      properties?: { name?: string; domain?: string };
    }>;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(json.message || `HubSpot search failed (${res.status})`);
  }
  return json.results ?? [];
}

async function searchHubSpotCompaniesByDomains(
  domains: string[]
): Promise<Map<string, HubSpotHit>> {
  const unique = [
    ...new Set(domains.map((d) => d.trim().toLowerCase()).filter(Boolean)),
  ];
  const found = new Map<string, HubSpotHit>();
  const chunkSize = 50;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const results = await hubspotSearch({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "domain",
              operator: "IN",
              values: chunk,
            },
          ],
        },
      ],
      properties: ["name", "domain"],
      limit: Math.min(200, chunk.length * 2),
    });
    for (const result of results) {
      const domain = String(result.properties?.domain ?? "")
        .trim()
        .toLowerCase();
      if (!domain || found.has(domain)) continue;
      found.set(domain, {
        id: String(result.id),
        name: result.properties?.name?.trim() || null,
        domain: result.properties?.domain?.trim() || null,
      });
    }
  }

  return found;
}

/** Exact name match (case-insensitive key). HubSpot EQ is used per name. */
async function searchHubSpotCompaniesByNames(
  names: string[]
): Promise<Map<string, HubSpotHit>> {
  const unique = [
    ...new Set(names.map((n) => n.trim()).filter(Boolean)),
  ];
  const found = new Map<string, HubSpotHit>();
  // HubSpot allows up to 5 filterGroups (OR). Batch names that way.
  const chunkSize = 5;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const results = await hubspotSearch({
      filterGroups: chunk.map((name) => ({
        filters: [
          {
            propertyName: "name",
            operator: "EQ",
            value: name,
          },
        ],
      })),
      properties: ["name", "domain"],
      limit: Math.min(200, chunk.length * 3),
    });
    for (const result of results) {
      const nameKey = String(result.properties?.name ?? "")
        .trim()
        .toLowerCase();
      if (!nameKey || found.has(nameKey)) continue;
      found.set(nameKey, {
        id: String(result.id),
        name: result.properties?.name?.trim() || null,
        domain: result.properties?.domain?.trim() || null,
      });
    }
  }

  return found;
}

async function findDuplicateMatches(
  rows: RadarExportRow[]
): Promise<HubSpotDuplicateMatch[]> {
  const withDomain = rows.filter((r) => r.primary_hostname);
  const withoutDomain = rows.filter((r) => !r.primary_hostname);

  const [byDomain, byName] = await Promise.all([
    searchHubSpotCompaniesByDomains(
      withDomain.map((r) => r.primary_hostname!)
    ),
    searchHubSpotCompaniesByNames(withoutDomain.map((r) => r.name)),
  ]);

  const duplicates: HubSpotDuplicateMatch[] = [];
  for (const row of withDomain) {
    const hit = byDomain.get(row.primary_hostname!.toLowerCase());
    if (!hit) continue;
    duplicates.push({
      companyId: row.id,
      name: row.name,
      domain: row.primary_hostname,
      matchedBy: "domain",
      hubspotId: hit.id,
      hubspotName: hit.name,
    });
  }
  for (const row of withoutDomain) {
    const hit = byName.get(row.name.trim().toLowerCase());
    if (!hit) continue;
    duplicates.push({
      companyId: row.id,
      name: row.name,
      domain: hit.domain,
      matchedBy: "name",
      hubspotId: hit.id,
      hubspotName: hit.name,
    });
  }
  return duplicates;
}

/** Preview which companies already exist in HubSpot (domain, else exact name). */
export async function previewRadarHubSpotExport(
  companyIds: string[]
): Promise<HubSpotExportPreview> {
  const ids = [...new Set(companyIds.filter(Boolean))];
  const rows = await loadCompaniesForExport(ids);
  const withDomain = rows.filter((r) => r.primary_hostname);
  const withoutDomain = rows.filter((r) => !r.primary_hostname);
  const duplicates = await findDuplicateMatches(rows);
  const dupIds = new Set(duplicates.map((d) => d.companyId));

  return {
    companyIds: ids,
    duplicates,
    newWithDomain: withDomain.filter((r) => !dupIds.has(r.id)).length,
    newWithoutDomain: withoutDomain.filter((r) => !dupIds.has(r.id)).length,
  };
}

async function createCompany(row: RadarExportRow): Promise<string> {
  const token = hubspotToken();
  const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/companies`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ properties: toHubSpotProperties(row) }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };
  if (!res.ok || !body.id) {
    throw new Error(
      body.message || `HubSpot create failed for ${row.name} (${res.status})`
    );
  }
  return String(body.id);
}

async function updateCompanyById(
  hubspotId: string,
  row: RadarExportRow
): Promise<void> {
  const token = hubspotToken();
  const res = await fetch(
    `${HUBSPOT_API}/crm/v3/objects/companies/${encodeURIComponent(hubspotId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ properties: toHubSpotProperties(row) }),
    }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(
      body.message ||
        `HubSpot update failed for ${row.name} (${res.status})`
    );
  }
}

/**
 * Export Radar companies to HubSpot.
 * Existing matches (domain, else exact name) are PATCHed by HubSpot id —
 * we do not use domain upsert, since domain is not unique in many portals.
 * When onExisting is "skip", matches are only stamped — not overwritten.
 */
export async function exportRadarCompaniesToHubSpot(
  companyIds: string[],
  options: { onExisting?: HubSpotExistingMode } = {}
): Promise<HubSpotExportResult> {
  const onExisting = options.onExisting ?? "update";
  const ids = [...new Set(companyIds.filter(Boolean))];
  const rows = await loadCompaniesForExport(ids);
  const duplicates = await findDuplicateMatches(rows);
  const dupByCompanyId = new Map(
    duplicates.map((d) => [d.companyId, d] as const)
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const stamps: Array<{ companyId: string; hubspotCompanyId: string }> = [];

  for (const row of rows) {
    const dup = dupByCompanyId.get(row.id);
    try {
      if (dup) {
        if (onExisting === "skip") {
          skipped += 1;
          stamps.push({ companyId: row.id, hubspotCompanyId: dup.hubspotId });
          continue;
        }
        await updateCompanyById(dup.hubspotId, row);
        updated += 1;
        stamps.push({ companyId: row.id, hubspotCompanyId: dup.hubspotId });
        continue;
      }
      const hubspotId = await createCompany(row);
      created += 1;
      stamps.push({ companyId: row.id, hubspotCompanyId: hubspotId });
    } catch (e) {
      errors.push(
        e instanceof Error ? e.message : `Could not export ${row.name}`
      );
    }
  }

  if (stamps.length > 0) {
    await markExported(stamps);
  }

  const missing = ids.length - rows.length;
  if (missing > 0) {
    errors.push(`${missing} compan${missing === 1 ? "y" : "ies"} not found.`);
  }

  return {
    exported: stamps.length - skipped,
    created,
    updated,
    skipped: skipped + Math.max(0, ids.length - rows.length),
    errors,
  };
}
