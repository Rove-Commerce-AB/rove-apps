"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteRadarOrphansAction,
  queueRadarJobAction,
  setRadarJobScheduleAction,
  stopRadarJobAction,
} from "@/app/(app)/radar/actions";
import {
  Badge,
  Button,
  ConfirmModal,
  PageHeader,
  Panel,
  Switch,
} from "@/components/ui";
import { formatOrganizationNumber } from "@/lib/radar/orgNumber";
import {
  RADAR_JOB_LABELS,
  type RadarJobConfig,
  type RadarJobRun,
  type RadarJobType,
  type RadarOrphanCompany,
} from "@/lib/radar/types";

type Props = {
  configs: RadarJobConfig[];
  runs: RadarJobRun[];
  orphanCount: number;
  orphanSample: RadarOrphanCompany[];
  techScanBacklog: {
    withDomainCompanies: number;
    withDomainDomains: number;
    waitingCompanies: number;
    waitingDomains: number;
  };
  domainEnrichmentBacklog: { withoutDomain: number; eligibleNow: number };
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

/** Human duration from started_at → finished_at (or now if still running). */
function formatRunDuration(run: RadarJobRun): string {
  if (!run.started_at) return "—";
  const start = new Date(run.started_at).getTime();
  if (Number.isNaN(start)) return "—";
  const end = run.finished_at
    ? new Date(run.finished_at).getTime()
    : run.status === "running"
      ? Date.now()
      : NaN;
  if (Number.isNaN(end) || end < start) return "—";
  const totalSec = Math.round((end - start) / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
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

function JobProgress({ run }: { run: RadarJobRun }) {
  const { step, detail } = parseStepLabel(run.message);
  const isRunning = run.status === "running";
  const isQueued = run.status === "queued";

  let barPercent: number | null = null;
  let batchTotal: number | null = null;
  const saveMatch = detail.match(/\((\d+)\/(\d+)\)/);
  if (saveMatch) {
    const current = Number(saveMatch[1]);
    const total = Number(saveMatch[2]);
    if (total > 0) {
      batchTotal = total;
      barPercent = Math.min(100, Math.round((current / total) * 100));
    }
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
          Processed {run.processed_count}
          {batchTotal != null ? ` / ${batchTotal}` : ""}
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

export function RadarJobsClient({
  configs: initialConfigs,
  runs: initialRuns,
  orphanCount,
  orphanSample,
  techScanBacklog,
  domainEnrichmentBacklog,
}: Props) {
  const router = useRouter();
  const [configs, setConfigs] = useState(initialConfigs);
  const [runs, setRuns] = useState(initialRuns);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<FeedbackTone>("info");
  const [startingJob, setStartingJob] = useState<RadarJobType | null>(null);
  const [stoppingJob, setStoppingJob] = useState<RadarJobType | null>(null);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [confirmOrphans, setConfirmOrphans] = useState(false);
  const [deletingOrphans, setDeletingOrphans] = useState(false);
  const [workerBusy, setWorkerBusy] = useState(false);
  const workerInFlight = useRef(false);
  const pollInFlight = useRef(false);

  // Keep local state in sync when server props change (e.g. after orphan delete refresh).
  useEffect(() => {
    setConfigs(initialConfigs);
    setRuns(initialRuns);
  }, [initialConfigs, initialRuns]);

  const activeByType = useMemo(() => {
    const map = new Map<RadarJobType, RadarJobRun>();
    for (const config of configs) {
      const active = findActiveRun(runs, config.job_type);
      if (active) map.set(config.job_type, active);
    }
    return map;
  }, [configs, runs]);

  const activeRuns = useMemo(
    () =>
      configs
        .map((c) => activeByType.get(c.job_type))
        .filter(Boolean) as RadarJobRun[],
    [configs, activeByType]
  );

  const shouldPoll =
    activeRuns.length > 0 ||
    startingJob !== null ||
    processingQueue ||
    workerBusy;

  function setFeedback(text: string, nextTone: FeedbackTone = "info") {
    setMessage(text);
    setTone(nextTone);
  }

  const pollStatus = useCallback(async () => {
    if (pollInFlight.current) return;
    pollInFlight.current = true;
    try {
      const res = await fetch("/api/radar/jobs/status", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        configs: RadarJobConfig[];
        runs: RadarJobRun[];
      };
      setConfigs(data.configs);
      setRuns(data.runs);
      // Progress lives in each job card — don't echo it in the page header.
    } catch {
      // ignore transient poll errors
    } finally {
      pollInFlight.current = false;
    }
  }, []);

  async function kickWorker() {
    if (workerInFlight.current) return;
    workerInFlight.current = true;
    setWorkerBusy(true);
    try {
      const res = await fetch("/api/radar/jobs/tick", {
        method: "POST",
        credentials: "same-origin",
      });
      const result = (await res.json().catch(() => null)) as {
        runs?: number;
        details?: string[];
        error?: string;
      } | null;
      if (!res.ok) {
        setFeedback(
          result?.error ?? `Worker failed (${res.status})`,
          "error"
        );
        return;
      }
      const details = result?.details ?? [];
      if (details.length > 0) {
        const failed = details.some((d) => d.includes("failed"));
        setFeedback(details.join(" · "), failed ? "error" : "success");
      } else if ((result?.runs ?? 0) === 0) {
        setFeedback("No queued runs to process.", "info");
      }
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Worker failed",
        "error"
      );
    } finally {
      workerInFlight.current = false;
      setWorkerBusy(false);
      await pollStatus();
      router.refresh();
    }
  }

  useEffect(() => {
    if (!shouldPoll) return;
    void pollStatus();
    const id = window.setInterval(() => {
      void pollStatus();
    }, 1500);
    return () => window.clearInterval(id);
  }, [shouldPoll, pollStatus]);

  async function startJob(jobType: RadarJobType) {
    if (activeByType.has(jobType) || startingJob === jobType) return;
    setStartingJob(jobType);
    setMessage(null);
    try {
      const { run, created } = await queueRadarJobAction(jobType);
      if (!created) {
        setFeedback(
          `${RADAR_JOB_LABELS[jobType]} is already ${run.status}.`,
          "warning"
        );
        await pollStatus();
        return;
      }
      // Optimistic: show the queued run immediately so JobProgress mounts.
      setRuns((prev) => [run, ...prev.filter((r) => r.id !== run.id)]);
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
      await pollStatus();
      router.refresh();
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
        description="Start runs one batch now. Schedule on: the nightly worker (03:00 Europe/Stockholm) loops import matching companies, domain enrichment, and technology scan until the backlog is clear or the time budget is used. SCB directory sync stays on its weekend job."
      >
        <Button
          size="sm"
          variant="secondary"
          disabled={processingQueue || workerBusy}
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
          {processingQueue || workerBusy ? "Processing…" : "Process queue now"}
        </Button>
      </PageHeader>

      <div
        className="min-h-5 text-sm"
        role="status"
        aria-live="polite"
      >
        {message ? <p className={toneClass}>{message}</p> : null}
      </div>

      <Panel>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-heading-m text-text-primary">
                Orphan cleanup
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Companies with no target group, prospect, list membership,
                domain, or Rove customer match. Preview first — nothing is
                deleted automatically.
              </p>
              <p className="mt-2 text-sm text-text-primary">
                {orphanCount === 0
                  ? "No orphans found."
                  : `${orphanCount} orphan${orphanCount === 1 ? "" : "s"} found.`}
              </p>
            </div>
            <Button
              size="sm"
              variant="dangerSecondary"
              disabled={orphanCount === 0 || deletingOrphans}
              onClick={() => setConfirmOrphans(true)}
            >
              Delete orphans
            </Button>
          </div>
          {orphanSample.length > 0 ? (
            <ul className="max-h-40 overflow-y-auto rounded-md border border-border-subtle text-sm">
              {orphanSample.map((company) => (
                <li
                  key={company.id}
                  className="flex flex-wrap gap-x-3 gap-y-0.5 border-t border-border-subtle px-3 py-1.5 first:border-t-0"
                >
                  <span className="text-text-primary">{company.name}</span>
                  <span className="text-text-tertiary">
                    {formatOrganizationNumber(company.organization_number)}
                  </span>
                  {company.county ? (
                    <span className="text-text-tertiary">{company.county}</span>
                  ) : null}
                </li>
              ))}
              {orphanCount > orphanSample.length ? (
                <li className="border-t border-border-subtle px-3 py-1.5 text-text-tertiary">
                  …and {orphanCount - orphanSample.length} more
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </Panel>

      <div className="grid gap-4">
        {configs.map((config) => {
          const active = activeByType.get(config.job_type);
          const isStarting = startingJob === config.job_type;
          const isStopping = stoppingJob === config.job_type;
          const thisBusy = Boolean(active) || isStarting;

          return (
            <Panel key={config.job_type}>
              <div className="flex flex-col p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-heading-m text-text-primary">
                        {RADAR_JOB_LABELS[config.job_type]}
                      </h2>
                      <Badge
                        variant={
                          active
                            ? statusBadgeVariant(active.status)
                            : config.paused
                              ? "warning"
                              : "success"
                        }
                      >
                        {active
                          ? active.status === "running"
                            ? "Running"
                            : active.status === "queued"
                              ? "Queued"
                              : active.status
                          : config.paused
                            ? "Paused"
                            : "Ready"}
                      </Badge>
                      <Badge
                        variant={config.schedule_enabled ? "active" : "muted"}
                      >
                        Schedule {config.schedule_enabled ? "on" : "off"}
                      </Badge>
                    </div>
                    <p className="text-sm text-text-secondary">
                      {config.job_type === "scb_directory_sync"
                        ? "Refreshes the full company directory every Saturday at 02:00 when Schedule is on. This takes many hours, so it runs as its own weekend job—not in the nightly batch."
                        : config.job_type === "tech_scan"
                          ? `Scans up to ${config.max_items_per_run} domains per batch. With Schedule on, the nightly worker loops batches until the backlog is clear or time runs out${
                              config.skip_unchanged
                                ? " (skips sites that have not changed)"
                                : ""
                            }.`
                          : config.job_type === "company_import"
                            ? `Imports companies that match active target groups (up to ${config.max_items_per_run} per batch). With Schedule on, the nightly worker loops while a batch fills completely.`
                            : `Processes up to ${config.max_items_per_run} items per batch. With Schedule on, the nightly worker loops until the backlog is clear or time runs out.`}
                    </p>
                    {config.job_type === "domain_enrichment" ? (
                      <p className="text-sm text-text-primary">
                        {domainEnrichmentBacklog.withoutDomain === 0
                          ? "All companies have a domain."
                          : domainEnrichmentBacklog.eligibleNow ===
                              domainEnrichmentBacklog.withoutDomain
                            ? `${domainEnrichmentBacklog.withoutDomain.toLocaleString("en-US")} ${
                                domainEnrichmentBacklog.withoutDomain === 1
                                  ? "company has"
                                  : "companies have"
                              } no domain.`
                            : `${domainEnrichmentBacklog.withoutDomain.toLocaleString("en-US")} ${
                                domainEnrichmentBacklog.withoutDomain === 1
                                  ? "company has"
                                  : "companies have"
                              } no domain · ${domainEnrichmentBacklog.eligibleNow.toLocaleString("en-US")} ready to enrich now.`}
                      </p>
                    ) : null}
                    {config.job_type === "tech_scan" ? (
                      <p className="text-sm text-text-primary">
                        {techScanBacklog.withDomainCompanies === 0
                          ? "No companies have a domain yet."
                          : techScanBacklog.waitingDomains === 0
                            ? `${techScanBacklog.withDomainCompanies.toLocaleString("en-US")} ${
                                techScanBacklog.withDomainCompanies === 1
                                  ? "company has"
                                  : "companies have"
                              } a domain · all scanned.`
                            : `${techScanBacklog.withDomainCompanies.toLocaleString("en-US")} ${
                                techScanBacklog.withDomainCompanies === 1
                                  ? "company has"
                                  : "companies have"
                              } a domain · ${techScanBacklog.waitingDomains.toLocaleString("en-US")} still waiting to scan.`}
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
                          await pollStatus();
                          router.refresh();
                        }}
                      />
                      Schedule
                    </label>
                    <Button
                      size="sm"
                      className="min-w-[6.5rem]"
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
                      className="min-w-[5.5rem]"
                      disabled={isStopping}
                      onClick={() => stopJob(config.job_type)}
                    >
                      {isStopping ? "Stopping…" : "Stop"}
                    </Button>
                  </div>
                </div>

                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                    active ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    {active ? (
                      <div className="pt-3">
                        <JobProgress run={active} />
                      </div>
                    ) : null}
                  </div>
                </div>
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
                <th className="px-4 py-2 font-medium">Duration</th>
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
                  <td className="px-4 py-3 tabular-nums text-text-secondary">
                    {formatRunDuration(run)}
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
                    colSpan={7}
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

      <ConfirmModal
        isOpen={confirmOrphans}
        title="Delete orphan companies?"
        message={`Permanently delete ${orphanCount} ${
          orphanCount === 1 ? "company" : "companies"
        } with no target group, prospect, list, domain, or customer match? This cannot be undone.`}
        confirmLabel={deletingOrphans ? "Deleting…" : "Delete orphans"}
        onClose={() => {
          if (deletingOrphans) return;
          setConfirmOrphans(false);
        }}
        onConfirm={async () => {
          setDeletingOrphans(true);
          try {
            const { deleted } = await deleteRadarOrphansAction();
            setFeedback(
              deleted === 0
                ? "No orphans left to delete."
                : `Deleted ${deleted} orphan${deleted === 1 ? "" : "s"}.`,
              "success"
            );
            router.refresh();
          } catch (error) {
            setFeedback(
              error instanceof Error
                ? error.message
                : "Could not delete orphans",
              "error"
            );
          } finally {
            setDeletingOrphans(false);
          }
        }}
      />
    </div>
  );
}
