"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ExternalLink, MoreVertical } from "lucide-react";
import { MonitorCustomerGroupHeader } from "@/components/MonitorCustomerGroupHeader";
import type { Monitor } from "@/lib/monitors";
import {
  buildMonitorGroups,
  defaultExpandedGroupIds,
  formatCheckedAt,
  monitorTone,
  statusClass,
  statusLabel,
} from "@/lib/monitorStatus";
import { supportMonitorIncidentsHref } from "@/lib/routes";

type RowMenu = {
  monitorId: string;
  top: number;
  left: number;
};

const MENU_WIDTH = 200;
const MENU_ITEM =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-body-m text-text-primary hover:bg-bg-muted disabled:opacity-40";
const MENU_ITEM_DANGER =
  "flex w-full px-3 py-1.5 text-left text-body-m text-danger hover:bg-danger/10 disabled:opacity-40";

type Props = {
  monitors: Monitor[];
  search: string;
  downOnly?: boolean;
  /** Staff can mutate; Overview stays read-only. */
  canMutate?: boolean;
  pending?: boolean;
  emptyLabel?: string;
  noMatchLabel?: string;
  onEdit?: (monitor: Monitor) => void;
  onToggleEnabled?: (monitor: Monitor) => void;
  onDelete?: (monitor: Monitor) => void;
  /** Row ⋮ menu (Monitors page). Overview omits it — row click opens detail. */
  showRowMenu?: boolean;
};

