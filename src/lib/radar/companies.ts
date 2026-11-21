import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { buildOfferSignals } from "@/lib/radar/matching";
import { normalizeHostname, normalizeOrganizationNumber } from "@/lib/radar/orgNumber";
import { workPersonFromUser } from "@/lib/workIssueKey";
import type {
  RadarBusinessModel,
  RadarCompanyDetail,
  RadarCompanyListItem,
  RadarDomain,
  RadarFinancialsOrigin,
  RadarOrphanCompany,
  RadarProspectStatus,
  RadarTechnology,
} from "@/lib/radar/types";

export type RadarCompanyFilters = {
  q?: string;
  audienceId?: string;
  county?: string;
  sniPrefix?: string;
  technologyKey?: string;
  prospectStatus?: RadarProspectStatus | "none";
  /** Restrict to members of a prospect list. */
  prospectListId?: string;
  businessModel?: RadarBusinessModel;
  existingCustomer?: "yes" | "no";
  includeDemo?: boolean;
};

function mapListItem(row: Record<string, unknown>): RadarCompanyListItem {
  return {
    id: String(row.id),
    organization_number: String(row.organization_number),
    name: String(row.name),
    county: (row.county as string | null) ?? null,
    sni_code: (row.sni_code as string | null) ?? null,
    sni_description: (row.sni_description as string | null) ?? null,
    employee_count:
      row.employee_count == null ? null : Number(row.employee_count),
    revenue_sek: row.revenue_sek == null ? null : Number(row.revenue_sek),
    oms_kl: row.oms_kl == null ? null : Number(row.oms_kl),
    oms_kl_label: (row.oms_kl_label as string | null) ?? null,
    anst_kl: row.anst_kl == null ? null : Number(row.anst_kl),
    anst_kl_label: (row.anst_kl_label as string | null) ?? null,
    financials_origin: row.financials_origin as RadarFinancialsOrigin,
    business_model: (row.business_model as RadarBusinessModel | null) ?? null,
    source: String(row.source),
    is_demo: Boolean(row.is_demo),
    matched_customer_id: (row.matched_customer_id as string | null) ?? null,
    matched_customer_name: (row.matched_customer_name as string | null) ?? null,
    primary_hostname: (row.primary_hostname as string | null) ?? null,
    technologies: (row.technologies as string[]) ?? [],
    prospect_status: (row.prospect_status as RadarProspectStatus | null) ?? null,
    audience_names: (row.audience_names as string[]) ?? [],
    owner:
      row.owner_id != null
        ? workPersonFromUser({
            id: String(row.owner_id),
            name: (row.owner_name as string | null) ?? null,
            email: String(row.owner_email ?? ""),
          })
        : null,
    hubspot_company_id: (row.hubspot_company_id as string | null) ?? null,
    hubspot_exported_at: row.hubspot_exported_at
      ? new Date(String(row.hubspot_exported_at)).toISOString()
      : null,
  };
}

