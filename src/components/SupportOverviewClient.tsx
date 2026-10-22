"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Clock,
  Hash,
  Link2,
  Pause,
  Pencil,
  Play,
  Plus,
  Timer,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  Button,
  ConfirmModal,
  Dialog,
  Input,
  PageHeader,
  Panel,
} from "@/components/ui";
import {
  createMonitor,
  deleteMonitor,
  setMonitorEnabled,
  updateMonitor,
  type Monitor,
  type MonitorInput,
  type SlackNotificationOption,
} from "@/lib/monitors";
import {
  supportCustomerMonitorsHref,
  supportMonitorIncidentsHref,
} from "@/lib/routes";
import { compareTextSv } from "@/lib/sort";

type CustomerOption = { id: string; name: string };

type Props = {
  monitors: Monitor[];
  customers: CustomerOption[];
  slackNotifications?: SlackNotificationOption[];
  loadError?: string;
};

type Tone = "up" | "down" | "paused" | "unknown";

const emptyInput: MonitorInput = {
  customerId: "",
  name: "",
  url: "",
  enabled: true,
  intervalSeconds: 60,
  retryDelaySeconds: null,
  timeoutMs: 10000,
  expectedStatusMin: 200,
  expectedStatusMax: 299,
  authSecretRef: null,
  slackNotificationIds: [],
};

function inputFromMonitor(monitor: Monitor): MonitorInput {
  return {
    customerId: monitor.customer_id,
    name: monitor.name,
    url: monitor.url,
    enabled: monitor.enabled,
    intervalSeconds: monitor.interval_seconds,
    retryDelaySeconds: monitor.retry_delay_seconds,
    timeoutMs: monitor.timeout_ms,
    expectedStatusMin: monitor.expected_status_min,
    expectedStatusMax: monitor.expected_status_max,
    authSecretRef: monitor.auth_secret_ref,
    slackNotificationIds: monitor.slack_notification_ids ?? [],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Try again.";
}

function monitorTone(monitor: Monitor): Tone {
  if (!monitor.enabled) return "paused";
  if (monitor.status === "down") return "down";
  if (monitor.status === "up") return "up";
  return "unknown";
}

/** Worst first: down > unknown/paused > up */
function worstTone(tones: Tone[]): Tone {
  if (tones.includes("down")) return "down";
  if (tones.includes("unknown") || tones.includes("paused")) {
    if (tones.includes("unknown")) return "unknown";
    return "paused";
  }
  return "up";
}

const TONE_DOT: Record<Tone, string> = {
  up: "bg-status-success",
  down: "bg-danger",
  paused: "bg-status-warning",
  unknown: "bg-status-warning",
};

const TONE_LABEL: Record<Tone, string> = {
  up: "up",
  down: "down",
  paused: "Paused",
  unknown: "unknown",
};

const TONE_PILL: Record<Tone, string> = {
  up: "bg-status-success-subtle text-status-success",
  down: "bg-danger/10 text-danger",
  paused: "bg-status-warning-subtle text-status-warning",
  unknown: "bg-status-warning-subtle text-status-warning",
};

function StatusDot({ tone, label }: { tone: Tone; label?: string }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${TONE_DOT[tone]}`}
      title={label ?? TONE_LABEL[tone]}
      aria-label={label ?? TONE_LABEL[tone]}
    />
  );
}

function StatusPill({ tone }: { tone: Tone }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${TONE_PILL[tone]}`}
    >
      <StatusDot tone={tone} />
      {TONE_LABEL[tone]}
    </span>
  );
}

/** Inline meta glyphs: match text-xs, stay quieter than row actions. */
const META_ICON = "size-3.5 shrink-0 text-text-tertiary";
const META_STROKE = 1.75;

/** Row actions: same as rest of app (16px glyph / 32px hit). */
const ACTION_BTN =
  "inline-flex size-8 items-center justify-center rounded-md text-text-primary hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal disabled:cursor-not-allowed disabled:opacity-50";
const ACTION_ICON = "size-4 shrink-0";
const ACTION_STROKE = 1.75;