export function MonitorGroupList({
  monitors,
  search,
  downOnly = false,
  canMutate = false,
  pending = false,
  emptyLabel = "No monitors yet.",
  noMatchLabel = "No monitors match your search.",
  onEdit,
  onToggleEnabled,
  onDelete,
  showRowMenu = true,
}: Props) {
  const router = useRouter();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  const [rowMenu, setRowMenu] = useState<RowMenu | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return monitors.filter((monitor) => {
      if (downOnly && monitorTone(monitor) !== "down") return false;
      if (!term) return true;
      return `${monitor.name} ${monitor.url} ${monitor.customer_name_snapshot}`
        .toLocaleLowerCase()
        .includes(term);
    });
  }, [monitors, search, downOnly]);

  const groups = useMemo(() => buildMonitorGroups(filtered), [filtered]);

  useEffect(() => {
    if (seeded) return;
    if (groups.length === 0) return;
    setExpandedIds(defaultExpandedGroupIds(groups));
    setSeeded(true);
  }, [groups, seeded]);

  useEffect(() => {
    if (!search.trim() && !downOnly) return;
    setExpandedIds(new Set(groups.map((group) => group.customerId)));
  }, [search, downOnly, groups]);

  const openMenuMonitor =
    rowMenu == null
      ? null
      : (monitors.find((monitor) => monitor.id === rowMenu.monitorId) ?? null);

  useEffect(() => {
    if (!rowMenu) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-monitor-group-menu]")) return;
      setRowMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setRowMenu(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [rowMenu]);

  function toggleGroup(customerId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  }

  if (groups.length === 0) {
    return (
      <p className="p-6 text-sm text-text-secondary">
        {monitors.length ? noMatchLabel : emptyLabel}
      </p>
    );
  }

  return (
    <>
      <div className="divide-y divide-border-subtle">
        {groups.map((group) => {
          const expanded = expandedIds.has(group.customerId);
          return (
            <div key={group.customerId}>
              <MonitorCustomerGroupHeader
                group={{
                  customerName: group.customerName,
                  faviconUrl: group.monitors[0]?.url ?? null,
                  monitorCount: group.monitors.length,
                  operationalCount: group.operationalCount,
                  downCount: group.downCount,
                  pausedCount: group.pausedCount,
                  unknownCount: group.unknownCount,
                }}
                expanded={expanded}
                onToggle={() => toggleGroup(group.customerId)}
              />
              {expanded ? (
                <div className="divide-y divide-border-subtle border-t border-border-subtle">
                  {group.monitors.map((monitor) => {
                    const tone = monitorTone(monitor);
                    const detailHref = supportMonitorIncidentsHref(
                      monitor.customer_id,
                      monitor.id
                    );
                    return (
                      <div
                        key={monitor.id}
                        role="link"
                        tabIndex={0}
                        aria-label={`Open ${monitor.name}`}
                        className="flex cursor-pointer items-center gap-3 py-3 pr-4 pl-11 hover:bg-bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-signal sm:pl-14"
                        onClick={() => router.push(detailHref)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            router.push(detailHref);
                          }
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <strong className="block truncate text-sm text-text-primary">
                            {monitor.name}
                          </strong>
                          <p className="truncate text-xs text-text-secondary">
                            {monitor.url}
                            <span className="text-text-tertiary">
                              {" "}
                              · Every {monitor.interval_seconds}s · Expected HTTP{" "}
                              {monitor.expected_status_min}–
                              {monitor.expected_status_max}
                            </span>
                          </p>
                        </div>
                        <span
                          className={`hidden shrink-0 text-xs font-medium sm:inline ${statusClass(tone)}`}
                        >
                          {statusLabel(tone)}
                          {monitor.active_incident && tone === "down"
                            ? " · open"
                            : ""}
                        </span>
                        <span className="hidden shrink-0 text-xs text-text-tertiary md:inline">
                          {formatCheckedAt(monitor.last_checked_at)}
                        </span>
                        {showRowMenu ? (
                          <button
                            type="button"
                            data-monitor-group-menu
                            aria-label={`Actions for ${monitor.name}`}
                            aria-haspopup="menu"
                            aria-expanded={rowMenu?.monitorId === monitor.id}
                            title="Monitor actions"
                            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (rowMenu?.monitorId === monitor.id) {
                                setRowMenu(null);
                                return;
                              }
                              const rect =
                                event.currentTarget.getBoundingClientRect();
                              setRowMenu({
                                monitorId: monitor.id,
                                top: rect.bottom + 4,
                                left: Math.max(
                                  8,
                                  Math.min(
                                    rect.right - MENU_WIDTH,
                                    window.innerWidth - MENU_WIDTH - 8
                                  )
                                ),
                              });
                            }}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {showRowMenu && rowMenu && openMenuMonitor
        ? createPortal(
            <div
              data-monitor-group-menu
              role="menu"
              aria-label={`${openMenuMonitor.name} actions`}
              className="fixed z-50 min-w-[12.5rem] rounded-lg border border-border-subtle bg-bg-default py-1 shadow-lg"
              style={{
                top: rowMenu.top,
                left: rowMenu.left,
                width: MENU_WIDTH,
              }}
            >
              <a
                role="menuitem"
                href={openMenuMonitor.url}
                target="_blank"
                rel="noopener noreferrer"
                className={MENU_ITEM}
                onClick={() => setRowMenu(null)}
              >
                <span className="min-w-0 flex-1 truncate">Open URL</span>
                <ExternalLink
                  className="h-3.5 w-3.5 shrink-0 text-text-tertiary"
                  aria-hidden
                />
              </a>
              {canMutate ? (
                <>
                  <div
                    className="my-1 border-t border-border-subtle"
                    role="separator"
                  />
                  <button
                    type="button"
                    role="menuitem"
                    className={MENU_ITEM}
                    onClick={() => {
                      setRowMenu(null);
                      onEdit?.(openMenuMonitor);
                    }}
                  >
                    Edit monitor
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    className={MENU_ITEM}
                    onClick={() => {
                      setRowMenu(null);
                      onToggleEnabled?.(openMenuMonitor);
                    }}
                  >
                    {openMenuMonitor.enabled
                      ? "Pause monitoring"
                      : "Resume monitoring"}
                  </button>
                  <div
                    className="my-1 border-t border-border-subtle"
                    role="separator"
                  />
                  <button
                    type="button"
                    role="menuitem"
                    className={MENU_ITEM_DANGER}
                    onClick={() => {
                      setRowMenu(null);
                      onDelete?.(openMenuMonitor);
                    }}
                  >
                    Delete monitor
                  </button>
                </>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
