"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  queueRadarJobAction,
  runRadarWorkerTickAction,
  setRadarJobScheduleAction,
  stopRadarJobAction,
} from "@/app/(app)/radar/actions";
import {
  Badge,
  Button,
  PageHeader,
  Panel,
  Switch,
} from "@/components/ui";
import {
  RADAR_JOB_LABELS,
  type RadarJobConfig,
  type RadarJobRun,
  type RadarJobType,
} from "@/lib/radar/types";

type Props = {
  configs: RadarJobConfig[];
  runs: RadarJobRun[];
};

type FeedbackTone = "info" | "success" | "error" | "warning";

function statusBadgeVariant(
  status: RadarJobRun["status"]
): "success" | "error" | "warning" | "muted" | "active" {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "paused":
      return "warning";
    case "running":
      return "active";
    default:
      return "muted";
  }
}

function findActiveRun(
  runs: RadarJobRun[],
  jobType: RadarJobType
): RadarJobRun | undefined {
  return runs.find(
    (run) =>
      run.job_type === jobType &&
      (run.status === "queued" || run.status === "running")
  );
}

const RUN_TIME_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Stockholm",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Built from formatToParts so Node/browser never disagree on separators. */
function formatRunCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = Object.fromEntries(
    RUN_TIME_PARTS.formatToParts(d)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function parseStepLabel(message: string | null): {
  step: string | null;
  detail: string;
} {
  if (!message) return { step: null, detail: "Waiting…" };
  const match = message.match(/^(Step\s+\d+\/\d+)\s*·\s*(.*)$/i);
  if (match) return { step: match[1]!, detail: match[2]! };
  return { step: null, detail: message };
}

function JobProgress({
  run,
  maxItems,
}: {
  run: RadarJobRun;
  maxItems: number;
}) {
  const { step, detail } = parseStepLabel(run.message);
  const isRunning = run.status === "running";
  const isQueued = run.status === "queued";

  let barPercent: number | null = null;
  const saveMatch = detail.match(/\((\d+)\/(\d+)\)/);
  if (saveMatch) {
    const current = Number(saveMatch[1]);
    const total = Number(saveMatch[2]) || maxItems;
    if (total > 0) barPercent = Math.min(100, Math.round((current / total) * 100));
  } else if (isQueued) {
    barPercent = 0;
  }

  return (
    <div className="mt-2 rounded-md border border-border-subtle bg-bg-muted/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
        {step ? (
          <span className="font-medium text-text-primary">{step}</span>
        ) : null}
        <span className="text-text-secondary">{detail}</span>
      </div>
      {run.processed_count > 0 || run.error_count > 0 ? (
        <p className="mt-1 text-xs text-text-tertiary">
          Saved {run.processed_count}
          {maxItems ? ` / ${maxItems}` : ""}
          {run.error_count > 0 ? ` · ${run.error_count} errors` : ""}
        </p>
      ) : null}
      {barPercent != null ? (
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-border-subtle"
          aria-hidden
        >
          <div
            className={`h-full rounded-full bg-brand-signal transition-[width] duration-500 ${
              isRunning && barPercent < 100 ? "opacity-90" : ""
            }`}
            style={{ width: `${isQueued ? 8 : Math.max(barPercent, 4)}%` }}
          />
        </div>
      ) : isRunning ? (
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-border-subtle"
          aria-hidden
        >
          <div className="h-full w-1/3 rounded-full bg-brand-signal/80 motion-safe:animate-pulse" />
        </div>
      ) : null}
    </div>
  );
}

export function RadarJobsClient({ configs, runs }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<FeedbackTone>("info");
  const [startingJob, setStartingJob] = useState<RadarJobType | null>(null);
  const [stoppingJob, setStoppingJob] = useState<RadarJobType | null>(null);
  const [processingQueue, setProcessingQueue] = useState(false);
  const workerInFlight = useRef(false);

  const activeByType = useMemo(() => {
    const map = new Map<RadarJobType, RadarJobRun>();
    for (const config of configs) {
      const active = findActiveRun(runs, config.job_type);
      if (active) map.set(config.job_type, active);
    }
    return map;
  }, [configs, runs]);

  const activeRuns = useMemo(
    () => configs.map((c) => activeByType.get(c.job_type)).filter(Boolean) as RadarJobRun[],
    [configs, activeByType]
  );

  const shouldPoll =
    activeRuns.length > 0 || startingJob !== null || processingQueue;

  function refreshQuietly() {
    // Avoid useTransition `pending` — it was disabling every Start button on each poll.
    router.refresh();
  }

  function setFeedback(text: string, nextTone: FeedbackTone = "info") {
    setMessage(text);
    setTone(nextTone);
  }

  async function kickWorker() {
    if (workerInFlight.current) return;
    workerInFlight.current = true;
    try {
      const result = await runRadarWorkerTickAction();
      if (result.details.length > 0) {
        const failed = result.details.some((d) => d.includes("failed"));
        setFeedback(
          result.details.join(" · "),
          failed ? "error" : "success"
        );
      } else if (result.runs === 0) {
        setFeedback("No queued runs to process.", "info");
      }
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Worker failed",
        "error"
      );
    } finally {
      workerInFlight.current = false;
      refreshQuietly();
    }
  }

  useEffect(() => {
    if (!shouldPoll) return;
    const id = window.setInterval(() => {
      refreshQuietly();
    }, 2000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPoll]);

  async function startJob(jobType: RadarJobType) {
    if (activeByType.has(jobType) || startingJob === jobType) return;
    setStartingJob(jobType);
    setFeedback(`${RADAR_JOB_LABELS[jobType]}: queuing…`, "info");
    try {
      const { run, created } = await queueRadarJobAction(jobType);
      if (!created) {
        setFeedback(
          `${RADAR_JOB_LABELS[jobType]} is already ${run.status}.`,
          "warning"
        );
        refreshQuietly();
        return;
      }
      setFeedback(`${RADAR_JOB_LABELS[jobType]} started.`, "info");
      refreshQuietly();
      void kickWorker();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not start job",
        "error"
      );
    } finally {
      setStartingJob(null);
    }
  }

  async function stopJob(jobType: RadarJobType) {
    setStoppingJob(jobType);
    try {
      await stopRadarJobAction(jobType);
      setFeedback(`${RADAR_JOB_LABELS[jobType]} stopped.`, "warning");
      refreshQuietly();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not stop job",
        "error"
      );
    } finally {
      setStoppingJob(null);
    }
  }

  const toneClass =
    tone === "success"
      ? "text-status-success"
      : tone === "error"
        ? "text-danger"
        : tone === "warning"
          ? "text-status-warning"
          : "text-text-secondary";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Jobs"
        description="Start runs a job once now. Schedule is separate. Active jobs show live step progress below."
      >
        <Button
          size="sm"
          variant="secondary"
          disabled={processingQueue}
          onClick={async () => {
            setProcessingQueue(true);
            setFeedback("Processing queue…", "info");
            try {
              await kickWorker();
            } finally {
              setProcessingQueue(false);
            }
          }}
        >
          {processingQueue ? "Processing…" : "Process queue now"}
        </Button>
      </PageHeader>

      {message ? (
        <p className={`text-sm ${toneClass}`} role="status" aria-live="polite">
          {message}
        </p>
      ) : null}

      <div className="grid gap-4">
        {configs.map((config) => {
          const active = activeByType.get(config.job_type);
          const isStarting = startingJob === config.job_type;
          const isStopping = stoppingJob === config.job_type;
          const thisBusy = Boolean(active) || isStarting;

          return (
            <Panel key={config.job_type}>
              <div className="flex flex-col gap-3 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-heading-m text-text-primary">
                        {RADAR_JOB_LABELS[config.job_type]}
                      </h2>
                      {!active ? (
                        <Badge variant={config.paused ? "warning" : "success"}>
                          {config.paused ? "Paused" : "Ready"}
                        </Badge>
                      ) : null}
                      <Badge
                        variant={config.schedule_enabled ? "active" : "muted"}
                      >
                        Schedule {config.schedule_enabled ? "on" : "off"}
                      </Badge>
                    </div>
                    <p className="text-sm text-text-secondary">
                      Max {config.max_items_per_run} items / run · delay{" "}
                      {config.request_delay_ms} ms · parallelism{" "}
                      {config.max_parallelism}
                      {config.job_type === "tech_scan" && config.skip_unchanged
                        ? " · skip unchanged"
                        : ""}
                    </p>
                    {!active ? (
                      <p className="text-xs text-text-tertiary">
                        Cron hint: {config.schedule_cron} (enforced by Cloud
                        Scheduler)
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-text-secondary">
                      <Switch
                        checked={config.schedule_enabled}
                        disabled={thisBusy}
                        onCheckedChange={async (checked) => {
                          await setRadarJobScheduleAction(
                            config.job_type,
                            checked
                          );
                          refreshQuietly();
                        }}
                      />
                      Schedule
                    </label>
                    <Button
                      size="sm"
                      disabled={thisBusy}
                      onClick={() => startJob(config.job_type)}
                    >
                      {isStarting
                        ? "Starting…"
                        : active
                          ? active.status === "running"
                            ? "Running…"
                            : "Queued…"
                          : "Start"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isStopping}
                      onClick={() => stopJob(config.job_type)}
                    >
                      {isStopping ? "Stopping…" : "Stop"}
                    </Button>
                  </div>
                </div>

                {active ? (
                  <JobProgress
                    run={active}
                    maxItems={config.max_items_per_run}
                  />
                ) : null}
              </div>
            </Panel>
          );
        })}
      </div>

      <Panel>
        <div className="overflow-x-auto p-0">
          <div className="border-b border-border-subtle px-4 py-3 text-heading-m text-text-primary">
            Run history
          </div>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-table-header text-text-secondary">
              <tr>
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Trigger</th>
                <th className="px-4 py-2 font-medium">Processed</th>
                <th className="px-4 py-2 font-medium">Message</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run.id}
                  className={
                    run.status === "running" || run.status === "queued"
                      ? "border-t border-border-subtle bg-status-success-subtle/50"
                      : "border-t border-border-subtle"
                  }
                >
                  <td className="px-4 py-3 text-text-primary">
                    {RADAR_JOB_LABELS[run.job_type]}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusBadgeVariant(run.status)}>
                      {run.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {run.trigger}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {run.processed_count}
                    {run.error_count > 0 ? ` / ${run.error_count} err` : ""}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {run.message ?? "—"}
                    {run.error_detail ? (
                      <div className="text-danger">{run.error_detail}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-text-tertiary">
                    {formatRunCreatedAt(run.created_at)}
                  </td>
                </tr>
              ))}
              {runs.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-text-secondary"
                  >
                    No runs yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
