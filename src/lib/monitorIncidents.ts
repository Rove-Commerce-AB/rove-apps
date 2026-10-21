import "server-only";

import { assertAdmin } from "@/lib/accessGuards";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { parseIncidentDate } from "@/lib/monitorIncidentFilters";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pageSize = 50;

export type Incident = {
  id: string;
  startedAt: string;
  confirmedAt: string;
  recoveredAt: string | null;
  lastFailureAt: string;
  failureCount: number;
};

export type IncidentDateFilters = {
  from?: string;
  to?: string;
};

export type IncidentPage = {
  monitor: { id: string; name: string; customerName: string; url: string };
  incidents: Incident[];
  total: number;
  page: number;
  pageCount: number;
  filters: IncidentDateFilters;
};

export async function getMonitorIncidentPage(
  monitorId: string,
  rawFilters: IncidentDateFilters,
  requestedPage: number
): Promise<IncidentPage | null> {
  await assertAdmin();
  if (!uuidPattern.test(monitorId)) return null;

  const from = parseIncidentDate(rawFilters.from);
  const to = parseIncidentDate(rawFilters.to);
  if (from && to && from > to) throw new Error("From date must be on or before to date");

  const { rows: monitors } = await cloudSqlPool.query<{
    id: string; name: string; customer_name_snapshot: string; url: string;
  }>(
    `SELECT id, name, customer_name_snapshot, url
       FROM monitoring.monitors WHERE id = $1`,
    [monitorId]
  );
  const monitor = monitors[0];
  if (!monitor) return null;

  const values: unknown[] = [monitorId];
  const conditions = ["monitor_id = $1"];
  if (from) {
    values.push(from);
    conditions.push(`started_at >= ($${values.length}::date::timestamp AT TIME ZONE 'Europe/Stockholm')`);
  }
  if (to) {
    values.push(to);
    conditions.push(`started_at < (($${values.length}::date + 1)::timestamp AT TIME ZONE 'Europe/Stockholm')`);
  }
  const where = conditions.join(" AND ");
  const { rows: countRows } = await cloudSqlPool.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM monitoring.incidents WHERE ${where}`,
    values
  );
  const total = Number(countRows[0]?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, Math.min(requestedPage, pageCount));
  const { rows } = await cloudSqlPool.query<{
    id: string;
    started_at: Date;
    confirmed_at: Date;
    recovered_at: Date | null;
    last_failure_at: Date;
    failure_count: number;
  }>(
    `SELECT id, started_at, confirmed_at, recovered_at, last_failure_at, failure_count
       FROM monitoring.incidents
      WHERE ${where}
      ORDER BY started_at DESC, id DESC
      LIMIT ${pageSize} OFFSET $${values.length + 1}`,
    [...values, (page - 1) * pageSize]
  );

  return {
    monitor: {
      id: monitor.id,
      name: monitor.name,
      customerName: monitor.customer_name_snapshot,
      url: monitor.url,
    },
    incidents: rows.map((row) => ({
      id: row.id,
      startedAt: new Date(row.started_at).toISOString(),
      confirmedAt: new Date(row.confirmed_at).toISOString(),
      recoveredAt: row.recovered_at ? new Date(row.recovered_at).toISOString() : null,
      lastFailureAt: new Date(row.last_failure_at).toISOString(),
      failureCount: row.failure_count,
    })),
    total,
    page,
    pageCount,
    filters: { from, to },
  };
}
