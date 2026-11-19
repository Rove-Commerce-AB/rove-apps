import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import type {
  RadarJobConfig,
  RadarJobRun,
  RadarJobRunStatus,
  RadarJobType,
} from "@/lib/radar/types";
import { RADAR_JOB_TYPES } from "@/lib/radar/types";

function mapConfig(row: Record<string, unknown>): RadarJobConfig {
  return {
    job_type: row.job_type as RadarJobType,
    schedule_enabled: Boolean(row.schedule_enabled),
    schedule_cron: String(row.schedule_cron),
    paused: Boolean(row.paused),
    max_items_per_run: Number(row.max_items_per_run),
    max_parallelism: Number(row.max_parallelism),
    request_delay_ms: Number(row.request_delay_ms),
    skip_unchanged: Boolean(row.skip_unchanged),
    settings: (row.settings as Record<string, unknown>) ?? {},
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapRun(row: Record<string, unknown>): RadarJobRun {
  return {
    id: String(row.id),
    job_type: row.job_type as RadarJobType,
    trigger: String(row.trigger),
    status: row.status as RadarJobRunStatus,
    requested_by: (row.requested_by as string | null) ?? null,
    started_at: row.started_at
      ? new Date(String(row.started_at)).toISOString()
      : null,
    finished_at: row.finished_at
      ? new Date(String(row.finished_at)).toISOString()
      : null,
    processed_count: Number(row.processed_count),
    error_count: Number(row.error_count),
    message: (row.message as string | null) ?? null,
    error_detail: (row.error_detail as string | null) ?? null,
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

export function isRadarJobType(value: string): value is RadarJobType {
  return (RADAR_JOB_TYPES as readonly string[]).includes(value);
}

export async function listRadarJobConfigs(): Promise<RadarJobConfig[]> {
  const { rows } = await cloudSqlPool.query(
    `SELECT * FROM radar_job_configs ORDER BY job_type`
  );
  return rows.map(mapConfig);
}

export async function getRadarJobConfig(
  jobType: RadarJobType
): Promise<RadarJobConfig | null> {
  const { rows } = await cloudSqlPool.query(
    `SELECT * FROM radar_job_configs WHERE job_type = $1`,
    [jobType]
  );
  return rows[0] ? mapConfig(rows[0]) : null;
}

export async function updateRadarJobConfig(
  jobType: RadarJobType,
  input: Partial<{
    schedule_enabled: boolean;
    schedule_cron: string;
    paused: boolean;
    max_items_per_run: number;
    max_parallelism: number;
    request_delay_ms: number;
    skip_unchanged: boolean;
  }>
): Promise<RadarJobConfig> {
  await cloudSqlPool.query(
    `UPDATE radar_job_configs SET
       schedule_enabled = COALESCE($2, schedule_enabled),
       schedule_cron = COALESCE($3, schedule_cron),
       paused = COALESCE($4, paused),
       max_items_per_run = COALESCE($5, max_items_per_run),
       max_parallelism = COALESCE($6, max_parallelism),
       request_delay_ms = COALESCE($7, request_delay_ms),
       skip_unchanged = COALESCE($8, skip_unchanged)
     WHERE job_type = $1`,
    [
      jobType,
      input.schedule_enabled ?? null,
      input.schedule_cron ?? null,
      input.paused ?? null,
      input.max_items_per_run ?? null,
      input.max_parallelism ?? null,
      input.request_delay_ms ?? null,
      input.skip_unchanged ?? null,
    ]
  );
  const config = await getRadarJobConfig(jobType);
  if (!config) throw new Error("Job config not found");
  return config;
}

export async function getActiveRadarJobRun(
  jobType: RadarJobType
): Promise<RadarJobRun | null> {
  const { rows } = await cloudSqlPool.query(
    `SELECT * FROM radar_job_runs
     WHERE job_type = $1 AND status IN ('queued', 'running')
     ORDER BY created_at DESC
     LIMIT 1`,
    [jobType]
  );
  return rows[0] ? mapRun(rows[0]) : null;
}

export async function queueRadarJobRun(input: {
  jobType: RadarJobType;
  trigger?: "manual" | "schedule" | "worker";
  requestedBy?: string | null;
}): Promise<{ run: RadarJobRun; created: boolean }> {
  const existing = await getActiveRadarJobRun(input.jobType);
  if (existing) {
    return { run: existing, created: false };
  }

  const { rows } = await cloudSqlPool.query(
    `INSERT INTO radar_job_runs (job_type, trigger, status, requested_by, message)
     VALUES ($1, $2, 'queued', $3, $4)
     RETURNING *`,
    [
      input.jobType,
      input.trigger ?? "manual",
      input.requestedBy ?? null,
      "Queued from Radar",
    ]
  );
  return { run: mapRun(rows[0]), created: true };
}

export async function updateRadarJobRunProgress(
  runId: string,
  input: {
    message?: string;
    processedCount?: number;
    errorCount?: number;
  }
): Promise<void> {
  await cloudSqlPool.query(
    `UPDATE radar_job_runs SET
       message = COALESCE($2, message),
       processed_count = COALESCE($3, processed_count),
       error_count = COALESCE($4, error_count)
     WHERE id = $1 AND status = 'running'`,
    [
      runId,
      input.message ?? null,
      input.processedCount ?? null,
      input.errorCount ?? null,
    ]
  );
}

/** Pause config and mark active/queued runs as paused. */
export async function stopRadarJob(jobType: RadarJobType): Promise<void> {
  await cloudSqlPool.query(
    `UPDATE radar_job_configs SET paused = true WHERE job_type = $1`,
    [jobType]
  );
  await cloudSqlPool.query(
    `UPDATE radar_job_runs
     SET status = 'paused',
         finished_at = COALESCE(finished_at, now()),
         message = COALESCE(message, 'Paused from Radar')
     WHERE job_type = $1 AND status IN ('queued', 'running')`,
    [jobType]
  );
}

export async function resumeRadarJob(jobType: RadarJobType): Promise<void> {
  await cloudSqlPool.query(
    `UPDATE radar_job_configs SET paused = false WHERE job_type = $1`,
    [jobType]
  );
}

export async function listRadarJobRuns(limit = 50): Promise<RadarJobRun[]> {
  const { rows } = await cloudSqlPool.query(
    `SELECT * FROM radar_job_runs
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map(mapRun);
}

export async function claimNextQueuedRun(
  jobType?: RadarJobType
): Promise<RadarJobRun | null> {
  const { rows } = await cloudSqlPool.query(
    `WITH next_run AS (
       SELECT r.id
       FROM radar_job_runs r
       JOIN radar_job_configs c ON c.job_type = r.job_type
       WHERE r.status = 'queued'
         AND c.paused = false
         AND ($1::text IS NULL OR r.job_type = $1)
       ORDER BY r.created_at ASC
       LIMIT 1
       FOR UPDATE OF r SKIP LOCKED
     )
     UPDATE radar_job_runs r
     SET status = 'running', started_at = now(), message = 'Running'
     FROM next_run
     WHERE r.id = next_run.id
     RETURNING r.*`,
    [jobType ?? null]
  );
  return rows[0] ? mapRun(rows[0]) : null;
}

export async function finishRadarJobRun(
  runId: string,
  input: {
    status: Extract<
      RadarJobRunStatus,
      "completed" | "failed" | "paused" | "cancelled"
    >;
    processedCount?: number;
    errorCount?: number;
    message?: string | null;
    errorDetail?: string | null;
  }
): Promise<void> {
  await cloudSqlPool.query(
    `UPDATE radar_job_runs SET
       status = $2,
       finished_at = now(),
       processed_count = COALESCE($3, processed_count),
       error_count = COALESCE($4, error_count),
       message = COALESCE($5, message),
       error_detail = COALESCE($6, error_detail)
     WHERE id = $1`,
    [
      runId,
      input.status,
      input.processedCount ?? null,
      input.errorCount ?? null,
      input.message ?? null,
      input.errorDetail ?? null,
    ]
  );
}

export async function isJobPaused(jobType: RadarJobType): Promise<boolean> {
  const config = await getRadarJobConfig(jobType);
  return Boolean(config?.paused);
}

