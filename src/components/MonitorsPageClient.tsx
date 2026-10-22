"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, ConfirmModal, Dialog, Input, PageHeader, Panel } from "@/components/ui";
import type { Monitor, MonitorInput, SlackNotificationOption } from "@/lib/monitors";
import { monitorIncidentsHref } from "@/lib/routes";

type CustomerOption = { id: string; name: string };
type Props = { monitors: Monitor[]; customers: CustomerOption[]; slackNotifications: SlackNotificationOption[]; loadError?: string };

const emptyInput: MonitorInput = {
  customerId: "", name: "", url: "", enabled: true,
  intervalSeconds: 60, retryDelaySeconds: null, timeoutMs: 10000,
  expectedStatusMin: 200, expectedStatusMax: 299, authSecretRef: null,
  slackNotificationIds: [],
};

function inputFromMonitor(monitor: Monitor): MonitorInput {
  return {
    customerId: monitor.customer_id, name: monitor.name, url: monitor.url,
    enabled: monitor.enabled, intervalSeconds: monitor.interval_seconds,
    retryDelaySeconds: monitor.retry_delay_seconds, timeoutMs: monitor.timeout_ms,
    expectedStatusMin: monitor.expected_status_min,
    expectedStatusMax: monitor.expected_status_max,
    authSecretRef: monitor.auth_secret_ref,
    slackNotificationIds: monitor.slack_notification_ids,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

async function changeMonitor(path: string, method: string, body?: MonitorInput | { enabled: boolean }) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.ok) return;
  const result: unknown = await response.json().catch(() => null);
  const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
    ? result.error : "Could not save monitor. Try again.";
  throw new Error(message);
}

