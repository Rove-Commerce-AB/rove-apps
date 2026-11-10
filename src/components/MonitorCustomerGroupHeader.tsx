"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CustomerFavicon } from "@/components/CustomerFavicon";

export type MonitorGroupCounts = {
  customerName: string;
  /** Site URL used to resolve the customer favicon (typically a monitor URL). */
  faviconUrl?: string | null;
  monitorCount: number;
  operationalCount: number;
  downCount: number;
  pausedCount: number;
  unknownCount: number;
};

function groupSummary(group: MonitorGroupCounts): ReactNode {
  const allOperational =
    group.downCount === 0 &&
    group.pausedCount === 0 &&
    group.unknownCount === 0 &&
    group.operationalCount > 0;

  if (allOperational) {
    return (
      <span className="text-status-success">All sites operational</span>
    );
  }

  const parts: ReactNode[] = [];
  if (group.operationalCount > 0) {
    parts.push(
      <span key="up" className="text-status-success">
        {group.operationalCount} operational
      </span>
    );
  }
  if (group.downCount > 0) {
    parts.push(
      <span key="down" className="text-danger">
        {group.downCount} down
      </span>
    );
  }
  if (group.pausedCount > 0) {
    parts.push(
      <span key="paused" className="text-status-warning">
        {group.pausedCount} paused
      </span>
    );
  }
  if (group.unknownCount > 0) {
    parts.push(
      <span key="unknown" className="text-text-secondary">
        {group.unknownCount} unknown
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      {parts.map((part, index) => (
        <span key={index} className="inline-flex items-center gap-x-1.5">
          {index > 0 ? (
            <span className="text-text-tertiary" aria-hidden>
              ·
            </span>
          ) : null}
          {part}
        </span>
      ))}
    </span>
  );
}

type Props = {
  group: MonitorGroupCounts;
  expanded: boolean;
  onToggle: () => void;
};

/** Accordion customer row: chevron · favicon · name · count · status summary. */
export function MonitorCustomerGroupHeader({
  group,
  expanded,
  onToggle,
}: Props) {
  const countLabel =
    group.monitorCount === 1
      ? "1 monitor"
      : `${group.monitorCount} monitors`;

  return (
    <button
      type="button"
      aria-expanded={expanded}
      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-signal"
      onClick={onToggle}
    >
      {expanded ? (
        <ChevronDown
          className="h-4 w-4 shrink-0 text-text-tertiary"
          aria-hidden
        />
      ) : (
        <ChevronRight
          className="h-4 w-4 shrink-0 text-text-tertiary"
          aria-hidden
        />
      )}
      <CustomerFavicon
        name={group.customerName}
        url={group.faviconUrl}
        size="xs"
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
        {group.customerName}
      </span>
      <span className="hidden shrink-0 text-xs text-text-tertiary sm:inline">
        {countLabel}
      </span>
      <span className="shrink-0 text-xs sm:text-right">
        {groupSummary(group)}
      </span>
    </button>
  );
}
