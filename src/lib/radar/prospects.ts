import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import type {
  RadarProspectList,
  RadarProspectStatus,
} from "@/lib/radar/types";

export async function setRadarProspectStatus(input: {
  companyId: string;
  status: RadarProspectStatus;
  notes?: string | null;
  markedBy: string;
}): Promise<void> {
  await cloudSqlPool.query(
    `INSERT INTO radar_prospects (company_id, status, notes, marked_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (company_id) DO UPDATE SET
       status = EXCLUDED.status,
       notes = COALESCE(EXCLUDED.notes, radar_prospects.notes),
       marked_by = EXCLUDED.marked_by`,
    [
      input.companyId,
      input.status,
      input.notes?.trim() || null,
      input.markedBy,
    ]
  );
}

export async function clearRadarProspect(companyId: string): Promise<void> {
  await cloudSqlPool.query(
    `DELETE FROM radar_prospects WHERE company_id = $1`,
    [companyId]
  );
}

export async function listRadarProspectLists(): Promise<RadarProspectList[]> {
  const { rows } = await cloudSqlPool.query(
    `SELECT
       l.id,
       l.name,
       l.description,
       l.created_at,
       COALESCE((
         SELECT count(*)::int FROM radar_prospect_list_members m
         WHERE m.list_id = l.id
       ), 0) AS member_count
     FROM radar_prospect_lists l
     ORDER BY l.name`
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    description: (r.description as string | null) ?? null,
    member_count: Number(r.member_count),
    created_at: new Date(String(r.created_at)).toISOString(),
  }));
}

export async function createRadarProspectList(input: {
  name: string;
  description?: string | null;
  createdBy: string;
}): Promise<RadarProspectList> {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");
  const { rows } = await cloudSqlPool.query(
    `INSERT INTO radar_prospect_lists (name, description, created_by)
     VALUES ($1, $2, $3)
     RETURNING id, name, description, created_at`,
    [name, input.description?.trim() || null, input.createdBy]
  );
  return {
    id: String(rows[0].id),
    name: String(rows[0].name),
    description: (rows[0].description as string | null) ?? null,
    member_count: 0,
    created_at: new Date(String(rows[0].created_at)).toISOString(),
  };
}

export async function addCompanyToProspectList(input: {
  listId: string;
  companyId: string;
  addedBy: string;
}): Promise<void> {
  await cloudSqlPool.query(
    `INSERT INTO radar_prospect_list_members (list_id, company_id, added_by)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [input.listId, input.companyId, input.addedBy]
  );
}

export async function removeCompanyFromProspectList(input: {
  listId: string;
  companyId: string;
}): Promise<void> {
  await cloudSqlPool.query(
    `DELETE FROM radar_prospect_list_members
     WHERE list_id = $1 AND company_id = $2`,
    [input.listId, input.companyId]
  );
}

export async function exportProspectListCsv(listId: string): Promise<string> {
  const { rows } = await cloudSqlPool.query(
    `SELECT
       c.organization_number,
       c.name,
       c.county,
       c.sni_code,
       c.employee_count,
       c.revenue_sek,
       c.financials_origin,
       c.business_model,
       c.is_demo,
       (
         SELECT d.hostname FROM radar_domains d
         WHERE d.company_id = c.id
         ORDER BY d.is_primary DESC LIMIT 1
       ) AS hostname,
       COALESCE((
         SELECT string_agg(t.technology_name, '; ' ORDER BY t.technology_name)
         FROM radar_technologies t
         WHERE t.company_id = c.id AND t.outcome = 'identified'
       ), '') AS technologies
     FROM radar_prospect_list_members m
     JOIN radar_companies c ON c.id = m.company_id
     WHERE m.list_id = $1
     ORDER BY c.name`,
    [listId]
  );

  const header = [
    "organization_number",
    "name",
    "county",
    "sni_code",
    "employee_count",
    "revenue_sek",
    "financials_origin",
    "business_model",
    "is_demo",
    "hostname",
    "technologies",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.organization_number,
        row.name,
        row.county,
        row.sni_code,
        row.employee_count,
        row.revenue_sek,
        row.financials_origin,
        row.business_model,
        row.is_demo,
        row.hostname,
        row.technologies,
      ]
        .map((v) => {
          const s = v == null ? "" : String(v);
          return `"${s.replace(/"/g, '""')}"`;
        })
        .join(",")
    );
  }
  return lines.join("\n");
}
