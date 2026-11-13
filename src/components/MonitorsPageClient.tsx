"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { MonitorFormDrawer } from "@/components/MonitorFormDrawer";
import { MonitorGroupList } from "@/components/MonitorGroupList";
import { MonitorsIncidentExportControls } from "@/components/MonitorsIncidentExportControls";
import {
  ListSearchInput,
  ListTableToolbar,
} from "@/components/ListTableToolbar";
import {
  Button,
  ConfirmModal,
  PageHeader,
  Panel,
} from "@/components/ui";
import type {
  Monitor,
  SlackNotificationOption,
} from "@/lib/monitors";

type CustomerOption = { id: string; name: string };
type Props = {
  monitors: Monitor[];
  customers: CustomerOption[];
  slackNotifications?: SlackNotificationOption[];
  loadError?: string;
  readOnly?: boolean;
  fixedCustomerId?: string;
  title?: string;
  description?: string;
  toolbar?: ReactNode;
};

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Try again.";
}

async function changeMonitor(
  path: string,
  method: string,
  body?: { enabled: boolean }
) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.ok) return;
  const result: unknown = await response.json().catch(() => null);
  const message =
    result &&
    typeof result === "object" &&
    "error" in result &&
    typeof result.error === "string"
      ? result.error
      : "Could not save monitor. Try again.";
  throw new Error(message);
}

export function MonitorsPageClient({
  monitors,
  customers,
  slackNotifications = [],
  loadError,
  readOnly = false,
  fixedCustomerId,
  title = "Monitors",
  description = "Manage HTTP monitors and their check settings.",
  toolbar,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [downOnly, setDownOnly] = useState(false);
  const [editing, setEditing] = useState<Monitor | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Monitor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canMutate = !readOnly;

  function openForm(target: Monitor | "new") {
    if (!canMutate) return;
    setEditing(target);
    setError(null);
  }

  function toggle(monitor: Monitor) {
    if (!canMutate) return;
    setError(null);
    startTransition(async () => {
      try {
        await changeMonitor(`/api/monitors/${monitor.id}`, "PATCH", {
          enabled: !monitor.enabled,
        });
        router.refresh();
      } catch (cause) {
        setError(errorMessage(cause));
      }
    });
  }

  function remove() {
    if (!deleteTarget || !canMutate) return;
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

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader title={title} description={description}>
        {canMutate ? (
          <Button
            onClick={() => openForm("new")}
            disabled={
              !!loadError || (!fixedCustomerId && customers.length === 0)
            }
          >
            <Plus className="h-4 w-4" aria-hidden /> Add monitor
          </Button>
        ) : null}
      </PageHeader>
      {(loadError || error) && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
        >
          {loadError || error}
        </p>
      )}
      <div>
        <ListTableToolbar
          leading={
            <div className="flex flex-wrap items-center gap-3">
              <ListSearchInput
                id="monitor-search"
                placeholder="Search monitors…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search monitors"
              />
              <label className="inline-flex h-7 items-center gap-2 text-[13px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={downOnly}
                  onChange={(event) => setDownOnly(event.target.checked)}
                />
                Down only
              </label>
            </div>
          }
          trailing={
            <div className="contents">
              <MonitorsIncidentExportControls customerId={fixedCustomerId} />
              {toolbar}
            </div>
          }
        />
        <Panel>
          <MonitorGroupList
            monitors={monitors}
            search={search}
            downOnly={downOnly}
            canMutate={canMutate}
            pending={pending}
            onEdit={(monitor) => openForm(monitor)}
            onToggleEnabled={toggle}
            onDelete={setDeleteTarget}
          />
        </Panel>
      </div>
      {canMutate ? (
        <MonitorFormDrawer
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          target={editing}
          customers={customers}
          slackNotifications={slackNotifications}
          fixedCustomerId={fixedCustomerId}
          onSaved={() => router.refresh()}
        />
      ) : null}
      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Delete monitor?"
        message="The monitor will stop checking and disappear from this list. Its downtime history will be retained."
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
      />
    </div>
  );
}