function MetaItem({
  icon: Icon,
  label,
  value,
  className = "",
}: {
  icon: typeof Link2;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1 text-xs text-text-secondary ${className}`}
      title={`${label}: ${value}`}
    >
      <Icon className={META_ICON} strokeWidth={META_STROKE} aria-hidden />
      <span className="truncate">{value}</span>
    </span>
  );
}

export function SupportOverviewClient({
  monitors,
  customers,
  slackNotifications = [],
  loadError,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Monitor | "new" | null>(null);
  const [form, setForm] = useState<MonitorInput>(emptyInput);
  const [deleteTarget, setDeleteTarget] = useState<Monitor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return monitors;
    return monitors.filter((monitor) =>
      `${monitor.name} ${monitor.url} ${monitor.customer_name_snapshot}`
        .toLocaleLowerCase()
        .includes(term)
    );
  }, [monitors, search]);

  const groups = useMemo(() => {
    const byCustomer = new Map<
      string,
      { customerId: string; customerName: string; monitors: Monitor[] }
    >();
    for (const monitor of filtered) {
      const key = monitor.customer_id;
      const existing = byCustomer.get(key);
      if (existing) {
        existing.monitors.push(monitor);
      } else {
        byCustomer.set(key, {
          customerId: monitor.customer_id,
          customerName: monitor.customer_name_snapshot,
          monitors: [monitor],
        });
      }
    }
    return [...byCustomer.values()]
      .map((group) => ({
        ...group,
        tone: worstTone(group.monitors.map(monitorTone)),
        downCount: group.monitors.filter((m) => monitorTone(m) === "down")
          .length,
      }))
      .sort((a, b) => {
        const rank = (tone: Tone) =>
          tone === "down" ? 0 : tone === "unknown" || tone === "paused" ? 1 : 2;
        return (
          rank(a.tone) - rank(b.tone) ||
          compareTextSv(a.customerName, b.customerName)
        );
      });
  }, [filtered]);

  const down = monitors.filter((m) => monitorTone(m) === "down").length;
  const openIncidents = monitors.filter((m) => m.active_incident).length;

  function openForm(target: Monitor | "new", customerId?: string) {
    setEditing(target);
    setForm(
      target === "new"
        ? {
            ...emptyInput,
            customerId: customerId ?? customers[0]?.id ?? "",
            slackNotificationIds: slackNotifications
              .filter((channel) => channel.default_enabled)
              .map((channel) => channel.id),
          }
        : inputFromMonitor(target)
    );
    setError(null);
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        if (editing === "new") await createMonitor(form);
        else await updateMonitor(editing.id, form);
        setEditing(null);
        router.refresh();
      } catch (cause) {
        setError(errorMessage(cause));
      }
    });
  }

  function toggle(monitor: Monitor) {
    setError(null);
    startTransition(async () => {
      try {
        await setMonitorEnabled(monitor.id, !monitor.enabled);
        router.refresh();
      } catch (cause) {
        setError(errorMessage(cause));
      }
    });
  }

  function remove() {
    if (!deleteTarget) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteMonitor(deleteTarget.id);
        setDeleteTarget(null);
        router.refresh();
      } catch (cause) {
        setError(errorMessage(cause));
      }
    });
  }

  const numberField = (
    key:
      | "intervalSeconds"
      | "retryDelaySeconds"
      | "timeoutMs"
      | "expectedStatusMin"
      | "expectedStatusMax",
    label: string,
    min: number,
    max?: number
  ) => (
    <Input
      id={`overview-monitor-${key}`}
      label={label}
      type="number"
      min={min}
      max={max}
      value={form[key] ?? ""}
      required={key !== "retryDelaySeconds"}
      onChange={(event) =>
        setForm((prev) => ({
          ...prev,
          [key]:
            event.target.value === "" ? null : Number(event.target.value),
        }))
      }
    />
  );

  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader
        title="Support overview"
        description="All customer monitors — create, pause, and edit here."
      >
        <Button
          onClick={() => openForm("new")}
          disabled={!!loadError || customers.length === 0}
        >
          <Plus className="h-4 w-4" aria-hidden /> Add monitor
        </Button>
      </PageHeader>

      {(loadError || error) && (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {loadError || error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-border-subtle bg-bg-default px-3 py-2 text-sm">
        <span className="text-text-secondary">
          Monitors{" "}
          <strong className="font-semibold text-text-primary">
            {monitors.length}
          </strong>
        </span>
        <span className="text-text-secondary">
          Down{" "}
          <strong
            className={`font-semibold ${down > 0 ? "text-danger" : "text-text-primary"}`}
          >
            {down}
          </strong>
        </span>
        <span className="text-text-secondary">
          Incidents{" "}
          <strong
            className={`font-semibold ${openIncidents > 0 ? "text-danger" : "text-text-primary"}`}
          >
            {openIncidents}
          </strong>
        </span>
      </div>

      <Input
        id="overview-monitor-search"
        label="Search"
        placeholder="Name, URL or customer"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {groups.length === 0 ? (
        <Panel>
          <p className="px-4 py-5 text-sm text-text-secondary">
            {monitors.length
              ? "No monitors match your search."
              : "No monitors yet."}
          </p>
        </Panel>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            <Panel key={group.customerId}>
              <div className="flex items-center gap-2 border-b border-border-subtle bg-bg-muted/50 px-3 py-2">
                <StatusDot
                  tone={group.tone}
                  label={`${group.customerName}: ${TONE_LABEL[group.tone]}`}
                />
                <Link
                  href={supportCustomerMonitorsHref(group.customerId)}
                  className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary hover:underline"
                >
                  {group.customerName}
                </Link>
                <span className="shrink-0 text-xs text-text-secondary">
                  {group.monitors.length}{" "}
                  {group.monitors.length === 1 ? "monitor" : "monitors"}
                  {group.downCount > 0 ? ` · ${group.downCount} down` : ""}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 px-0"
                  aria-label={`Add monitor for ${group.customerName}`}
                  title="Add monitor"
                  onClick={() => openForm("new", group.customerId)}
                  disabled={pending}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <div className="divide-y divide-border-subtle">
                {group.monitors.map((monitor) => {
                  const tone = monitorTone(monitor);
                  return (
                    <div
                      key={monitor.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-bg-muted/20"
                    >
                      <StatusPill tone={tone} />
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                        <strong className="truncate text-sm text-text-primary">
                          {monitor.name}
                        </strong>
                        {monitor.active_incident ? (
                          <span className="shrink-0 text-xs font-medium text-danger">
                            Open incident
                          </span>
                        ) : null}
                        <MetaItem
                          icon={Link2}
                          label="URL"
                          value={monitor.url}
                          className="min-w-0 max-w-[14rem] sm:max-w-[18rem]"
                        />
                        <MetaItem
                          icon={Timer}
                          label="Interval"
                          value={`${monitor.interval_seconds}s`}
                          className="shrink-0"
                        />
                        <MetaItem
                          icon={Hash}
                          label="Expected status"
                          value={`${monitor.expected_status_min}–${monitor.expected_status_max}`}
                          className="shrink-0"
                        />
                        <MetaItem
                          icon={Clock}
                          label="Last checked"
                          value={
                            monitor.last_checked_at
                              ? new Date(monitor.last_checked_at).toLocaleString()
                              : "not checked"
                          }
                          className="shrink-0"
                        />
                      </div>
                      <div className="flex shrink-0 items-center">
                        <Link
                          href={supportMonitorIncidentsHref(
                            monitor.customer_id,
                            monitor.id
                          )}
                          aria-label={`Incidents for ${monitor.name}`}
                          title="Incidents"
                          className={ACTION_BTN}
                        >
                          <TriangleAlert
                            className={ACTION_ICON}
                            strokeWidth={ACTION_STROKE}
                            aria-hidden
                          />
                        </Link>
                        <button
                          type="button"
                          disabled={pending}
                          aria-label={
                            monitor.enabled
                              ? `Pause ${monitor.name}`
                              : `Enable ${monitor.name}`
                          }
                          title={monitor.enabled ? "Pause" : "Enable"}
                          onClick={() => toggle(monitor)}
                          className={ACTION_BTN}
                        >
                          {monitor.enabled ? (
                            <Pause
                              className={`${ACTION_ICON} text-status-warning`}
                              strokeWidth={ACTION_STROKE}
                              aria-hidden
                            />
                          ) : (
                            <Play
                              className={`${ACTION_ICON} text-status-success`}
                              strokeWidth={ACTION_STROKE}
                              aria-hidden
                            />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label={`Edit ${monitor.name}`}
                          title="Edit"
                          onClick={() => openForm(monitor)}
                          className={ACTION_BTN}
                        >
                          <Pencil
                            className={ACTION_ICON}
                            strokeWidth={ACTION_STROKE}
                            aria-hidden
                          />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${monitor.name}`}
                          title="Delete"
                          onClick={() => setDeleteTarget(monitor)}
                          className={ACTION_BTN}
                        >
                          <Trash2
                            className={`${ACTION_ICON} text-danger`}
                            strokeWidth={ACTION_STROKE}
                            aria-hidden
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setEditing(null);
        }}
        title={editing === "new" ? "Add monitor" : "Edit monitor"}
        contentClassName="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border-subtle bg-bg-default p-6 shadow-xl"
      >
        <form className="mt-5 space-y-4" onSubmit={save}>
          <div>
            <label
              htmlFor="overview-monitor-customer"
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              Customer
            </label>
            <select
              id="overview-monitor-customer"
              className="h-10 w-full rounded-lg border border-form bg-bg-default px-3 text-sm"
              value={form.customerId}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  customerId: event.target.value,
                }))
              }
              required
            >
              {!customers.some((c) => c.id === form.customerId) &&
                form.customerId && (
                  <option value={form.customerId}>
                    {editing !== "new" && editing
                      ? editing.customer_name_snapshot
                      : "Current customer"}
                  </option>
                )}
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
          <Input
            id="overview-monitor-name"
            label="Name"
            value={form.name}
            maxLength={200}
            required
            onChange={(event) =>
              setForm((prev) => ({ ...prev, name: event.target.value }))
            }
          />
          <Input
            id="overview-monitor-url"
            label="URL"
            type="url"
            value={form.url}
            required
            onChange={(event) =>
              setForm((prev) => ({ ...prev, url: event.target.value }))
            }
          />
          <div className="grid grid-cols-2 gap-4">
            {numberField("intervalSeconds", "Interval (seconds)", 30, 86400)}
            {numberField("retryDelaySeconds", "Retry delay (seconds)", 1)}
            {numberField("timeoutMs", "Timeout (ms)", 1)}
            {numberField("expectedStatusMin", "Expected status from", 100, 599)}
            {numberField("expectedStatusMax", "Expected status to", 100, 599)}
          </div>
          <Input
            id="overview-monitor-secret"
            label="Auth secret reference (optional)"
            value={form.authSecretRef ?? ""}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                authSecretRef: event.target.value || null,
              }))
            }
          />
          <fieldset className="space-y-2 rounded-lg border border-form p-3">
            <legend className="px-1 text-sm font-medium text-text-primary">
              Slack channels for incidents
            </legend>
            {slackNotifications.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No Slack channels are configured.
              </p>
            ) : (
              slackNotifications.map((channel) => (
                <label
                  key={channel.id}
                  className="flex items-center gap-2 text-sm text-text-primary"
                >
                  <input
                    type="checkbox"
                    checked={form.slackNotificationIds.includes(channel.id)}
                    onChange={(event) => {
                      setForm((prev) => ({
                        ...prev,
                        slackNotificationIds: event.target.checked
                          ? [...prev.slackNotificationIds, channel.id]
                          : prev.slackNotificationIds.filter(
                              (id) => id !== channel.id
                            ),
                      }));
                    }}
                  />
                  {channel.channel_name}{" "}
                  <span className="text-text-secondary">({channel.name})</span>
                </label>
              ))
            )}
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  enabled: event.target.checked,
                }))
              }
            />{" "}
            Enabled
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditing(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Delete monitor?"
        message="A monitor with check history or linked records cannot be deleted. You can pause it instead."
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
      />
    </div>
  );
}
