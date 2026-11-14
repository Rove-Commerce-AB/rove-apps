"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { ActionPopover } from "@/components/ui/ActionPopover";

type Props = {
  /** When set, export is scoped to that customer; otherwise all visible monitors. */
  customerId?: string | null;
};

const dateInputClass =
  "box-border h-8 w-full rounded-md border border-border-subtle bg-bg-default px-2 text-[13px] text-text-primary outline-none transition-colors hover:border-border-default focus:border-border-default focus:ring-1 focus:ring-border-default";

function stockholmToday(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (name: string) =>
    parts.find((item) => item.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function defaultFrom(to: string): string {
  const date = new Date(`${to}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 29);
  return date.toISOString().slice(0, 10);
}

export function MonitorsIncidentExportControls({ customerId }: Props) {
  const today = useMemo(() => stockholmToday(), []);
  const [from, setFrom] = useState(() => defaultFrom(stockholmToday()));
  const [to, setTo] = useState(() => stockholmToday());

  const href = useMemo(() => {
    const search = new URLSearchParams();
    if (from) search.set("from", from);
    if (to) search.set("to", to);
    if (customerId) search.set("customerId", customerId);
    return `/api/monitors/incidents/export?${search}`;
  }, [from, to, customerId]);

  return (
    <ActionPopover
      title="Export downtime"
      description="Choose a period, then download. Dates use Europe/Stockholm."
      trigger={
        <>
          <Download className="h-3.5 w-3.5" aria-hidden />
          Export downtime
        </>
      }
    >
      {({ close }) => (
        <>
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-text-secondary">
                From
              </span>
              <input
                type="date"
                value={from}
                max={to || today}
                onChange={(event) => setFrom(event.target.value)}
                className={dateInputClass}
                aria-label="Export from date"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-text-secondary">
                To
              </span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                max={today}
                onChange={(event) => setTo(event.target.value)}
                className={dateInputClass}
                aria-label="Export to date"
              />
            </label>
          </div>
          <a
            href={href}
            className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-interactive-secondary-hover px-2 text-[13px] font-medium text-text-primary transition-colors hover:bg-border-subtle"
            onClick={close}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download
          </a>
        </>
      )}
    </ActionPopover>
  );
}
