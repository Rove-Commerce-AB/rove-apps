"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, GripVertical, Square } from "lucide-react";
import {
  addCompaniesToProspectListAction,
  clearRadarProspectsAction,
  createRadarProspectListAction,
  exportRadarCompaniesToHubSpotAction,
  previewRadarHubSpotExportAction,
  removeCompaniesFromProspectListAction,
  setRadarProspectOwnerAction,
} from "@/app/(app)/radar/actions";
import type { HubSpotDuplicateMatch } from "@/lib/radar/hubspotTypes";
import { WorkCardPeople } from "@/app/(app)/work/[customerId]/[projectId]/WorkIssueDrawer";
import {
  ListSearchInput,
  ListTableToolbar,
} from "@/components/ListTableToolbar";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  Input,
  PageHeader,
  Panel,
  type DataTableColumn,
} from "@/components/ui";

const DRAG_COMPANY_IDS = "application/x-radar-company-ids";

function createDragGhost(label: string, count: number): HTMLElement {
  const ghost = document.createElement("div");
  ghost.style.cssText = [
    "position: fixed",
    "top: -1000px",
    "left: -1000px",
    "display: inline-flex",
    "align-items: center",
    "gap: 8px",
    "max-width: 280px",
    "padding: 8px 12px",
    "border-radius: 8px",
    "border: 1px solid var(--color-border-subtle, #e5e5e5)",
    "background: var(--color-bg-default, #fff)",
    "box-shadow: 0 8px 24px rgba(0,0,0,0.14)",
    "font: 600 13px/1.2 system-ui, sans-serif",
    "color: var(--color-text-primary, #111)",
    "pointer-events: none",
    "z-index: 9999",
  ].join(";");

  const text = document.createElement("span");
  text.textContent = label;
  text.style.cssText =
    "overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
  ghost.appendChild(text);

  if (count > 1) {
    const badge = document.createElement("span");
    badge.textContent = String(count);
    badge.style.cssText = [
      "flex-shrink: 0",
      "min-width: 1.35rem",
      "height: 1.35rem",
      "padding: 0 6px",
      "border-radius: 999px",
      "background: var(--color-brand-signal, #0a7)",
      "color: #fff",
      "font: 700 11px/1.35rem system-ui, sans-serif",
      "text-align: center",
    ].join(";");
    ghost.appendChild(badge);
  }

  document.body.appendChild(ghost);
  return ghost;
}
import { formatOrganizationNumber } from "@/lib/radar/orgNumber";
import {
  formatAnstallningsklassRange,
  formatOmsattningsklassRange,
  stripOmsattningsklassKodPrefix,
} from "@/lib/radar/scb/omsattningsklasser";
import { formatSniDisplay } from "@/lib/radar/sniSections";
import { compareTextSv } from "@/lib/sort";
import {
  RADAR_PRIORITY_TECHNOLOGIES,
  type RadarCompanyListItem,
  type RadarProspectList,
} from "@/lib/radar/types";
import { ROUTES } from "@/lib/routes";
import type { WorkPerson } from "@/lib/workTypes";

type ViewId = "interesting" | string;

type Props = {
  interesting: RadarCompanyListItem[];
  lists: RadarProspectList[];
  listMembers: Record<string, RadarCompanyListItem[]>;
  people: WorkPerson[];
  hubspotConfigured: boolean;
};

const HUBSPOT_DROP_ID = "__hubspot__";

function HubSpotMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M18.164 7.93V5.084a2.198 2.198 0 0 0 1.267-1.984v-.066A2.2 2.2 0 0 0 17.238.84h-.066a2.2 2.2 0 0 0-2.193 2.193v.066c0 .888.528 1.65 1.287 1.992v2.84a5.56 5.56 0 0 0-2.995 1.423l-7.2-5.58a2.48 2.48 0 0 0 .10-1.01 2.483 2.483 0 1 0-2.483 2.484c.41 0 .79-.102 1.126-.28l7.06 5.47a5.57 5.57 0 0 0-.87 2.995c0 .96.244 1.86.674 2.646l-2.2 2.2a2.02 2.02 0 0 0-.66-.114 2.036 2.036 0 1 0 2.036 2.035c0-.233-.043-.455-.114-.66l2.18-2.18c.81.5 1.76.79 2.78.79a5.59 5.59 0 0 0 5.59-5.59 5.57 5.57 0 0 0-3.2-5.025zm-1.99 8.62a3.597 3.597 0 0 1-3.593-3.592 3.597 3.597 0 0 1 3.593-3.593 3.597 3.597 0 0 1 3.592 3.593 3.597 3.597 0 0 1-3.592 3.592z" />
    </svg>
  );
}

