"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Input, SideDrawer } from "@/components/ui";
import type {
  Monitor,
  MonitorInput,
  SlackNotificationOption,
} from "@/lib/monitors";

export type MonitorFormCustomer = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = closed; `"new"` = create; otherwise edit that monitor. */
  target: Monitor | "new" | null;
  customers: MonitorFormCustomer[];
  slackNotifications?: SlackNotificationOption[];
  fixedCustomerId?: string;
  /** Prefill customer when opening Add from a group. */
  defaultCustomerId?: string;
  onSaved: () => void;
};

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

export function inputFromMonitor(monitor: Monitor): MonitorInput {
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
    slackNotificationIds: monitor.slack_notification_ids,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Try again.";
}

async function changeMonitor(
  path: string,
  method: string,
  body?: MonitorInput
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

export function MonitorFormDrawer({
  open,
  onOpenChange,
  target,
  customers,
  slackNotifications = [],
  fixedCustomerId,
  defaultCustomerId,
  onSaved,
}: Props) {
  const [form, setForm] = useState<MonitorInput>(emptyInput);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || target == null) return;
    setError(null);
    if (target === "new") {
      setForm({
        ...emptyInput,
        customerId:
          defaultCustomerId ??
          fixedCustomerId ??
          customers[0]?.id ??
          "",
        slackNotificationIds: slackNotifications
          .filter((channel) => channel.default_enabled)
          .map((channel) => channel.id),
      });
      return;
    }
    setForm(inputFromMonitor(target));
  }, [
    open,
    target,
    customers,
    defaultCustomerId,
    fixedCustomerId,
    slackNotifications,
  ]);

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const payload = fixedCustomerId
          ? { ...form, customerId: fixedCustomerId }
          : form;
        if (target === "new") {
          await changeMonitor("/api/monitors", "POST", payload);
        } else {
          await changeMonitor(`/api/monitors/${target.id}`, "PUT", payload);
        }
        onOpenChange(false);
        onSaved();
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
      id={`monitor-drawer-${key}`}
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

  const title = target === "new" ? "Add monitor" : "Edit monitor";

  return (
    <SideDrawer
      open={open && target != null}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
      title={title}
      subtitle={
        target && target !== "new"
          ? target.customer_name_snapshot
          : undefined
      }
    >
      <form className="space-y-4" onSubmit={save}>
        {fixedCustomerId ? (
          <input type="hidden" name="customerId" value={fixedCustomerId} />
        ) : (
          <div>
            <label
              htmlFor="monitor-drawer-customer"
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              Customer
            </label>
            <select
              id="monitor-drawer-customer"
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
                    {target !== "new" && target
                      ? target.customer_name_snapshot
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
        )}
        <Input
          id="monitor-drawer-name"
          label="Name"
          value={form.name}
          maxLength={200}
          required
          onChange={(event) =>
            setForm((prev) => ({ ...prev, name: event.target.value }))
          }
        />
        <Input
          id="monitor-drawer-url"
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
          id="monitor-drawer-secret"
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
            Slack channels for downtime alerts
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
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </SideDrawer>
  );
}
