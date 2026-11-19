import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { RADAR_PRIORITY_TECHNOLOGIES, type RadarVerticalRow } from "@/lib/radar/types";

export async function listRadarVerticalsBySni(): Promise<RadarVerticalRow[]> {
  const { rows } = await cloudSqlPool.query(
    `SELECT
       COALESCE(left(c.sni_code, 2), '??') AS key,
       COALESCE(max(c.sni_description), 'Unknown SNI') AS label,
       count(*)::int AS company_count,
       avg(c.employee_count)::float AS avg_employees
     FROM radar_companies c
     GROUP BY left(c.sni_code, 2)
     ORDER BY company_count DESC, key`
  );

  return Promise.all(
    rows.map(async (row) => {
      const key = String(row.key);
      const tech = await techBreakdownForFilter(`left(c.sni_code, 2) = $1`, [
        key,
      ]);
      return {
        key,
        label: `${key} – ${String(row.label)}`,
        company_count: Number(row.company_count),
        with_priority_tech: tech
          .filter((t) =>
            RADAR_PRIORITY_TECHNOLOGIES.some((p) => p.key === t.key)
          )
          .reduce((sum, t) => sum + t.count, 0),
        avg_employees:
          row.avg_employees == null ? null : Math.round(Number(row.avg_employees)),
        tech_breakdown: tech,
      };
    })
  );
}

export async function listRadarVerticalsByBusinessModel(): Promise<
  RadarVerticalRow[]
> {
  const { rows } = await cloudSqlPool.query(
    `SELECT
       COALESCE(c.business_model, 'unset') AS key,
       count(*)::int AS company_count,
       avg(c.employee_count)::float AS avg_employees
     FROM radar_companies c
     GROUP BY COALESCE(c.business_model, 'unset')
     ORDER BY company_count DESC`
  );

  const labels: Record<string, string> = {
    d2c: "D2C",
    b2b: "B2B",
    wholesale: "Wholesale",
    other: "Other",
    unset: "Not set",
  };

  return Promise.all(
    rows.map(async (row) => {
      const key = String(row.key);
      const tech =
        key === "unset"
          ? await techBreakdownForFilter(`c.business_model IS NULL`, [])
          : await techBreakdownForFilter(`c.business_model = $1`, [key]);
      return {
        key,
        label: labels[key] ?? key,
        company_count: Number(row.company_count),
        with_priority_tech: tech
          .filter((t) =>
            RADAR_PRIORITY_TECHNOLOGIES.some((p) => p.key === t.key)
          )
          .reduce((sum, t) => sum + t.count, 0),
        avg_employees:
          row.avg_employees == null ? null : Math.round(Number(row.avg_employees)),
        tech_breakdown: tech,
      };
    })
  );
}

async function techBreakdownForFilter(
  whereSql: string,
  params: unknown[]
): Promise<{ key: string; name: string; count: number }[]> {
  const { rows } = await cloudSqlPool.query(
    `SELECT t.technology_key AS key, t.technology_name AS name, count(DISTINCT t.company_id)::int AS count
     FROM radar_technologies t
     JOIN radar_companies c ON c.id = t.company_id
     WHERE t.outcome = 'identified' AND (${whereSql})
     GROUP BY t.technology_key, t.technology_name
     ORDER BY count DESC, name
     LIMIT 12`,
    params
  );
  return rows.map((r) => ({
    key: String(r.key),
    name: String(r.name),
    count: Number(r.count),
  }));
}