const PRIORITY_TECH_NAMES = new Set<string>(
  RADAR_PRIORITY_TECHNOLOGIES.map((t) => t.name)
);

function displayTech(technologies: string[]): string {
  const priority = technologies.filter((t) => PRIORITY_TECH_NAMES.has(t));
  const shown = (priority.length > 0 ? priority : technologies).slice(0, 3);
  return shown.join(", ");
}

function turnoverLabel(c: RadarCompanyListItem): string {
  if (c.oms_kl != null) return formatOmsattningsklassRange(c.oms_kl);
  if (c.oms_kl_label) return stripOmsattningsklassKodPrefix(c.oms_kl_label);
  return "—";
}

function employeesLabel(c: RadarCompanyListItem): string {
  if (c.anst_kl != null) return formatAnstallningsklassRange(c.anst_kl);
  if (c.anst_kl_label) return c.anst_kl_label;
  if (c.employee_count != null) return String(c.employee_count);
  return "";
}

export function RadarProspectsClient({
  interesting,
  lists,
  listMembers,
  people,
  hubspotConfigured,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [view, setView] = useState<ViewId>("interesting");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [dragOverListId, setDragOverListId] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [exportingHubspot, setExportingHubspot] = useState(false);
  const [hubspotDupDialog, setHubspotDupDialog] = useState<{
    companyIds: string[];
    duplicates: HubSpotDuplicateMatch[];
    newWithDomain: number;
    newWithoutDomain: number;
  } | null>(null);
  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [ownerOverrides, setOwnerOverrides] = useState<
    Record<string, WorkPerson | null>
  >({});

  const activeList = lists.find((l) => l.id === view) ?? null;
  const companyById = useMemo(() => {
    const map = new Map<string, RadarCompanyListItem>();
    for (const c of interesting) map.set(c.id, c);
    for (const members of Object.values(listMembers)) {
      for (const c of members) map.set(c.id, c);
    }
    return map;
  }, [interesting, listMembers]);
  const sourceRows =
    view === "interesting" ? interesting : (listMembers[view] ?? []);

  function ownerFor(c: RadarCompanyListItem): WorkPerson | null {
    if (Object.prototype.hasOwnProperty.call(ownerOverrides, c.id)) {
      return ownerOverrides[c.id] ?? null;
    }
    return c.owner;
  }

  async function setOwner(companyId: string, person: WorkPerson | null) {
    const previous = ownerOverrides[companyId] ?? companyById.get(companyId)?.owner ?? null;
    setOwnerOverrides((prev) => ({ ...prev, [companyId]: person }));
    setActionError(null);
    try {
      await setRadarProspectOwnerAction({
        companyId,
        ownerAppUserId: person?.id ?? null,
      });
      startTransition(() => router.refresh());
    } catch (e) {
      setOwnerOverrides((prev) => ({ ...prev, [companyId]: previous }));
      setActionError(
        e instanceof Error ? e.message : "Could not update owner"
      );
    }
  }

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return sourceRows;
    return sourceRows.filter((c) => {
      const orgDigits = needle.replace(/\D/g, "");
      const nameHit = c.name.toLowerCase().includes(needle);
      const orgHit =
        orgDigits.length > 0 && c.organization_number.includes(orgDigits);
      const domainHit = (c.primary_hostname ?? "")
        .toLowerCase()
        .includes(needle);
      const techHit = c.technologies.some((t) =>
        t.toLowerCase().includes(needle)
      );
      const sniHit =
        (c.sni_code ?? "").toLowerCase().includes(needle) ||
        (c.sni_description ?? "").toLowerCase().includes(needle);
      return nameHit || orgHit || domainHit || techHit || sniHit;
    });
  }, [sourceRows, search]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => compareTextSv(a.name, b.name)),
    [rows]
  );

  const allVisibleSelected =
    sorted.length > 0 && sorted.every((c) => selectedIds.has(c.id));

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const c of sorted) next.delete(c.id);
      } else {
        for (const c of sorted) next.add(c.id);
      }
      return next;
    });
  }

  function changeView(next: ViewId) {
    setView(next);
    setSelectedIds(new Set());
    setSearch("");
    setActionError(null);
    setActionFeedback(null);
  }

  function idsToAddFromDrag(draggedId: string): string[] {
    if (selectedIds.has(draggedId) && selectedIds.size > 1) {
      return [...selectedIds];
    }
    return [draggedId];
  }

  function feedbackForAdd(listId: string, companyIds: string[]) {
    const list = lists.find((l) => l.id === listId);
    const listName = list?.name ?? "list";
    if (companyIds.length === 1) {
      const company = companyById.get(companyIds[0]!);
      return `Added ${company?.name ?? "company"} to ${listName}.`;
    }
    return `Added ${companyIds.length} companies to ${listName}.`;
  }

  async function addCompaniesToList(listId: string, companyIds: string[]) {
    const ids = [...new Set(companyIds.filter(Boolean))];
    if (!listId || ids.length === 0) return;
    setActionError(null);
    setActionFeedback(null);
    setDropping(true);
    try {
      await addCompaniesToProspectListAction({ listId, companyIds: ids });
      setActionFeedback(feedbackForAdd(listId, ids));
      setSelectedIds(new Set());
      startTransition(() => router.refresh());
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not add to list"
      );
    } finally {
      setDropping(false);
    }
  }

  function feedbackFromExport(result: {
    exported: number;
    created: number;
    updated: number;
    skipped: number;
  }) {
    return [
      `Exported ${result.exported} to HubSpot`,
      result.created > 0 ? `${result.created} created` : null,
      result.updated > 0 ? `${result.updated} updated` : null,
      result.skipped > 0 ? `${result.skipped} skipped` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  async function runHubSpotExport(
    companyIds: string[],
    onExisting: "update" | "skip"
  ) {
    setExportingHubspot(true);
    setActionError(null);
    setActionFeedback(null);
    try {
      const result = await exportRadarCompaniesToHubSpotAction({
        companyIds,
        onExisting,
      });
      setActionFeedback(feedbackFromExport(result));
      if (result.errors.length > 0) {
        setActionError(result.errors.slice(0, 3).join(" "));
      }
      setSelectedIds(new Set());
      setHubspotDupDialog(null);
      startTransition(() => router.refresh());
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not export to HubSpot"
      );
    } finally {
      setExportingHubspot(false);
      setDragOverListId(null);
    }
  }

  async function exportToHubSpot(companyIds: string[]) {
    const ids = [...new Set(companyIds.filter(Boolean))];
    if (ids.length === 0) return;
    if (!hubspotConfigured) {
      setActionError(
        "HubSpot is not configured. Set HUBSPOT_PRIVATE_APP_TOKEN."
      );
      return;
    }
    setActionError(null);
    setActionFeedback(null);
    setExportingHubspot(true);
    try {
      const preview = await previewRadarHubSpotExportAction({
        companyIds: ids,
      });
      if (preview.duplicates.length === 0) {
        await runHubSpotExport(ids, "update");
        return;
      }
      setHubspotDupDialog({
        companyIds: ids,
        duplicates: preview.duplicates,
        newWithDomain: preview.newWithDomain,
        newWithoutDomain: preview.newWithoutDomain,
      });
      setExportingHubspot(false);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not check HubSpot duplicates"
      );
      setExportingHubspot(false);
      setDragOverListId(null);
    }
  }

  async function clearSelectedInteresting() {
    if (selectedIds.size === 0) return;
    setActionError(null);
    try {
      await clearRadarProspectsAction([...selectedIds]);
      setSelectedIds(new Set());
      startTransition(() => router.refresh());
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not clear interesting"
      );
    }
  }

  async function removeSelectedFromList() {
    if (view === "interesting" || selectedIds.size === 0) return;
    setActionError(null);
    try {
      await removeCompaniesFromProspectListAction({
        listId: view,
        companyIds: [...selectedIds],
      });
      setSelectedIds(new Set());
      startTransition(() => router.refresh());
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not remove from list"
      );
    }
  }

  const columns: DataTableColumn<RadarCompanyListItem>[] = [
    {
      id: "select",
      header: (
        <button
          type="button"
          className="inline-flex text-text-tertiary hover:text-text-primary"
          aria-label={allVisibleSelected ? "Deselect all" : "Select all"}
          onClick={(event) => {
            event.stopPropagation();
            toggleSelectAllVisible();
          }}
        >
          {allVisibleSelected ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Square className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      ),
      width: "52px",
      cell: (c) => {
        const selected = selectedIds.has(c.id);
        return (
          <div
            className="flex items-center gap-0.5"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <span
              draggable
              className={`inline-flex cursor-grab text-text-tertiary active:cursor-grabbing hover:text-text-secondary ${
                draggingIds.includes(c.id) ? "opacity-40" : ""
              }`}
              title={
                selected && selectedIds.size > 1
                  ? `Drag ${selectedIds.size} selected to a list`
                  : "Drag to a list"
              }
              aria-label={
                selected && selectedIds.size > 1
                  ? `Drag ${selectedIds.size} companies`
                  : `Drag ${c.name}`
              }
              onDragStart={(event) => {
                const ids = idsToAddFromDrag(c.id);
                const label =
                  ids.length === 1
                    ? (companyById.get(ids[0]!)?.name ?? c.name)
                    : `${ids.length} companies`;
                event.dataTransfer.setData(
                  DRAG_COMPANY_IDS,
                  JSON.stringify(ids)
                );
                event.dataTransfer.setData("text/plain", label);
                event.dataTransfer.effectAllowed = "copy";
                setDraggingIds(ids);
                const ghost = createDragGhost(label, ids.length);
                event.dataTransfer.setDragImage(ghost, 16, 16);
                window.setTimeout(() => ghost.remove(), 0);
              }}
              onDragEnd={() => {
                setDraggingIds([]);
                setDragOverListId(null);
              }}
            >
              <GripVertical className="h-3.5 w-3.5" aria-hidden />
            </span>
            <button
              type="button"
              className="inline-flex text-text-tertiary hover:text-text-primary"
              aria-pressed={selected}
              aria-label={selected ? `Deselect ${c.name}` : `Select ${c.name}`}
              onClick={() => toggleSelect(c.id)}
            >
              {selected ? (
                <Check className="h-3.5 w-3.5 text-text-primary" aria-hidden />
              ) : (
                <Square className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
          </div>
        );
      },
    },
    {
      id: "name",
      header: "Company",
      width: "26%",
      cell: (c) => (
        <span className="flex min-w-0 items-baseline gap-1.5">
          <Link
            href={`${ROUTES.radarCompanies}/${c.id}`}
            className="min-w-0 truncate text-[13px] font-medium text-text-link"
            onClick={(event) => event.stopPropagation()}
          >
            {c.name}
          </Link>
          <span className="shrink-0 text-[11px] tabular-nums text-text-tertiary">
            {formatOrganizationNumber(c.organization_number)}
          </span>
          {c.matched_customer_name ? (
            <Badge variant="success">Customer</Badge>
          ) : null}
          {c.hubspot_exported_at ? (
            <span title="Exported to HubSpot">
              <Badge variant="muted">HubSpot</Badge>
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "owner",
      header: "Owner",
      width: "56px",
      cell: (c) => (
        <div className="flex justify-center">
          <WorkCardPeople
            owner={ownerFor(c)}
            assignees={[]}
            people={people}
            ownerOnly
            disabled={pending || exportingHubspot}
            onSetOwner={(person) => {
              void setOwner(c.id, person);
            }}
          />
        </div>
      ),
    },
    {
      id: "domain",
      header: "Domain",
      width: "14%",
      cell: (c) =>
        c.primary_hostname ? (
          <a
            href={`https://${c.primary_hostname}`}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-[13px] text-text-link hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {c.primary_hostname}
          </a>
        ) : (
          <span className="text-[13px] text-text-tertiary">—</span>
        ),
    },
    {
      id: "tech",
      header: "Tech",
      width: "14%",
      cell: (c) => {
        const label = displayTech(c.technologies);
        return label ? (
          <span className="block truncate text-[13px]" title={c.technologies.join(", ")}>
            {label}
          </span>
        ) : (
          <span className="text-[13px] text-text-tertiary">—</span>
        );
      },
    },
    {
      id: "sni",
      header: "SNI",
      width: "18%",
      secondary: true,
      cell: (c) => {
        const { code, label } = formatSniDisplay(c);
        if (!code) return null;
        return (
          <span
            className="block truncate text-[13px]"
            title={label ? `${code} – ${label}` : code}
          >
            {code}
            {label ? (
              <span className="text-text-tertiary"> · {label}</span>
            ) : null}
          </span>
        );
      },
    },
    {
      id: "county",
      header: "County",
      width: "10%",
      secondary: true,
      cell: (c) =>
        c.county ? (
          <span className="truncate text-[13px]">{c.county}</span>
        ) : null,
    },
    {
      id: "turnover",
      header: "Turnover",
      width: "12%",
      secondary: true,
      cell: (c) =>
        c.oms_kl != null || c.oms_kl_label ? (
          <span className="truncate text-[13px]">{turnoverLabel(c)}</span>
        ) : null,
    },
    {
      id: "employees",
      header: "Emp.",
      width: "8%",
      secondary: true,
      cell: (c) => {
        const label = employeesLabel(c);
        return label ? (
          <span className="tabular-nums text-[13px]">{label}</span>
        ) : null;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Prospects"
        description="Interesting companies and outreach lists — drag onto HubSpot to export."
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Panel className="w-full shrink-0 lg:w-56">
          <nav className="flex flex-col gap-0.5 p-2" aria-label="Prospect views">
            <button
              type="button"
              className={`rounded-md px-2.5 py-1.5 text-left text-[13px] ${
                view === "interesting"
                  ? "bg-accent-primary-subtle text-accent-primary-text"
                  : "text-text-secondary hover:bg-bg-muted hover:text-text-primary"
              }`}
              onClick={() => changeView("interesting")}
            >
              Interesting
              <span className="ml-1 text-text-tertiary">
                · {interesting.length}
              </span>
            </button>

            <div
              role="button"
              tabIndex={hubspotConfigured ? 0 : -1}
              aria-disabled={!hubspotConfigured || exportingHubspot}
              aria-label="Drop companies to export to HubSpot"
              title={
                hubspotConfigured
                  ? "Drop companies here to export to HubSpot"
                  : "Set HUBSPOT_PRIVATE_APP_TOKEN to enable HubSpot export"
              }
              className={`mt-2 flex items-center gap-2.5 rounded-lg border border-dashed px-2.5 py-2.5 transition-colors ${
                !hubspotConfigured
                  ? "cursor-not-allowed border-border-subtle bg-bg-muted/40 text-text-tertiary opacity-70"
                  : dragOverListId === HUBSPOT_DROP_ID
                    ? "cursor-copy border-brand-signal bg-brand-signal/15 text-text-primary ring-1 ring-brand-signal"
                    : "cursor-copy border-border-strong bg-bg-default text-text-secondary hover:border-border-strong hover:bg-bg-muted hover:text-text-primary"
              }`}
              onDragEnter={(event) => {
                if (!hubspotConfigured) return;
                event.preventDefault();
                setDragOverListId(HUBSPOT_DROP_ID);
              }}
              onDragOver={(event) => {
                if (!hubspotConfigured) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                if (dragOverListId !== HUBSPOT_DROP_ID) {
                  setDragOverListId(HUBSPOT_DROP_ID);
                }
              }}
              onDragLeave={(event) => {
                const related = event.relatedTarget;
                if (
                  related instanceof Node &&
                  event.currentTarget.contains(related)
                ) {
                  return;
                }
                setDragOverListId((current) =>
                  current === HUBSPOT_DROP_ID ? null : current
                );
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragOverListId(null);
                if (!hubspotConfigured || exportingHubspot) return;
                const raw = event.dataTransfer.getData(DRAG_COMPANY_IDS);
                if (!raw) return;
                try {
                  const ids = JSON.parse(raw) as string[];
                  if (!Array.isArray(ids) || ids.length === 0) return;
                  void exportToHubSpot(ids);
                } catch {
                  setActionError("Could not read dragged companies.");
                }
              }}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  dragOverListId === HUBSPOT_DROP_ID
                    ? "bg-[#ff7a59] text-white"
                    : "bg-[#ff7a59]/15 text-[#ff7a59]"
                }`}
              >
                <HubSpotMark className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-text-primary">
                  HubSpot
                </span>
                <span className="block text-[12px] text-text-tertiary">
                  {!hubspotConfigured
                    ? "Not configured"
                    : exportingHubspot
                      ? "Exporting…"
                      : dragOverListId === HUBSPOT_DROP_ID
                        ? "Drop to export"
                        : "Drop to export"}
                </span>
              </span>
            </div>

            <div className="px-2.5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
              Lists
            </div>
            {lists.map((list) => {
              const isDropTarget = dragOverListId === list.id;
              return (
                <button
                  key={list.id}
                  type="button"
                  className={`rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                    isDropTarget
                      ? "bg-brand-signal/15 ring-1 ring-brand-signal text-text-primary"
                      : view === list.id
                        ? "bg-accent-primary-subtle text-accent-primary-text"
                        : "text-text-secondary hover:bg-bg-muted hover:text-text-primary"
                  }`}
                  onClick={() => changeView(list.id)}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragOverListId(list.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    if (dragOverListId !== list.id) setDragOverListId(list.id);
                  }}
                  onDragLeave={(event) => {
                    const related = event.relatedTarget;
                    if (
                      related instanceof Node &&
                      event.currentTarget.contains(related)
                    ) {
                      return;
                    }
                    setDragOverListId((current) =>
                      current === list.id ? null : current
                    );
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOverListId(null);
                    const raw = event.dataTransfer.getData(DRAG_COMPANY_IDS);
                    if (!raw) return;
                    try {
                      const ids = JSON.parse(raw) as string[];
                      if (!Array.isArray(ids) || ids.length === 0) return;
                      void addCompaniesToList(list.id, ids);
                    } catch {
                      setActionError("Could not read dragged companies.");
                    }
                  }}
                >
                  <span className="block truncate">{list.name}</span>
                  <span className="text-[12px] text-text-tertiary">
                    {isDropTarget
                      ? dropping
                        ? "Adding…"
                        : "Drop to add"
                      : `${list.member_count} ${
                          list.member_count === 1 ? "company" : "companies"
                        }`}
                  </span>
                </button>
              );
            })}
            {lists.length === 0 ? (
              <p className="px-2.5 py-1.5 text-[13px] text-text-tertiary">
                No lists yet.
              </p>
            ) : null}
            <button
              type="button"
              className="mt-1 rounded-md px-2.5 py-1.5 text-left text-[13px] text-text-link hover:bg-bg-muted"
              onClick={() => setOpen(true)}
            >
              New list
            </button>
          </nav>
        </Panel>

        <div className="min-w-0 flex-1">
          <ListTableToolbar
            leading={
              <ListSearchInput
                placeholder="Search name, org, domain, tech…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search prospects"
              />
            }
            trailing={
              <div className="flex flex-wrap items-center justify-end gap-2">
                {selectedIds.size > 0 ? (
                  <span className="text-[12px] text-text-tertiary">
                    {selectedIds.size} selected
                    {draggingIds.length > 1
                      ? ` · moving ${draggingIds.length}`
                      : ""}
                  </span>
                ) : null}
                {view === "interesting" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={selectedIds.size === 0 || pending}
                    onClick={() => void clearSelectedInteresting()}
                  >
                    Clear interesting
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={selectedIds.size === 0 || pending}
                      onClick={() => void removeSelectedFromList()}
                    >
                      Remove from list
                    </Button>
                    {activeList ? (
                      <a
                        className="text-[13px] text-text-link hover:underline"
                        href={`/api/radar/prospect-lists/${activeList.id}/export`}
                      >
                        Export CSV
                      </a>
                    ) : null}
                  </>
                )}
              </div>
            }
          />

          <p className="mt-1.5 px-1 text-[12px] text-text-tertiary">
            {view === "interesting"
              ? `${sorted.length.toLocaleString("en-US")} interesting ${
                  sorted.length === 1 ? "company" : "companies"
                }`
              : `${sorted.length.toLocaleString("en-US")} in ${activeList?.name ?? "list"}`}
            {search.trim() && sorted.length !== sourceRows.length
              ? ` · filtered from ${sourceRows.length}`
              : ""}
          </p>

          {actionFeedback ? (
            <p
              className="mt-1 px-1 text-sm text-status-success"
              role="status"
              aria-live="polite"
            >
              {actionFeedback}
            </p>
          ) : null}
          {actionError ? (
            <p className="mt-1 px-1 text-sm text-danger" role="alert">
              {actionError}
            </p>
          ) : null}

          {sorted.length === 0 ? (
            <p className="px-1 py-6 text-sm text-text-secondary">
              {view === "interesting"
                ? "Mark companies as interesting from Companies or a company profile."
                : "This list is empty. Select companies in Interesting and use Add to list."}
            </p>
          ) : (
            <DataTable
              className="table-fixed"
              density="compact"
              columns={columns}
              rows={sorted}
              getRowId={(c) => c.id}
              getRowClassName={(c) =>
                draggingIds.includes(c.id) ? "opacity-40" : ""
              }
            />
          )}
        </div>
      </div>

      <Dialog
        open={hubspotDupDialog != null}
        onOpenChange={(next) => {
          if (!next && !exportingHubspot) setHubspotDupDialog(null);
        }}
        title="Already in HubSpot"
        subtitle={
          hubspotDupDialog
            ? `${hubspotDupDialog.duplicates.length} of ${hubspotDupDialog.companyIds.length} already exist (domain, or exact name when domain is missing). Updating overwrites name, description, website and county on those records.`
            : undefined
        }
      >
        {hubspotDupDialog ? (
          <div className="flex flex-col gap-3">
            <ul className="max-h-40 overflow-y-auto rounded-md border border-border-subtle divide-y divide-border-subtle text-[13px]">
              {hubspotDupDialog.duplicates.slice(0, 12).map((dup) => (
                <li key={dup.companyId} className="px-2.5 py-1.5">
                  <span className="font-medium text-text-primary">
                    {dup.name}
                  </span>
                  <span className="text-text-tertiary">
                    {" "}
                    · via {dup.matchedBy}
                    {dup.domain ? ` · ${dup.domain}` : ""}
                    {dup.hubspotName && dup.hubspotName !== dup.name
                      ? ` → ${dup.hubspotName}`
                      : ""}
                  </span>
                </li>
              ))}
              {hubspotDupDialog.duplicates.length > 12 ? (
                <li className="px-2.5 py-1.5 text-text-tertiary">
                  +{hubspotDupDialog.duplicates.length - 12} more
                </li>
              ) : null}
            </ul>
            <p className="text-[12px] text-text-tertiary">
              {[
                hubspotDupDialog.newWithDomain > 0
                  ? `${hubspotDupDialog.newWithDomain} new with domain`
                  : null,
                hubspotDupDialog.newWithoutDomain > 0
                  ? `${hubspotDupDialog.newWithoutDomain} new without domain`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "All selected already exist."}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                disabled={exportingHubspot}
                onClick={() => setHubspotDupDialog(null)}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                disabled={exportingHubspot}
                onClick={() =>
                  void runHubSpotExport(hubspotDupDialog.companyIds, "skip")
                }
              >
                {exportingHubspot ? "Exporting…" : "Skip existing"}
              </Button>
              <Button
                disabled={exportingHubspot}
                onClick={() =>
                  void runHubSpotExport(hubspotDupDialog.companyIds, "update")
                }
              >
                {exportingHubspot ? "Exporting…" : "Update existing"}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="New prospect list"
        subtitle="Shared list for outreach prep and CSV export."
      >
        <div className="flex flex-col gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="List name"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || pending}
              onClick={async () => {
                const list = await createRadarProspectListAction({ name });
                setOpen(false);
                setName("");
                changeView(list.id);
                startTransition(() => router.refresh());
              }}
            >
              Create
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
