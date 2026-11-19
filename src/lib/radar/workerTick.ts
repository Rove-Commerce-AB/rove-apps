import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { runCompanyBulkImport } from "@/lib/radar/bulk/importBulk";
import { addRadarDomain } from "@/lib/radar/companies";
import {
  claimNextQueuedRun,
  finishRadarJobRun,
  getRadarJobConfig,
  isJobPaused,
  queueRadarJobRun,
  updateRadarJobRunProgress,
} from "@/lib/radar/jobs";
import { refreshCompanyCustomerMatch } from "@/lib/radar/matching";
import { normalizeHostname } from "@/lib/radar/orgNumber";
import { scanRadarDomain } from "@/lib/radar/techScan";
import type { RadarJobType } from "@/lib/radar/types";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCompanyImport(
  runId: string,
  maxItems: number
): Promise<{
  processed: number;
  errors: number;
  message: string;
}> {
  const result = await runCompanyBulkImport({
    maxItems,
    onProgress: async (progress) => {
      await updateRadarJobRunProgress(runId, {
        message: progress.message,
        processedCount: progress.processed ?? progress.matched ?? 0,
      });
    },
  });
  return {
    processed: result.processed,
    errors: 0,
    message: result.message,
  };
}

async function runDomainEnrichment(
  runId: string,
  maxItems: number,
  delayMs: number
): Promise<{ processed: number; errors: number; message: string }> {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    organization_number: string;
    matched_customer_id: string | null;
    customer_url: string | null;
  }>(
    `SELECT c.id, c.organization_number, c.matched_customer_id, cust.url AS customer_url
     FROM radar_companies c
     LEFT JOIN customers cust ON cust.id = c.matched_customer_id
     WHERE c.matched_customer_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM radar_domains d WHERE d.company_id = c.id)
        OR (
          cust.url IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM radar_domains d WHERE d.company_id = c.id AND d.source = 'customer'
          )
        )
     ORDER BY c.updated_at ASC
     LIMIT $1`,
    [maxItems]
  );

  await updateRadarJobRunProgress(runId, {
    message: `Step 1/1 · Matching domains (0/${rows.length})`,
    processedCount: 0,
  });

  let processed = 0;
  let errors = 0;
  for (const row of rows) {
    if (await isJobPaused("domain_enrichment")) break;
    try {
      await refreshCompanyCustomerMatch(row.id);
      const { rows: refreshed } = await cloudSqlPool.query<{
        matched_customer_id: string | null;
        url: string | null;
      }>(
        `SELECT c.matched_customer_id, cust.url
         FROM radar_companies c
         LEFT JOIN customers cust ON cust.id = c.matched_customer_id
         WHERE c.id = $1`,
        [row.id]
      );
      const url = refreshed[0]?.url;
      const host = url ? normalizeHostname(url) : null;
      if (host) {
        await addRadarDomain({
          companyId: row.id,
          hostname: host,
          isPrimary: true,
          source: "customer",
        });
      }
      processed += 1;
    } catch {
      errors += 1;
    }
    if (processed % 5 === 0 || processed + errors === rows.length) {
      await updateRadarJobRunProgress(runId, {
        message: `Step 1/1 · Matching domains (${processed + errors}/${rows.length})`,
        processedCount: processed,
        errorCount: errors,
      });
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  return {
    processed,
    errors,
    message: `Enriched ${processed} companies`,
  };
}

async function runTechScan(
  runId: string,
  maxItems: number,
  delayMs: number
): Promise<{ processed: number; errors: number; message: string }> {
  const { rows } = await cloudSqlPool.query<{ id: string }>(
    `SELECT id FROM radar_domains
     WHERE scan_status IN ('pending', 'failed')
        OR last_scanned_at IS NULL
     ORDER BY last_scanned_at NULLS FIRST, created_at ASC
     LIMIT $1`,
    [maxItems]
  );

  await updateRadarJobRunProgress(runId, {
    message: `Step 1/1 · Scanning domains (0/${rows.length})`,
    processedCount: 0,
  });

  let processed = 0;
  let errors = 0;
  for (const row of rows) {
    if (await isJobPaused("tech_scan")) break;
    try {
      await scanRadarDomain(row.id);
      processed += 1;
    } catch {
      errors += 1;
    }
    if (processed % 3 === 0 || processed + errors === rows.length) {
      await updateRadarJobRunProgress(runId, {
        message: `Step 1/1 · Scanning domains (${processed + errors}/${rows.length})`,
        processedCount: processed,
        errorCount: errors,
      });
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  return {
    processed,
    errors,
    message: `Scanned ${processed} domains`,
  };
}

async function executeJobType(
  jobType: RadarJobType,
  runId: string
): Promise<{
  processed: number;
  errors: number;
  message: string;
}> {
  const config = await getRadarJobConfig(jobType);
  if (!config) throw new Error(`Missing config for ${jobType}`);
  if (config.paused) {
    return { processed: 0, errors: 0, message: "Job is paused" };
  }

  switch (jobType) {
    case "company_import":
      return runCompanyImport(runId, config.max_items_per_run);
    case "domain_enrichment":
      return runDomainEnrichment(
        runId,
        config.max_items_per_run,
        config.request_delay_ms
      );
    case "tech_scan":
      return runTechScan(
        runId,
        config.max_items_per_run,
        config.request_delay_ms
      );
  }
}

/**
 * One worker tick: claim queued runs, and optionally enqueue schedule-enabled jobs.
 */
export async function runRadarWorkerTick(options?: {
  enqueueScheduled?: boolean;
}): Promise<{ runs: number; details: string[] }> {
  const details: string[] = [];

  if (options?.enqueueScheduled !== false) {
    const configs = await cloudSqlPool.query<{
      job_type: RadarJobType;
      schedule_enabled: boolean;
      paused: boolean;
    }>(`SELECT job_type, schedule_enabled, paused FROM radar_job_configs`);

    for (const config of configs.rows) {
      if (!config.schedule_enabled || config.paused) continue;
      const { rows: active } = await cloudSqlPool.query(
        `SELECT 1 FROM radar_job_runs
         WHERE job_type = $1 AND status IN ('queued', 'running')
         LIMIT 1`,
        [config.job_type]
      );
      if (active[0]) continue;
      await queueRadarJobRun({
        jobType: config.job_type,
        trigger: "schedule",
      });
      details.push(`Enqueued schedule for ${config.job_type}`);
    }
  }

  let runs = 0;
  for (;;) {
    const run = await claimNextQueuedRun();
    if (!run) break;
    runs += 1;
    try {
      if (await isJobPaused(run.job_type)) {
        await finishRadarJobRun(run.id, {
          status: "paused",
          message: "Paused before start",
        });
        details.push(`${run.job_type}: paused`);
        continue;
      }
      const result = await executeJobType(run.job_type, run.id);
      const pausedMidway = await isJobPaused(run.job_type);
      await finishRadarJobRun(run.id, {
        status: pausedMidway ? "paused" : "completed",
        processedCount: result.processed,
        errorCount: result.errors,
        message: result.message,
      });
      details.push(`${run.job_type}: ${result.message}`);
    } catch (error) {
      await finishRadarJobRun(run.id, {
        status: "failed",
        message: "Job failed",
        errorDetail: error instanceof Error ? error.message : String(error),
      });
      details.push(
        `${run.job_type}: failed – ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return { runs, details };
}
