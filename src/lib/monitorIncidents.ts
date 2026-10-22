import "server-only";

import { assertAdmin } from "@/lib/accessGuards";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { incidentUptimePercent, resolveIncidentPeriod } from "@/lib/monitorIncidentFilters";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pageSize = 50;

export type Incident = {
  id: string;
  startedAt: string;
  confirmedAt: string;
  recoveredAt: string | null;
  lastFailureAt: string;
  failureCount: number;
  downtimeMinutes: number;
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
  filters: { from: string; to: string };
  totalDowntimeMinutes: number;
  uptimePercent: number | null;
  periodStartAt: string;
  periodEndAt: string;
  today: string;
};

function stockholmDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function getMonitorIncidentPage(
  monitorId: string,
  rawFilters: IncidentDateFilters,
  requestedPage: number,
  allIncidents = false
): Promise<IncidentPage | null> {
  await assertAdmin();
  if (!uuidPattern.test(monitorId)) return null;

  const now = new Date();
  const today = stockholmDate(now);
  const { from, to } = resolveIncidentPeriod(rawFilters, today);

  const { rows: monitors } = await cloudSqlPool.query<{
    id: string; name: string; customer_name_snapshot: string; url: string;
  }>(
    `SELECT id, name, customer_name_snapshot, url
       FROM monitoring.monitors WHERE id = $1`,
    [monitorId]
  );
  const monitor = monitors[0];
  if (!monitor) return null;

  const { rows: bounds } = await cloudSqlPool.query<{ start_at: Date; end_at: Date }>(
    `SELECT ($1::date::timestamp AT TIME ZONE 'Europe/Stockholm') AS start_at,
            LEAST((($2::date + 1)::timestamp AT TIME ZONE 'Europe/Stockholm'), $3::timestamptz) AS end_at`,
    [from, to, now.toISOString()]
  );
  const startAt = new Date(bounds[0].start_at);
  const endAt = new Date(bounds[0].end_at);
  const periodMinutes = Math.max(0, (endAt.getTime() - startAt.getTime()) / 60000);
  const values = [monitorId, startAt.toISOString(), endAt.toISOString(), now.toISOString()];
  const matching = `monitor_id = $1
    AND started_at < $3::timestamptz
    AND COALESCE(recovered_at, $4::timestamptz) > $2::timestamptz`;
  const downtime = `EXTRACT(EPOCH FROM (
    LEAST(COALESCE(recovered_at, $4::timestamptz), $3::timestamptz)
    - GREATEST(started_at, $2::timestamptz)
  )) / 60.0`;
  const { rows: totals } = periodMinutes > 0
    ? await cloudSqlPool.query<{ total: string; downtime_minutes: number }>(
      `SELECT count(*)::text AS total,
              COALESCE(sum(${downtime}), 0)::float8 AS downtime_minutes
         FROM monitoring.incidents WHERE ${matching}`,
      values
    )
    : { rows: [{ total: "0", downtime_minutes: 0 }] };
  const total = Number(totals[0]?.total ?? 0);
  const totalDowntimeMinutes = Number(totals[0]?.downtime_minutes ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, Math.min(requestedPage, pageCount));
  const { rows } = periodMinutes > 0 ? await cloudSqlPool.query<{
    id: string;
    started_at: Date;
    confirmed_at: Date;
    recovered_at: Date | null;
    last_failure_at: Date;
    failure_count: number;
    downtime_minutes: number;
  }>(
    `SELECT id, started_at, confirmed_at, recovered_at, last_failure_at, failure_count,
            (${downtime})::float8 AS downtime_minutes
       FROM monitoring.incidents
      WHERE ${matching}
      ORDER BY started_at DESC, id DESC
      ${allIncidents ? "" : `LIMIT ${pageSize} OFFSET $5`}`,
    allIncidents ? values : [...values, (page - 1) * pageSize]
  ) : { rows: [] };

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
      downtimeMinutes: Number(row.downtime_minutes),
    })),
    total,
    page,
    pageCount,
    filters: { from, to },
    totalDowntimeMinutes,
    uptimePercent: incidentUptimePercent(periodMinutes, totalDowntimeMinutes),
    periodStartAt: startAt.toISOString(),
    periodEndAt: endAt.toISOString(),
    today,
  };
}
