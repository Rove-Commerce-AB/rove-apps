"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Button,
  CheckboxList,
  Dialog,
  ModalField,
  ModalTextInput,
  Select,
  modalSelectTriggerClass,
} from "@/components/ui";
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

/** Create/edit monitor — Dialog + modal chrome (same family as Add customer/project). */
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
          defaultCustomerId ?? fixedCustomerId ?? customers[0]?.id ?? "",
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
    <ModalTextInput
      id={`monitor-${key}`}
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
  const subtitle =
    target && target !== "new" ? target.customer_name_snapshot : undefined;

  const customerOptions = [
    ...(!customers.some((c) => c.id === form.customerId) && form.customerId
      ? [
          {
            value: form.customerId,
            label:
              target !== "new" && target
                ? target.customer_name_snapshot
                : "Current customer",
          },
        ]
      : []),
    ...customers.map((customer) => ({
      value: customer.id,
      label: customer.name,
    })),
  ];

  return (
    <Dialog
      open={open && target != null}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
      title={title}
      subtitle={subtitle}
      contentClassName="max-h-[90vh] max-w-lg overflow-y-auto"
    >
      <form onSubmit={save} className="modal-form-discreet mt-4 space-y-3">
        {fixedCustomerId ? (
          <input type="hidden" name="customerId" value={fixedCustomerId} />
        ) : (
          <ModalField id="monitor-customer" label="Customer">
            <Select
              id="monitor-customer"
              value={form.customerId}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, customerId: value }))
              }
              options={customerOptions}
              placeholder="Select customer"
              variant="modal"
              triggerClassName={modalSelectTriggerClass}
            />
          </ModalField>
        )}

        <ModalTextInput
          id="monitor-name"
          label="Name"
          value={form.name}
          maxLength={200}
          required
          onChange={(event) =>
            setForm((prev) => ({ ...prev, name: event.target.value }))
          }
        />

        <ModalTextInput
          id="monitor-url"
          label="URL"
          type="url"
          value={form.url}
          required
          onChange={(event) =>
            setForm((prev) => ({ ...prev, url: event.target.value }))
          }
        />

        <label className="flex items-center gap-2 text-[13px] text-text-primary">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                enabled: event.target.checked,
              }))
            }
          />
          Enabled
        </label>

        <div className="grid grid-cols-2 gap-3 border-t border-border-subtle pt-3">
          {numberField("intervalSeconds", "Interval (seconds)", 30, 86400)}
          {numberField("retryDelaySeconds", "Retry delay (seconds)", 1)}
          {numberField("timeoutMs", "Timeout (ms)", 1)}
          {numberField("expectedStatusMin", "Expected status from", 100, 599)}
          {numberField("expectedStatusMax", "Expected status to", 100, 599)}
        </div>

        <div className="space-y-3 border-t border-border-subtle pt-3">
          <ModalTextInput
            id="monitor-secret"
            label="Auth secret reference (optional)"
            value={form.authSecretRef ?? ""}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                authSecretRef: event.target.value || null,
              }))
            }
          />

          <CheckboxList
            label="Slack channels for downtime alerts"
            idPrefix="monitor-slack"
            maxHeightClassName="max-h-40"
            options={slackNotifications.map((channel) => ({
              value: channel.id,
              label: channel.channel_name,
              description: channel.name,
            }))}
            value={form.slackNotificationIds}
            onChange={(next) =>
              setForm((prev) => ({ ...prev, slackNotificationIds: next }))
            }
            empty={
              <p className="px-2 py-1.5 text-sm text-text-secondary">
                No Slack channels are configured.
              </p>
            }
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
