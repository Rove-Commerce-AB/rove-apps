"use client";

import { useMemo, useState } from "react";
import { ListFilterMenu } from "@/components/ListFilterMenu";
import { MonitorGroupList } from "@/components/MonitorGroupList";
import {
  ListSearchInput,
  ListTableToolbar,
} from "@/components/ListTableToolbar";
import { PageHeader, Panel } from "@/components/ui";
import type { Monitor } from "@/lib/monitors";
import {
  monitorTone,
  statusLabel,
  type MonitorTone,
} from "@/lib/monitorStatus";
import { compareTextSv } from "@/lib/sort";
import { SupportOverviewCaseQueues } from "@/components/SupportOverviewCaseQueues";
import type {
  SupportOverviewCaseItem,
  SupportRouteCustomerOption,
} from "@/lib/supportOverviewCases";

const STATUS_FILTER_OPTIONS: { id: MonitorTone; name: string }[] = [
  { id: "down", name: statusLabel("down") },
  { id: "operational", name: statusLabel("operational") },
  { id: "paused", name: statusLabel("paused") },
  { id: "unknown", name: statusLabel("unknown") },
];

type Props = {
  monitors: Monitor[];
  inbox?: SupportOverviewCaseItem[];
  newCases?: SupportOverviewCaseItem[];
  needsReply?: SupportOverviewCaseItem[];
  routeCustomers?: SupportRouteCustomerOption[];
  loadError?: string;
  inboxTotal?: number;
  newCasesTotal?: number;
};

export function SupportOverviewClient({
  monitors,
  inbox = [],
  newCases = [],
  needsReply = [],
  routeCustomers = [],
  loadError,
  inboxTotal,
  newCasesTotal,
}: Props) {
  const [search, setSearch] = useState("");
  const [statusFilterIds, setStatusFilterIds] = useState<string[]>([]);
  const [customerFilterIds, setCustomerFilterIds] = useState<string[]>([]);

  const down = monitors.filter((m) => monitorTone(m) === "down").length;
  const openDowntime = monitors.filter((m) => m.active_incident).length;

  const customerFilterOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const monitor of monitors) {
      if (!byId.has(monitor.customer_id)) {
        byId.set(monitor.customer_id, monitor.customer_name_snapshot);
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => compareTextSv(a.name, b.name));
  }, [monitors]);

  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader
        title="Support overview"
        description="Routing, cases that need action, and monitor status across customers."
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
        needsReply={needsReply}
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

      <div>
        <ListTableToolbar
          leading={
            <ListSearchInput
              id="overview-monitor-search"
              placeholder="Search monitors…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search monitors"
            />
          }
          trailing={
            <ListFilterMenu
              ariaLabel="Filter monitors"
              sections={[
                {
                  id: "status",
                  label: "Status",
                  allLabel: "All statuses",
                  options: STATUS_FILTER_OPTIONS,
                  selectedIds: statusFilterIds,
                  onChange: setStatusFilterIds,
                },
                {
                  id: "customer",
                  label: "Customer",
                  allLabel: "All customers",
                  options: customerFilterOptions,
                  selectedIds: customerFilterIds,
                  onChange: setCustomerFilterIds,
                },
              ]}
            />
          }
        />
        <Panel>
          <MonitorGroupList
            monitors={monitors}
            search={search}
            statusFilterIds={statusFilterIds}
            customerFilterIds={customerFilterIds}
            showRowMenu={false}
          />
        </Panel>
      </div>
    </div>
  );
}