export async function listRadarCompanies(
  filters: RadarCompanyFilters = {}
): Promise<RadarCompanyListItem[]> {
  const where: string[] = ["1=1"];
  const params: unknown[] = [];

  if (filters.includeDemo === false) {
    where.push(`c.is_demo = false`);
  }

  if (filters.q?.trim()) {
    params.push(`%${filters.q.trim()}%`);
    where.push(
      `(c.name ILIKE $${params.length} OR c.organization_number ILIKE $${params.length})`
    );
  }
  if (filters.audienceId) {
    params.push(filters.audienceId);
    where.push(
      `EXISTS (
         SELECT 1 FROM radar_company_audiences ca
         WHERE ca.company_id = c.id AND ca.audience_id = $${params.length}
       )`
    );
  }
  if (filters.county?.trim()) {
    params.push(filters.county.trim());
    where.push(`c.county = $${params.length}`);
  }
  if (filters.sniPrefix?.trim()) {
    params.push(`${filters.sniPrefix.trim()}%`);
    where.push(`c.sni_code LIKE $${params.length}`);
  }
  if (filters.technologyKey?.trim()) {
    params.push(filters.technologyKey.trim());
    where.push(
      `EXISTS (
         SELECT 1 FROM radar_technologies t
         WHERE t.company_id = c.id
           AND t.outcome = 'identified'
           AND t.technology_key = $${params.length}
       )`
    );
  }
  if (filters.prospectStatus === "none") {
    where.push(`p.status IS NULL`);
  } else if (filters.prospectStatus) {
    params.push(filters.prospectStatus);
    where.push(`p.status = $${params.length}`);
  }
  if (filters.prospectListId) {
    params.push(filters.prospectListId);
    where.push(
      `EXISTS (
         SELECT 1 FROM radar_prospect_list_members m
         WHERE m.company_id = c.id AND m.list_id = $${params.length}
       )`
    );
  }
  if (filters.businessModel) {
    params.push(filters.businessModel);
    where.push(`c.business_model = $${params.length}`);
  }
  if (filters.existingCustomer === "yes") {
    where.push(`c.matched_customer_id IS NOT NULL`);
  } else if (filters.existingCustomer === "no") {
    where.push(`c.matched_customer_id IS NULL`);
  }

  const { rows } = await cloudSqlPool.query(
    `SELECT
       c.id,
       c.organization_number,
       c.name,
       c.county,
       c.sni_code,
       c.sni_description,
       c.employee_count,
       c.revenue_sek,
       c.oms_kl,
       c.oms_kl_label,
       c.anst_kl,
       c.anst_kl_label,
       c.financials_origin,
       c.business_model,
       c.source,
       c.is_demo,
       c.matched_customer_id,
       cust.name AS matched_customer_name,
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
       ), '{}') AS technologies,
       p.status AS prospect_status,
       COALESCE((
         SELECT array_agg(a.name ORDER BY a.priority, a.name)
         FROM radar_company_audiences ca
         JOIN radar_audiences a ON a.id = ca.audience_id
         WHERE ca.company_id = c.id
       ), '{}') AS audience_names,
       ou.id AS owner_id,
       ou.name AS owner_name,
       ou.email AS owner_email,
       c.hubspot_company_id,
       c.hubspot_exported_at
     FROM radar_companies c
     LEFT JOIN customers cust ON cust.id = c.matched_customer_id
     LEFT JOIN radar_prospects p ON p.company_id = c.id
     LEFT JOIN app_users ou ON ou.id = p.owner_app_user_id
     WHERE ${where.join(" AND ")}
     ORDER BY c.name ASC
     LIMIT 500`,
    params
  );

  return rows.map(mapListItem);
}

