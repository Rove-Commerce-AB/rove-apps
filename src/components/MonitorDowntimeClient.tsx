"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { MonitorFormDrawer } from "@/components/MonitorFormDrawer";
import { Button, ConfirmModal, PageHeader } from "@/components/ui";
import type {
  Monitor,
  SlackNotificationOption,
} from "@/lib/monitors";
import { supportMonitorsAllHref } from "@/lib/routes";

type CustomerOption = { id: string; name: string };

type Props = {
  monitor: Monitor;
  canMutate: boolean;
  customers: CustomerOption[];
  slackNotifications?: SlackNotificationOption[];
  children: ReactNode;
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
      : "Could not update monitor. Try again.";
  throw new Error(message);
}

export function MonitorDowntimeClient({
  monitor,
  canMutate,
  customers,
  slackNotifications = [],
  children,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleEnabled() {
    if (!canMutate || pending) return;
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
    if (!canMutate || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        await changeMonitor(`/api/monitors/${monitor.id}`, "DELETE");
        setConfirmDelete(false);
        router.push(supportMonitorsAllHref());
        router.refresh();
      } catch (cause) {
        setConfirmDelete(false);
        setError(errorMessage(cause));
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={supportMonitorsAllHref()}
          className="text-sm text-text-secondary hover:underline"
        >
          ← Monitors
        </Link>
      </div>
      <PageHeader
        title={`${monitor.name} downtime`}
        description={`${monitor.customer_name_snapshot} · ${monitor.url}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={monitor.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-form bg-bg-default px-4 text-sm font-medium text-text-primary hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal"
          >
            Open URL
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          {canMutate ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={toggleEnabled}
              >
                {monitor.enabled ? "Pause monitoring" : "Resume monitoring"}
              </Button>
              <Button
                type="button"
                variant="dangerSecondary"
                disabled={pending}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </PageHeader>
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      {children}
      {canMutate ? (
        <>
          <MonitorFormDrawer
            open={editing}
            onOpenChange={setEditing}
            target={editing ? monitor : null}
            customers={customers}
            slackNotifications={slackNotifications}
            fixedCustomerId={monitor.customer_id}
            onSaved={() => router.refresh()}
          />
          <ConfirmModal
            isOpen={confirmDelete}
            title="Delete monitor?"
            message="The monitor will stop checking and disappear from this list. Its downtime history will be retained."
            confirmLabel="Delete"
            onClose={() => setConfirmDelete(false)}
            onConfirm={remove}
          />
        </>
      ) : null}
    </div>
  );
}
