import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import type {
  RadarAudience,
  RadarAudienceStatus,
} from "@/lib/radar/types";

const AUDIENCE_SELECT = `
  a.id,
  a.name,
  a.status,
  a.priority,
  a.sni_prefixes,
  a.counties,
  a.employee_min,
  a.employee_max,
  a.revenue_min_sek,
  a.revenue_max_sek,
  a.estimated_company_count,
  a.notes,
  a.created_at,
  a.updated_at,
  COALESCE(
    (SELECT count(*)::int FROM radar_company_audiences ca WHERE ca.audience_id = a.id),
    0
  ) AS company_count
`;

function mapAudience(row: Record<string, unknown>): RadarAudience {
  return {
    id: String(row.id),
    name: String(row.name),
    status: row.status as RadarAudienceStatus,
    priority: Number(row.priority),
    sni_prefixes: (row.sni_prefixes as string[]) ?? [],
    counties: (row.counties as string[]) ?? [],
    employee_min: row.employee_min == null ? null : Number(row.employee_min),
    employee_max: row.employee_max == null ? null : Number(row.employee_max),
    revenue_min_sek:
      row.revenue_min_sek == null ? null : Number(row.revenue_min_sek),
    revenue_max_sek:
      row.revenue_max_sek == null ? null : Number(row.revenue_max_sek),
    estimated_company_count:
      row.estimated_company_count == null
        ? null
        : Number(row.estimated_company_count),
    notes: (row.notes as string | null) ?? null,
    company_count: Number(row.company_count ?? 0),
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function listRadarAudiences(): Promise<RadarAudience[]> {
  const { rows } = await cloudSqlPool.query(
    `SELECT ${AUDIENCE_SELECT}
     FROM radar_audiences a
     ORDER BY a.priority ASC, a.name ASC`
  );
  return rows.map(mapAudience);
}

export async function getRadarAudience(
  id: string
): Promise<RadarAudience | null> {
  const { rows } = await cloudSqlPool.query(
    `SELECT ${AUDIENCE_SELECT}
     FROM radar_audiences a
     WHERE a.id = $1`,
    [id]
  );
  return rows[0] ? mapAudience(rows[0]) : null;
}

export type CreateRadarAudienceInput = {
  name: string;
  status?: RadarAudienceStatus;
  priority?: number;
  sni_prefixes?: string[];
  counties?: string[];
  employee_min?: number | null;
  employee_max?: number | null;
  revenue_min_sek?: number | null;
  revenue_max_sek?: number | null;
  notes?: string | null;
};

export async function createRadarAudience(
  input: CreateRadarAudienceInput
): Promise<RadarAudience> {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");

  const { rows } = await cloudSqlPool.query(
    `INSERT INTO radar_audiences (
       name, status, priority, sni_prefixes, counties,
       employee_min, employee_max, revenue_min_sek, revenue_max_sek, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      name,
      input.status ?? "active",
      input.priority ?? 100,
      input.sni_prefixes ?? [],
      input.counties ?? [],
      input.employee_min ?? null,
      input.employee_max ?? null,
      input.revenue_min_sek ?? null,
      input.revenue_max_sek ?? null,
      input.notes?.trim() || null,
    ]
  );
  const created = await getRadarAudience(String(rows[0].id));
  if (!created) throw new Error("Failed to load target group");
  return created;
}

export type UpdateRadarAudienceInput = Partial<CreateRadarAudienceInput> & {
  estimated_company_count?: number | null;
};

export async function updateRadarAudience(
  id: string,
  input: UpdateRadarAudienceInput
): Promise<RadarAudience> {
  const current = await getRadarAudience(id);
  if (!current) throw new Error("Target group not found");

  const name = input.name !== undefined ? input.name.trim() : current.name;
  if (!name) throw new Error("Name is required");

  await cloudSqlPool.query(
    `UPDATE radar_audiences SET
       name = $2,
       status = COALESCE($3, status),
       priority = COALESCE($4, priority),
       sni_prefixes = COALESCE($5, sni_prefixes),
       counties = COALESCE($6, counties),
       employee_min = $7,
       employee_max = $8,
       revenue_min_sek = $9,
       revenue_max_sek = $10,
       notes = $11,
       estimated_company_count = COALESCE($12, estimated_company_count)
     WHERE id = $1`,
    [
      id,
      name,
      input.status ?? null,
      input.priority ?? null,
      input.sni_prefixes ?? null,
      input.counties ?? null,
      input.employee_min !== undefined
        ? input.employee_min
        : current.employee_min,
      input.employee_max !== undefined
        ? input.employee_max
        : current.employee_max,
      input.revenue_min_sek !== undefined
        ? input.revenue_min_sek
        : current.revenue_min_sek,
      input.revenue_max_sek !== undefined
        ? input.revenue_max_sek
        : current.revenue_max_sek,
      input.notes !== undefined
        ? input.notes?.trim() || null
        : current.notes,
      input.estimated_company_count !== undefined
        ? input.estimated_company_count
        : null,
    ]
  );

  const updated = await getRadarAudience(id);
  if (!updated) throw new Error("Target group not found");
  return updated;
}

export async function setRadarAudienceStatus(
  id: string,
  status: RadarAudienceStatus
): Promise<RadarAudience> {
  return updateRadarAudience(id, { status });
}

export async function deleteRadarAudience(id: string): Promise<void> {
  await cloudSqlPool.query(`DELETE FROM radar_audiences WHERE id = $1`, [id]);
}