export async function getRadarCompany(
  id: string
): Promise<RadarCompanyDetail | null> {
  const { rows } = await cloudSqlPool.query(
    `SELECT
       c.id,
       c.organization_number,
       c.name,
       c.legal_form,
       c.county,
       c.municipality,
       c.sni_code,
       c.sni_description,
       c.employee_count,
       c.revenue_sek,
       c.oms_kl,
       c.oms_kl_label,
       c.anst_kl,
       c.anst_kl_label,
       c.financials_origin,
       c.business_model,
       c.source,
       c.source_ref,
       c.source_fetched_at,
       c.is_demo,
       c.matched_customer_id,
       cust.name AS matched_customer_name,
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
       ), '{}') AS technologies,
       p.status AS prospect_status,
       p.notes AS notes_prospect,
       COALESCE((
         SELECT array_agg(a.name ORDER BY a.priority, a.name)
         FROM radar_company_audiences ca
         JOIN radar_audiences a ON a.id = ca.audience_id
         WHERE ca.company_id = c.id
       ), '{}') AS audience_names,
       (
         SELECT count(*)::int FROM radar_company_audiences ca
         JOIN radar_audiences a ON a.id = ca.audience_id
         WHERE ca.company_id = c.id AND a.status = 'active'
       ) AS active_audience_count,
       ou.id AS owner_id,
       ou.name AS owner_name,
       ou.email AS owner_email,
       c.hubspot_company_id,
       c.hubspot_exported_at
     FROM radar_companies c
     LEFT JOIN customers cust ON cust.id = c.matched_customer_id
     LEFT JOIN radar_prospects p ON p.company_id = c.id
     LEFT JOIN app_users ou ON ou.id = p.owner_app_user_id
     WHERE c.id = $1`,
    [id]
  );
  if (!rows[0]) return null;

  const item = mapListItem(rows[0]);
  const { rows: domainRows } = await cloudSqlPool.query(
    `SELECT id, company_id, hostname, is_primary, source, content_hash,
            last_fetched_at, last_scanned_at, scan_status
     FROM radar_domains
     WHERE company_id = $1
     ORDER BY is_primary DESC, hostname`,
    [id]
  );
  const domains: RadarDomain[] = domainRows.map((d) => ({
    id: String(d.id),
    company_id: String(d.company_id),
    hostname: String(d.hostname),
    is_primary: Boolean(d.is_primary),
    source: String(d.source),
    content_hash: (d.content_hash as string | null) ?? null,
    last_fetched_at: d.last_fetched_at
      ? new Date(String(d.last_fetched_at)).toISOString()
      : null,
    last_scanned_at: d.last_scanned_at
      ? new Date(String(d.last_scanned_at)).toISOString()
      : null,
    scan_status: String(d.scan_status),
  }));

  const { rows: techRows } = await cloudSqlPool.query(
    `SELECT t.id, t.domain_id, t.company_id, t.technology_key, t.technology_name,
            t.category, t.outcome, t.confidence, t.source, t.detected_at,
            d.hostname
     FROM radar_technologies t
     LEFT JOIN radar_domains d ON d.id = t.domain_id
     WHERE t.company_id = $1
     ORDER BY t.outcome ASC, t.confidence DESC, t.technology_name`,
    [id]
  );
  const technologies_detail: RadarTechnology[] = techRows.map((t) => ({
    id: String(t.id),
    domain_id: String(t.domain_id),
    company_id: String(t.company_id),
    technology_key: String(t.technology_key),
    technology_name: String(t.technology_name),
    category: String(t.category),
    outcome: t.outcome as "identified" | "not_identified",
    confidence: Number(t.confidence),
    source: String(t.source),
    detected_at: new Date(String(t.detected_at)).toISOString(),
    hostname: (t.hostname as string | null) ?? null,
  }));

  const techKeys = technologies_detail
    .filter((t) => t.outcome === "identified")
    .map((t) => t.technology_key);

  return {
    ...item,
    legal_form: (rows[0].legal_form as string | null) ?? null,
    municipality: (rows[0].municipality as string | null) ?? null,
    source_ref: (rows[0].source_ref as string | null) ?? null,
    source_fetched_at: rows[0].source_fetched_at
      ? new Date(String(rows[0].source_fetched_at)).toISOString()
      : null,
    notes_prospect: (rows[0].notes_prospect as string | null) ?? null,
    domains,
    technologies_detail,
    offer_signals: buildOfferSignals({
      isExistingCustomer: Boolean(item.matched_customer_id),
      audienceCount: Number(rows[0].active_audience_count ?? 0),
      technologyKeys: techKeys,
    }),
  };
}

export async function updateRadarCompanyBusinessModel(
  id: string,
  businessModel: RadarBusinessModel | null
): Promise<void> {
  await cloudSqlPool.query(
    `UPDATE radar_companies SET business_model = $2 WHERE id = $1`,
    [id, businessModel]
  );
}

/** Delete one domain by hostname, or all domains for the company. */
export async function deleteRadarDomain(input: {
  companyId: string;
  hostname?: string | null;
}): Promise<void> {
  if (input.hostname?.trim()) {
    const hostname = normalizeHostname(input.hostname);
    if (!hostname) throw new Error("Invalid hostname");
    await cloudSqlPool.query(
      `DELETE FROM radar_domains WHERE company_id = $1 AND hostname = $2`,
      [input.companyId, hostname]
    );
  } else {
    await cloudSqlPool.query(
      `DELETE FROM radar_domains WHERE company_id = $1`,
      [input.companyId]
    );
  }
}

