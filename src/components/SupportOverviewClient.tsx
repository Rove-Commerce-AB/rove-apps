"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { MonitorGroupList } from "@/components/MonitorGroupList";
import { Input, PageHeader, Panel } from "@/components/ui";
import type { Monitor } from "@/lib/monitors";
import { monitorTone } from "@/lib/monitorStatus";
import { SupportOverviewCaseQueues } from "@/components/SupportOverviewCaseQueues";
import type {
  SupportOverviewCaseItem,
  SupportRouteCustomerOption,
} from "@/lib/supportOverviewCases";

type Props = {
  monitors: Monitor[];
  inbox?: SupportOverviewCaseItem[];
  newCases?: SupportOverviewCaseItem[];
  routeCustomers?: SupportRouteCustomerOption[];
  loadError?: string;
  inboxTotal?: number;
  newCasesTotal?: number;
};

export function SupportOverviewClient({
  monitors,
  inbox = [],
  newCases = [],
  routeCustomers = [],
  loadError,
  inboxTotal,
  newCasesTotal,
}: Props) {
  const [search, setSearch] = useState("");
  const [downOnly, setDownOnly] = useState(false);

  const down = monitors.filter((m) => monitorTone(m) === "down").length;
  const openDowntime = monitors.filter((m) => m.active_incident).length;

  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader
        title="Support overview"
        description="Inbox routing, new cases, and monitor status across customers."
      />

      {loadError ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {loadError}
        </p>
      ) : null}

      <SupportOverviewCaseQueues
        inbox={inbox}
        newCases={newCases}
        routeCustomers={routeCustomers}
      />
      {(inboxTotal != null && inboxTotal > inbox.length) ||
      (newCasesTotal != null && newCasesTotal > newCases.length) ? (
        <p className="text-xs text-text-tertiary">
          Showing latest{" "}
          {Math.max(inbox.length, newCases.length)} queue items
          {inboxTotal != null && inboxTotal > inbox.length
            ? ` · inbox ${inbox.length} of ${inboxTotal}`
            : ""}
          {newCasesTotal != null && newCasesTotal > newCases.length
            ? ` · new ${newCases.length} of ${newCasesTotal}`
            : ""}
          .
        </p>
      ) : null}

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
          Open downtime{" "}
          <strong
            className={`font-semibold ${openDowntime > 0 ? "text-danger" : "text-text-primary"}`}
          >
            {openDowntime}
          </strong>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
            aria-hidden
          />
          <Input
            id="overview-monitor-search"
            type="search"
            placeholder="Search monitors…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search monitors"
            className="pl-9"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={downOnly}
            onChange={(event) => setDownOnly(event.target.checked)}
          />
          Down only
        </label>
      </div>

      <Panel>
        <MonitorGroupList
          monitors={monitors}
          search={search}
          downOnly={downOnly}
          showRowMenu={false}
        />
      </Panel>
    </div>
  );
}
