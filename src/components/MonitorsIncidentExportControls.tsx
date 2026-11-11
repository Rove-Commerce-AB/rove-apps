"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button, Input } from "@/components/ui";

type Props = {
  /** When set, export is scoped to that customer; otherwise all visible monitors. */
  customerId?: string | null;
};

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
    <div className="flex flex-wrap items-end gap-2">
      <label className="block text-xs text-text-secondary">
        From
        <Input
          type="date"
          value={from}
          max={today}
          onChange={(event) => setFrom(event.target.value)}
          className="mt-1 w-[9.5rem]"
          aria-label="Export from date"
        />
      </label>
      <label className="block text-xs text-text-secondary">
        To
        <Input
          type="date"
          value={to}
          max={today}
          onChange={(event) => setTo(event.target.value)}
          className="mt-1 w-[9.5rem]"
          aria-label="Export to date"
        />
      </label>
      <Button asChild variant="secondary" size="sm" className="h-10">
        <a href={href}>
          <Download className="h-4 w-4" aria-hidden />
          Export downtime
        </a>
      </Button>
    </div>
  );
}