export async function addRadarDomain(input: {
  companyId: string;
  hostname: string;
  isPrimary?: boolean;
  source?: "manual" | "customer" | "import" | "demo" | "lookup";
}): Promise<RadarDomain> {
  const hostname = normalizeHostname(input.hostname);
  if (!hostname) throw new Error("Invalid hostname");

  if (input.isPrimary) {
    await cloudSqlPool.query(
      `UPDATE radar_domains SET is_primary = false WHERE company_id = $1`,
      [input.companyId]
    );
  }

  const { rows } = await cloudSqlPool.query(
    `INSERT INTO radar_domains (company_id, hostname, is_primary, source, scan_status)
     VALUES ($1, $2, $3, $4, 'pending')
     ON CONFLICT (company_id, hostname) DO UPDATE
       SET is_primary = EXCLUDED.is_primary,
           source = CASE
             WHEN radar_domains.source = 'demo' THEN radar_domains.source
             ELSE EXCLUDED.source
           END
     RETURNING id, company_id, hostname, is_primary, source, content_hash,
               last_fetched_at, last_scanned_at, scan_status`,
    [
      input.companyId,
      hostname,
      input.isPrimary ?? false,
      input.source ?? "manual",
    ]
  );

  const d = rows[0];
  return {
    id: String(d.id),
    company_id: String(d.company_id),
    hostname: String(d.hostname),
    is_primary: Boolean(d.is_primary),
    source: String(d.source),
    content_hash: (d.content_hash as string | null) ?? null,
    last_fetched_at: d.last_fetched_at
      ? new Date(String(d.last_fetched_at)).toISOString()
      : null,
    last_scanned_at: d.last_scanned_at
      ? new Date(String(d.last_scanned_at)).toISOString()
      : null,
    scan_status: String(d.scan_status),
  };
}

export type UpsertRadarCompanyInput = {
  organization_number: string;
  name: string;
  legal_form?: string | null;
  county?: string | null;
  municipality?: string | null;
  sni_code?: string | null;
  sni_description?: string | null;
  employee_count?: number | null;
  revenue_sek?: number | null;
  oms_kl?: number | null;
  oms_kl_label?: string | null;
  oms_ar?: number | null;
  anst_kl?: number | null;
  anst_kl_label?: string | null;
  lan_kod?: string | null;
  financials_origin?: RadarFinancialsOrigin;
  business_model?: RadarBusinessModel | null;
  source: string;
  source_ref?: string | null;
  is_demo?: boolean;
  audienceIds?: string[];
};

