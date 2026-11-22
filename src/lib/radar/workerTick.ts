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

/** Nightly pipeline order: import companies, then enrich domains, then tech scan. */
const NIGHTLY_PIPELINE: RadarJobType[] = [
  "company_import",
  "domain_enrichment",
  "tech_scan",
];

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

async function hasActiveOrQueuedRun(jobType: RadarJobType): Promise<boolean> {
  const { rows } = await cloudSqlPool.query(
    `SELECT 1 FROM radar_job_runs
     WHERE job_type = $1 AND status IN ('queued', 'running')
     LIMIT 1`,
    [jobType]
  );
  return Boolean(rows[0]);
}

async function ensureScheduledRunQueued(
  jobType: RadarJobType,
  details: string[]
): Promise<void> {
  if (await hasActiveOrQueuedRun(jobType)) return;
  const { created } = await queueRadarJobRun({
    jobType,
    trigger: "schedule",
  });
  if (created) details.push(`Enqueued schedule for ${jobType}`);
}

type ClaimedRun = NonNullable<Awaited<ReturnType<typeof claimNextQueuedRun>>>;

async function executeClaimedRun(
  run: ClaimedRun,
  details: string[]
): Promise<{
  shouldContinue: boolean;
  paused: boolean;
}> {
  if (await isJobPaused(run.job_type)) {
    await finishRadarJobRun(run.id, {
      status: "paused",
      message: "Paused before start",
    });
    details.push(`${run.job_type}: paused`);
    return { shouldContinue: false, paused: true };
  }

  const config = await getRadarJobConfig(run.job_type);
  try {
    const result = await executeJobType(run.job_type, run.id, run.trigger);
    const pausedMidway = await isJobPaused(run.job_type);
    await finishRadarJobRun(run.id, {
      status: pausedMidway ? "paused" : "completed",
      processedCount: result.processed,
      errorCount: result.errors,
      message: result.message,
    });
    details.push(`${run.job_type}: ${result.message}`);
    if (pausedMidway || !config) {
      return { shouldContinue: false, paused: pausedMidway };
    }
    const shouldContinue = await shouldContinueScheduledJob(
      run.job_type,
      result,
      config.max_items_per_run
    );
    return { shouldContinue, paused: false };
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
    return { shouldContinue: false, paused: false };
  }
}

/**
 * One worker tick.
 * - Nightly (`enqueueScheduled`): runs import → domain → tech in order, chunking
 *   each stage until backlog is clear or the time budget is hit. SCB directory
 *   sync is never looped here (weekend Cloud Run Job).
 * - Manual queue drain: claims any queued run FIFO without starting new schedule.
 */
export async function runRadarWorkerTick(options?: {
  enqueueScheduled?: boolean;
}): Promise<{ runs: number; details: string[] }> {
  const details: string[] = [];
  const enqueueScheduled = options?.enqueueScheduled !== false;
  const startedAt = Date.now();
  const budgetLeft = () => Date.now() - startedAt < SCHEDULE_LOOP_BUDGET_MS;
  const budgetMinutes = () => Math.round(SCHEDULE_LOOP_BUDGET_MS / 60000);
  let runs = 0;

  if (enqueueScheduled) {
    details.push(
      "Nightly pipeline: company_import → domain_enrichment → tech_scan"
    );

    for (const jobType of NIGHTLY_PIPELINE) {
      if (!budgetLeft()) {
        details.push(
          `Stopped pipeline: time budget reached (${budgetMinutes()} min)`
        );
        break;
      }

      const config = await getRadarJobConfig(jobType);
      if (!config?.schedule_enabled || config.paused) {
        details.push(`${jobType}: skipped (schedule off or paused)`);
        continue;
      }

      details.push(`${jobType}: stage start`);

      while (budgetLeft()) {
        // Domain/tech only start when there is work. Import always takes at
        // least one pass; further passes follow shouldContinue (full batch).
        if (
          jobType !== "company_import" &&
          !(await scheduledJobHasBacklog(jobType))
        ) {
          details.push(`${jobType}: stage done (no backlog)`);
          break;
        }

        await ensureScheduledRunQueued(jobType, details);
        const run = await claimNextQueuedRun(jobType);
        if (!run) {
          details.push(`${jobType}: stage done (nothing to claim)`);
          break;
        }

        runs += 1;
        const { shouldContinue, paused } = await executeClaimedRun(
          run,
          details
        );
        if (paused) {
          details.push(`${jobType}: stage stopped (paused)`);
          break;
        }
        if (!shouldContinue) {
          details.push(`${jobType}: stage done`);
          break;
        }
        if (!budgetLeft()) {
          details.push(
            `Stopped pipeline: time budget reached (${budgetMinutes()} min)`
          );
          break;
        }
        const { created } = await queueRadarJobRun({
          jobType,
          trigger: "schedule",
        });
        if (created) {
          details.push(`Re-queued ${jobType} (backlog remains)`);
        }
      }
    }

    // Drain leftover queued runs (e.g. manual) without starting new stages.
    while (budgetLeft()) {
      const run = await claimNextQueuedRun();
      if (!run) break;
      runs += 1;
      await executeClaimedRun(run, details);
    }

    return { runs, details };
  }

  // Manual / tick: process whatever is already queued.
  for (;;) {
    const run = await claimNextQueuedRun();
    if (!run) break;
    runs += 1;
    await executeClaimedRun(run, details);
  }

  return { runs, details };
}