export function MonitorsPageClient({ monitors, customers, slackNotifications, loadError }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Monitor | "new" | null>(null);
  const [form, setForm] = useState<MonitorInput>(emptyInput);
  const [deleteTarget, setDeleteTarget] = useState<Monitor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return monitors.filter((monitor) =>
      `${monitor.name} ${monitor.url} ${monitor.customer_name_snapshot}`.toLocaleLowerCase().includes(term)
    );
  }, [monitors, search]);

  function openForm(target: Monitor | "new") {
    setEditing(target);
    setForm(target === "new" ? {
      ...emptyInput,
      customerId: customers[0]?.id ?? "",
      slackNotificationIds: slackNotifications.filter((channel) => channel.default_enabled).map((channel) => channel.id),
    } : inputFromMonitor(target));
    setError(null);
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        if (editing === "new") await changeMonitor("/api/monitors", "POST", form);
        else await changeMonitor(`/api/monitors/${editing.id}`, "PUT", form);
        setEditing(null);
        router.refresh();
      } catch (cause) { setError(errorMessage(cause)); }
    });
  }

  function toggle(monitor: Monitor) {
    setError(null);
    startTransition(async () => {
      try {
        await changeMonitor(`/api/monitors/${monitor.id}`, "PATCH", { enabled: !monitor.enabled });
        router.refresh();
      } catch (cause) { setError(errorMessage(cause)); }
    });
  }

  function remove() {
    if (!deleteTarget) return;
    setError(null);
    startTransition(async () => {
      try {
        await changeMonitor(`/api/monitors/${deleteTarget.id}`, "DELETE");
        setDeleteTarget(null);
        router.refresh();
      } catch (cause) {
        setDeleteTarget(null);
        setError(errorMessage(cause));
      }
    });
  }

  const numberField = (key: "intervalSeconds" | "retryDelaySeconds" | "timeoutMs" | "expectedStatusMin" | "expectedStatusMax", label: string, min: number, max?: number) => (
    <Input
      id={`monitor-${key}`} label={label} type="number" min={min} max={max}
      value={form[key] ?? ""} required={key !== "retryDelaySeconds"}
      onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value === "" ? null : Number(event.target.value) }))}
    />
  );

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader title="Monitors" description="Manage HTTP monitors and their check settings.">
        <Button onClick={() => openForm("new")} disabled={!!loadError || customers.length === 0}>
          <Plus className="h-4 w-4" aria-hidden /> Add monitor
        </Button>
      </PageHeader>
      {(loadError || error) && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{loadError || error}</p>}
      <Input id="monitor-search" label="Search monitors" placeholder="Name, URL or customer" value={search} onChange={(event) => setSearch(event.target.value)} />
      <Panel>
        {filtered.length === 0 ? (
          <p className="p-6 text-sm text-text-secondary">{monitors.length ? "No monitors match your search." : "No monitors yet."}</p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {filtered.map((monitor) => (
              <div key={monitor.id} className="flex flex-wrap items-center gap-3 p-4 sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <strong className="truncate text-sm text-text-primary">{monitor.name}</strong>
                    {monitor.enabled ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs ${monitor.status === "up" ? "bg-status-success-subtle text-status-success" : monitor.status === "down" ? "bg-danger/10 text-danger" : "bg-bg-muted text-text-secondary"}`}>
                        {monitor.status}
                      </span>
                    ) : (
                      <span className="rounded-full bg-bg-muted px-2 py-0.5 text-xs text-text-secondary">Paused</span>
                    )}
                  </div>
                  <p className="truncate text-xs text-text-secondary">{monitor.customer_name_snapshot} · {monitor.url}</p>
                  <p className="text-xs text-text-tertiary">
                    Every {monitor.interval_seconds}s · Expected {monitor.expected_status_min}–{monitor.expected_status_max}
                    {monitor.last_checked_at ? ` · Last checked ${new Date(monitor.last_checked_at).toLocaleString()}` : " · Not checked yet"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={monitorIncidentsHref(monitor.id)} className="inline-flex h-9 items-center rounded-md border border-form bg-bg-default px-3 text-sm font-medium text-text-primary hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal">Incidents</Link>
                  <Button size="sm" variant={monitor.enabled ? "warningSecondary" : "successSecondary"} disabled={pending} onClick={() => toggle(monitor)}>{monitor.enabled ? "Pause" : "Enable"}</Button>
                  <Button size="sm" variant="ghost" aria-label={`Edit ${monitor.name}`} onClick={() => openForm(monitor)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" aria-label={`Delete ${monitor.name}`} onClick={() => setDeleteTarget(monitor)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !pending) setEditing(null); }} title={editing === "new" ? "Add monitor" : "Edit monitor"} contentClassName="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border-subtle bg-bg-default p-6 shadow-xl">
        <form className="mt-5 space-y-4" onSubmit={save}>
          <div>
            <label htmlFor="monitor-customer" className="mb-1 block text-sm font-medium text-text-primary">Customer</label>
            <select id="monitor-customer" className="h-10 w-full rounded-lg border border-form bg-bg-default px-3 text-sm" value={form.customerId} onChange={(event) => setForm((prev) => ({ ...prev, customerId: event.target.value }))} required>
              {!customers.some((customer) => customer.id === form.customerId) && form.customerId && <option value={form.customerId}>{editing !== "new" && editing ? editing.customer_name_snapshot : "Current customer"}</option>}
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </div>
          <Input id="monitor-name" label="Name" value={form.name} maxLength={200} required onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
          <Input id="monitor-url" label="URL" type="url" value={form.url} required onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            {numberField("intervalSeconds", "Interval (seconds)", 30, 86400)}
            {numberField("retryDelaySeconds", "Retry delay (seconds)", 1)}
            {numberField("timeoutMs", "Timeout (ms)", 1)}
            {numberField("expectedStatusMin", "Expected status from", 100, 599)}
            {numberField("expectedStatusMax", "Expected status to", 100, 599)}
          </div>
          <Input id="monitor-secret" label="Auth secret reference (optional)" value={form.authSecretRef ?? ""} onChange={(event) => setForm((prev) => ({ ...prev, authSecretRef: event.target.value || null }))} />
          <fieldset className="space-y-2 rounded-lg border border-form p-3">
            <legend className="px-1 text-sm font-medium text-text-primary">Slack channels for incidents</legend>
            {slackNotifications.length === 0 ? (
              <p className="text-sm text-text-secondary">No Slack channels are configured.</p>
            ) : slackNotifications.map((channel) => (
              <label key={channel.id} className="flex items-center gap-2 text-sm text-text-primary">
                <input type="checkbox" checked={form.slackNotificationIds.includes(channel.id)} onChange={(event) => {
                  setForm((prev) => ({
                    ...prev,
                    slackNotificationIds: event.target.checked
                      ? [...prev.slackNotificationIds, channel.id]
                      : prev.slackNotificationIds.filter((id) => id !== channel.id),
                  }));
                }} />
                {channel.channel_name} <span className="text-text-secondary">({channel.name})</span>
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))} /> Enabled</label>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button></div>
        </form>
      </Dialog>
      <ConfirmModal isOpen={deleteTarget !== null} title="Delete monitor?" message="The monitor will stop checking and disappear from this list. Its incident history will be retained." confirmLabel="Delete" onClose={() => setDeleteTarget(null)} onConfirm={remove} />
    </div>
  );
}
