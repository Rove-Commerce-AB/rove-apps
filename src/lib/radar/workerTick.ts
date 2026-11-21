import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { runCompanyBulkImport } from "@/lib/radar/bulk/importBulk";
import { runDomainEnrichmentJob } from "@/lib/radar/domainEnrichment";
import { runScbDirectorySync } from "@/lib/radar/scb/directorySync";
import {
  claimNextQueuedRun,
  countRadarDomainEnrichmentBacklog,
  countRadarTechScanBacklog,
  finishRadarJobRun,
  getRadarJobConfig,
  isJobPaused,
  queueRadarJobRun,
  updateRadarJobRunProgress,
} from "@/lib/radar/jobs";
import { scanRadarDomain } from "@/lib/radar/techScan";
import type { RadarJobType } from "@/lib/radar/types";

/** Stay under Cloud Run HTTP timeout (900s on /api/radar/jobs/run). */
const SCHEDULE_LOOP_BUDGET_MS = Number(
  process.env.RADAR_WORKER_BUDGET_MS ?? 12 * 60 * 1000
);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scheduledJobHasBacklog(
  jobType: RadarJobType
): Promise<boolean> {
  switch (jobType) {
    case "scb_directory_sync":
      return false;
    case "tech_scan": {
      const backlog = await countRadarTechScanBacklog();
      return backlog.waitingDomains > 0;
    }
    case "domain_enrichment": {
      const backlog = await countRadarDomainEnrichmentBacklog();
      return backlog.eligibleNow > 0;
    }
    case "company_import":
      // Cursor/exhaustion is handled inside the import; always allow a pass
      // when Schedule is on. Further passes use shouldContinueScheduledJob.
      return true;
  }
}

async function shouldContinueScheduledJob(
  jobType: RadarJobType,
  result: { processed: number },
  maxItems: number
): Promise<boolean> {
  if (jobType === "scb_directory_sync") return false;
  if (jobType === "company_import") {
    // Another chunk only if this one filled the batch cap.
    return maxItems > 0 && result.processed >= maxItems;
  }
  return scheduledJobHasBacklog(jobType);
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
  const result = await runDomainEnrichmentJob({
    maxItems,
    delayMs,
    isPaused: () => isJobPaused("domain_enrichment"),
    onProgress: async (progress) => {
      await updateRadarJobRunProgress(runId, {
        message: progress.message,
        processedCount: progress.processed,
        errorCount: progress.errors,
      });
    },
  });
  return {
    processed: result.processed,
    errors: result.errors,
    message: result.message,
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

async function runDirectorySync(
  runId: string,
  trigger: string
): Promise<{ processed: number; errors: number; message: string }> {
  const result = await runScbDirectorySync({
    trigger:
      trigger === "schedule" || trigger === "worker" ? "schedule" : "manual",
    isPaused: () => isJobPaused("scb_directory_sync"),
    onProgress: async (progress) => {
      await updateRadarJobRunProgress(runId, {
        message: progress.message,
        processedCount: progress.processed,
      });
    },
  });
  return {
    processed: result.processed,
    errors: 0,
    message: result.message,
  };
}

async function executeJobType(
  jobType: RadarJobType,
  runId: string,
  trigger: string
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
    case "scb_directory_sync":
      return runDirectorySync(runId, trigger);
  }
}

/**
 * One worker tick: claim queued runs, and optionally enqueue schedule-enabled jobs.
 * When enqueueScheduled is true (nightly worker), re-queues domain/tech/import
 * while backlog remains, until the time budget is hit. SCB directory sync is
 * never looped here (weekend Cloud Run Job).
 */
export async function runRadarWorkerTick(options?: {
  enqueueScheduled?: boolean;
}): Promise<{ runs: number; details: string[] }> {
  const details: string[] = [];
  const enqueueScheduled = options?.enqueueScheduled !== false;
  const startedAt = Date.now();
  const budgetLeft = () => Date.now() - startedAt < SCHEDULE_LOOP_BUDGET_MS;

  if (enqueueScheduled) {
    const configs = await cloudSqlPool.query<{
      job_type: RadarJobType;
      schedule_enabled: boolean;
      paused: boolean;
    }>(`SELECT job_type, schedule_enabled, paused FROM radar_job_configs`);

    for (const config of configs.rows) {
      if (!config.schedule_enabled || config.paused) continue;
      // Full SCB directory sync takes many hours; Cloud Run HTTP times out at
      // 15m. Weekend Cloud Run Job (scripts/radar-scb-directory-sync.mjs) owns it.
      if (config.job_type === "scb_directory_sync") continue;
      if (!(await scheduledJobHasBacklog(config.job_type))) continue;
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
    if (enqueueScheduled && !budgetLeft()) {
      details.push(
        `Stopped looping: time budget reached (${Math.round(SCHEDULE_LOOP_BUDGET_MS / 60000)} min)`
      );
      break;
    }

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
      const config = await getRadarJobConfig(run.job_type);
      const result = await executeJobType(run.job_type, run.id, run.trigger);
      const pausedMidway = await isJobPaused(run.job_type);
      await finishRadarJobRun(run.id, {
        status: pausedMidway ? "paused" : "completed",
        processedCount: result.processed,
        errorCount: result.errors,
        message: result.message,
      });
      details.push(`${run.job_type}: ${result.message}`);

      // Nightly: keep chunking while backlog remains (except SCB sync).
      if (
        enqueueScheduled &&
        run.trigger === "schedule" &&
        !pausedMidway &&
        budgetLeft() &&
        config &&
        (await shouldContinueScheduledJob(
          run.job_type,
          result,
          config.max_items_per_run
        ))
      ) {
        const { created } = await queueRadarJobRun({
          jobType: run.job_type,
          trigger: "schedule",
        });
        if (created) {
          details.push(`Re-queued ${run.job_type} (backlog remains)`);
        }
      }
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