export async function upsertRadarCompany(
  input: UpsertRadarCompanyInput
): Promise<string> {
  const org = normalizeOrganizationNumber(input.organization_number);
  if (!org) throw new Error("Invalid organization number");
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");

  const { rows } = await cloudSqlPool.query<{ id: string }>(
    `INSERT INTO radar_companies (
       organization_number, name, legal_form, county, municipality,
       sni_code, sni_description, employee_count, revenue_sek,
       oms_kl, oms_kl_label, oms_ar, anst_kl, anst_kl_label, lan_kod,
       financials_origin, business_model, source, source_ref,
       source_fetched_at, is_demo
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, $13, $14, $15,
       $16, $17, $18, $19, now(), $20
     )
     ON CONFLICT (organization_number) DO UPDATE SET
       name = EXCLUDED.name,
       legal_form = COALESCE(EXCLUDED.legal_form, radar_companies.legal_form),
       county = COALESCE(EXCLUDED.county, radar_companies.county),
       municipality = COALESCE(EXCLUDED.municipality, radar_companies.municipality),
       sni_code = COALESCE(EXCLUDED.sni_code, radar_companies.sni_code),
       sni_description = COALESCE(EXCLUDED.sni_description, radar_companies.sni_description),
       employee_count = CASE
         WHEN EXCLUDED.financials_origin = 'demo' AND radar_companies.financials_origin <> 'demo'
           THEN radar_companies.employee_count
         ELSE COALESCE(EXCLUDED.employee_count, radar_companies.employee_count)
       END,
       revenue_sek = CASE
         WHEN EXCLUDED.financials_origin IN ('scb', 'licensed') THEN NULL
         WHEN EXCLUDED.financials_origin = 'demo' AND radar_companies.financials_origin <> 'demo'
           THEN radar_companies.revenue_sek
         ELSE COALESCE(EXCLUDED.revenue_sek, radar_companies.revenue_sek)
       END,
       oms_kl = COALESCE(EXCLUDED.oms_kl, radar_companies.oms_kl),
       oms_kl_label = COALESCE(EXCLUDED.oms_kl_label, radar_companies.oms_kl_label),
       oms_ar = COALESCE(EXCLUDED.oms_ar, radar_companies.oms_ar),
       anst_kl = COALESCE(EXCLUDED.anst_kl, radar_companies.anst_kl),
       anst_kl_label = COALESCE(EXCLUDED.anst_kl_label, radar_companies.anst_kl_label),
       lan_kod = COALESCE(EXCLUDED.lan_kod, radar_companies.lan_kod),
       financials_origin = CASE
         WHEN radar_companies.financials_origin = 'licensed' THEN radar_companies.financials_origin
         WHEN EXCLUDED.financials_origin = 'licensed' THEN 'licensed'
         WHEN EXCLUDED.financials_origin = 'scb' THEN 'scb'
         WHEN radar_companies.financials_origin IN ('scb', 'demo') THEN radar_companies.financials_origin
         ELSE EXCLUDED.financials_origin
       END,
       source = EXCLUDED.source,
       source_ref = EXCLUDED.source_ref,
       source_fetched_at = now(),
       is_demo = radar_companies.is_demo OR EXCLUDED.is_demo
     RETURNING id`,
    [
      org,
      name,
      input.legal_form ?? null,
      input.county ?? null,
      input.municipality ?? null,
      input.sni_code ?? null,
      input.sni_description ?? null,
      input.employee_count ?? null,
      input.revenue_sek ?? null,
      input.oms_kl ?? null,
      input.oms_kl_label ?? null,
      input.oms_ar ?? null,
      input.anst_kl ?? null,
      input.anst_kl_label ?? null,
      input.lan_kod ?? null,
      input.financials_origin ?? "unknown",
      input.business_model ?? null,
      input.source,
      input.source_ref ?? null,
      input.is_demo ?? false,
    ]
  );

  const companyId = rows[0].id;
  for (const audienceId of input.audienceIds ?? []) {
    await cloudSqlPool.query(
      `INSERT INTO radar_company_audiences (company_id, audience_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [companyId, audienceId]
    );
  }
  return companyId;
}

/** All organization numbers currently in Radar (digits-only). */
export async function listRadarOrganizationNumbers(): Promise<Set<string>> {
  const { rows } = await cloudSqlPool.query<{ organization_number: string }>(
    `SELECT organization_number FROM radar_companies`
  );
  return new Set(rows.map((row) => String(row.organization_number)));
}

/** Hard-delete a company. Domains, tech, audience links, prospects cascade. */
export async function deleteRadarCompany(id: string): Promise<void> {
  const { rowCount } = await cloudSqlPool.query(
    `DELETE FROM radar_companies WHERE id = $1`,
    [id]
  );
  if (!rowCount) throw new Error("Company not found");
}

/**
 * Orphans: no audience link, no prospect, no list membership, no domain,
 * and not matched to a Rove customer.
 */
const ORPHAN_WHERE = `
  NOT EXISTS (
    SELECT 1 FROM radar_company_audiences ca WHERE ca.company_id = c.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM radar_prospects p WHERE p.company_id = c.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM radar_prospect_list_members m WHERE m.company_id = c.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM radar_domains d WHERE d.company_id = c.id
  )
  AND c.matched_customer_id IS NULL
`;

export async function countRadarOrphanCompanies(): Promise<number> {
  const { rows } = await cloudSqlPool.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM radar_companies c
     WHERE ${ORPHAN_WHERE}`
  );
  return Number(rows[0]?.count ?? 0);
}

export async function listRadarOrphanCompanies(
  limit = 50
): Promise<RadarOrphanCompany[]> {
  const { rows } = await cloudSqlPool.query(
    `SELECT c.id, c.organization_number, c.name, c.county
     FROM radar_companies c
     WHERE ${ORPHAN_WHERE}
     ORDER BY c.name ASC
     LIMIT $1`,
    [limit]
  );
  return rows.map((row) => ({
    id: String(row.id),
    organization_number: String(row.organization_number),
    name: String(row.name),
    county: (row.county as string | null) ?? null,
  }));
}

/** Deletes all orphan companies. Returns how many were removed. */
export async function deleteRadarOrphanCompanies(): Promise<number> {
  const { rowCount } = await cloudSqlPool.query(
    `DELETE FROM radar_companies
     WHERE id IN (
       SELECT c.id FROM radar_companies c
       WHERE ${ORPHAN_WHERE}
     )`
  );
  return rowCount ?? 0;
}
