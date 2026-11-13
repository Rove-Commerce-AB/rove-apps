"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";

type Props = {
  /** When set, export is scoped to that customer; otherwise all visible monitors. */
  customerId?: string | null;
};

const dateInputClass =
  "box-border h-7 w-[9.25rem] rounded-md border border-border-subtle bg-bg-default px-2 text-[13px] text-text-primary outline-none transition-colors hover:border-border-default focus:border-border-default focus:ring-1 focus:ring-border-default";

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
    <div className="flex flex-wrap items-center gap-1">
      <label className="inline-flex h-7 items-center gap-1.5 text-[13px] text-text-tertiary">
        <span className="sr-only">From</span>
        <input
          type="date"
          value={from}
          max={today}
          onChange={(event) => setFrom(event.target.value)}
          className={dateInputClass}
          aria-label="Export from date"
        />
      </label>
      <label className="inline-flex h-7 items-center gap-1.5 text-[13px] text-text-tertiary">
        <span className="sr-only">To</span>
        <input
          type="date"
          value={to}
          max={today}
          onChange={(event) => setTo(event.target.value)}
          className={dateInputClass}
          aria-label="Export to date"
        />
      </label>
      <a
        href={href}
        className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-text-secondary transition-colors hover:bg-bg-muted hover:text-text-primary"
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        Export downtime
      </a>
    </div>
  );
}
