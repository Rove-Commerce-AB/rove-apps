"use client";

import { Fragment, useEffect, useState, type FocusEvent } from "react";
import {
  useTimeGridColumnHighlight,
  timeGridColumnCellInteractionProps,
} from "@/components/TimeGridColumnHighlight";
import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FoldVertical,
  Percent,
  UnfoldVertical,
} from "lucide-react";
import type { AllocationPageData } from "@/lib/allocationPageTypes";
import { consultantHref, customerHref } from "@/lib/routes";

export type EditingCellCustomerProject = {
  customerId: string;
  consultantId: string;
  roleId: string | null;
  weekIndex: number;
  week: number;
  year: number;
  allocationId: string | null;
  otherAllocationIds: string[];
  projectId: string;
  currentHours: number;
};

export type EditingCellConsultant = {
  consultantId: string;
  projectId: string;
  roleId: string | null;
  weekIndex: number;
  week: number;
  year: number;
  allocationId: string | null;
  currentHours: number;
};

export type AddInitialParams = {
  consultantId?: string;
  consultantName?: string;
  week?: number;
  weekFrom?: number;
  weekTo?: number;
  year: number;
  projectId?: string;
  projectLabel?: string;
};

/** Same payload as `AllocationPageClient` edit-range modal (consultant / project row drag). */
export type ConsultantWeekRangeEditParams = {
  consultantId: string;
  consultantName: string;
  projectId: string;
  projectLabel: string;
  roleId: string | null;
  roleName?: string;
  weeks: {
    year: number;
    week: number;
    allocationId: string | null;
    currentHours: number;
  }[];
  availableHoursByWeek: number[];
};

type CustomerViewForRangeFind = Array<{
  customer: { id: string };
  projectGroups: Array<{
    project: { id: string };
    consultantRows: Array<{
      consultantId: string;
      roleId: string | null;
      roleName: string;
      weeks: { week: number; cells: { id: string; hours: number }[] }[];
    }>;
  }>;
}>;

type ProjectViewForRangeFind = Array<{
  project: { id: string; customer_id: string };
  consultantRows: Array<{
    consultantId: string;
    roleId: string | null;
    roleName: string;
    weeks: { week: number; cells: { id: string; hours: number }[] }[];
  }>;
}>;

function findConsultantWeeksForRangeEdit(
  tab: "customer" | "project",
  perCustomer: unknown[],
  perProject: unknown[],
  drag: {
    customerId: string;
    projectId: string;
    consultantId?: string;
    roleId?: string | null;
  }
): { roleName: string; weeks: { week: number; cells: { id: string; hours: number }[] }[] } | null {
  const roleKey = drag.roleId ?? null;
  if (tab === "customer") {
    for (const row of perCustomer as CustomerViewForRangeFind) {
      if (row.customer.id !== drag.customerId) continue;
      for (const pg of row.projectGroups) {
        if (pg.project.id !== drag.projectId) continue;
        for (const cr of pg.consultantRows) {
          if (cr.consultantId !== drag.consultantId) continue;
          if ((cr.roleId ?? null) !== roleKey) continue;
          return { roleName: cr.roleName, weeks: cr.weeks };
        }
      }
    }
    return null;
  }
  for (const pr of perProject as ProjectViewForRangeFind) {
    if (pr.project.id !== drag.projectId || pr.project.customer_id !== drag.customerId) {
      continue;
    }
    for (const cr of pr.consultantRows) {
      if (cr.consultantId !== drag.consultantId) continue;
      if ((cr.roleId ?? null) !== roleKey) continue;
      return { roleName: cr.roleName, weeks: cr.weeks };
    }
  }
  return null;
}

export type AllocationCustomerProjectTabsProps = {
  tab: "customer" | "project";
  data: AllocationPageData;
  monthSpans: { colSpan: number; label: string }[];
  isCurrentWeek: (w: { year: number; week: number }) => boolean;
  renderMonthHeaderCells: (borderClass?: string) => React.ReactNode;
  renderWeekHeaderCells: (tableKey: string, borderClass?: string) => React.ReactNode;
  expandedCustomers: Set<string>;
  toggleCustomer: (id: string) => void;
  perCustomer: unknown[];
  expandedProjects: Set<string>;
  toggleProject: (id: string) => void;
  expandableProjectIds?: Set<string>;
  onExpandAllProjects?: () => void;
  onCollapseAllProjects?: () => void;
  perProject: unknown[];
  editingCell: EditingCellCustomerProject | null;
  setEditingCell: Dispatch<SetStateAction<EditingCellCustomerProject | null>>;
  editingCellValue: string;
  setEditingCellValue: Dispatch<SetStateAction<string>>;
  handleCellInputBlur: () => void;
  handleCellInputKeyDown: (e: React.KeyboardEvent) => void;
  savingCell: boolean;
  cellError: string | null;
  setAddModalOpen: Dispatch<SetStateAction<boolean>>;
  setAddInitialParams: Dispatch<SetStateAction<AddInitialParams | null>>;
  /** Multi-week drag on a consultant row opens edit-range (same as consultant tab project row). */
  openConsultantWeekRangeEdit: (params: ConsultantWeekRangeEditParams) => void;
  editingCellConsultant: EditingCellConsultant | null;
  setEditingCellConsultant: Dispatch<SetStateAction<EditingCellConsultant | null>>;
  editingCellConsultantValue: string;
  setEditingCellConsultantValue: Dispatch<SetStateAction<string>>;
  saveCellHoursConsultant: (cell: EditingCellConsultant, value: string) => Promise<void>;
  handleCellConsultantInputBlur: () => void;
  handleCellConsultantInputKeyDown: (e: React.KeyboardEvent) => void;
  savingCellConsultant: boolean;
  formatWeekLabel: (week: number, year: number) => string;
};

export function AllocationCustomerProjectTabs(props: AllocationCustomerProjectTabsProps) {
  const p = props;
  const { data, tab } = p;
  const { highlightedColumnIndex, setHighlightedColumnIndex } =
    useTimeGridColumnHighlight();
  const [hoverRowKey, setHoverRowKey] = useState<string | null>(null);

  const allocationRowHoverHandlers = (rowKey: string) => ({
    onMouseEnter: () => setHoverRowKey(rowKey),
    onMouseLeave: () => setHoverRowKey(null),
    onFocusCapture: () => setHoverRowKey(rowKey),
    onBlurCapture: (e: FocusEvent<HTMLTableRowElement>) => {
      const next = e.relatedTarget as Node | null;
      if (next && e.currentTarget.contains(next)) return;
      setHoverRowKey(null);
    },
  });

  const allocationRowHoverClass = (rowKey: string) =>
    hoverRowKey === rowKey ? "time-grid-row-hover" : "";

  const allocColHoverClass = (weekIndex: number) =>
    `allocation-pan-cell${
      highlightedColumnIndex === weekIndex ? " time-grid-column-hover" : ""
    }`;

  const [customerDragState, setCustomerDragState] = useState<{
    mode: "consultant" | "project";
    customerId: string;
    customerName: string;
    projectId: string;
    projectName: string;
    consultantId?: string;
    consultantName?: string;
    roleId?: string | null;
    weekIndexStart: number;
    weekIndexEnd: number;
    startWeek: number;
    startYear: number;
    startTotalHours?: number;
    startAllocationId?: string | null;
    startOtherAllocationIds?: string[];
    startProjectId?: string;
  } | null>(null);
  const [customerDragMoved, setCustomerDragMoved] = useState(false);
  const [preventNextConsultantCellClick, setPreventNextConsultantCellClick] = useState(false);

  useEffect(() => {
    if ((tab !== "customer" && tab !== "project") || customerDragState === null) return;
    const onMouseUp = () => {
      const drag = customerDragState;
      const lo = Math.min(drag.weekIndexStart, drag.weekIndexEnd);
      const hi = Math.max(drag.weekIndexStart, drag.weekIndexEnd);
      const wFrom = data.weeks[lo];
      const wTo = data.weeks[hi];
      if (!wFrom || !wTo) {
        setCustomerDragState(null);
        setCustomerDragMoved(false);
        return;
      }

      if (drag.mode === "consultant" && !customerDragMoved && lo === hi) {
        p.setEditingCell({
          customerId: drag.customerId,
          consultantId: drag.consultantId ?? "",
          roleId: drag.roleId ?? null,
          weekIndex: lo,
          week: drag.startWeek,
          year: drag.startYear,
          allocationId: drag.startAllocationId ?? null,
          otherAllocationIds: drag.startOtherAllocationIds ?? [],
          projectId: drag.startProjectId ?? drag.projectId,
          currentHours: drag.startTotalHours ?? 0,
        });
        p.setEditingCellValue(String(drag.startTotalHours ?? 0));
      } else if (drag.mode === "consultant") {
        const found = findConsultantWeeksForRangeEdit(
          tab,
          p.perCustomer,
          p.perProject,
          drag
        );
        const consultant = data.consultants.find((c) => c.id === drag.consultantId);
        let openedEditRange = false;
        if (found && drag.consultantId) {
          const weeks: ConsultantWeekRangeEditParams["weeks"] = [];
          const availableHoursByWeek: number[] = [];
          for (let idx = lo; idx <= hi; idx++) {
            const wk = data.weeks[idx];
            if (!wk) continue;
            const cells = found.weeks[idx]?.cells ?? [];
            const totalHours = cells.reduce((s, c) => s + c.hours, 0);
            weeks.push({
              year: wk.year,
              week: wk.week,
              allocationId: cells[0]?.id ?? null,
              currentHours: totalHours,
            });
            availableHoursByWeek.push(consultant?.availableHoursByWeek[idx] ?? 0);
          }
          if (weeks.length > 0) {
            setPreventNextConsultantCellClick(true);
            p.openConsultantWeekRangeEdit({
              consultantId: drag.consultantId,
              consultantName: drag.consultantName ?? "",
              projectId: drag.projectId,
              projectLabel: `${drag.customerName} - ${drag.projectName}`,
              roleId: drag.roleId ?? null,
              roleName: found.roleName || undefined,
              weeks,
              availableHoursByWeek,
            });
            openedEditRange = true;
          }
        }
        if (!openedEditRange) {
          p.setAddInitialParams({
            consultantId: drag.consultantId,
            consultantName: drag.consultantName,
            year: wFrom.year,
            weekFrom: wFrom.week,
            weekTo: wTo.week,
            projectId: drag.projectId,
            projectLabel: `${drag.customerName} - ${drag.projectName}`,
          });
          p.setAddModalOpen(true);
          setPreventNextConsultantCellClick(true);
        }
      } else {
        p.setAddInitialParams({
          year: wFrom.year,
          weekFrom: wFrom.week,
          weekTo: wTo.week,
          projectId: drag.projectId,
          projectLabel: `${drag.customerName} - ${drag.projectName}`,
        });
        p.setAddModalOpen(true);
      }

      setCustomerDragState(null);
      setCustomerDragMoved(false);
    };

    document.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "crosshair";
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [tab, customerDragState, customerDragMoved, data, p]);

  if (tab === "customer") {
    const renderCustomerColgroup = (keyPrefix: string) => (
      <colgroup>
        <col className="allocation-name-col" />
        {data.weeks.map((w) => (
          <col key={`${keyPrefix}-${w.year}-${w.week}`} className="w-[29px]" />
        ))}
        <col className="w-[4rem]" />
      </colgroup>
    );

    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <div className="allocation-tables-frozen shrink-0 border-b border-border-subtle bg-bg-default px-2 pt-2">
          <table className="w-full min-w-0 table-fixed border border-form border-b-0 text-[10px]">
            {renderCustomerColgroup("h")}
            <thead>
              <tr className="border-b border-grid-subtle">
                <th
                  rowSpan={2}
                  className="allocation-name-col border-r border-border-subtle px-3 py-1 text-left text-label-s text-text-secondary"
                >
                  Customer / Consultant
                </th>
                {p.renderMonthHeaderCells("border-grid")}
                <th
                  rowSpan={2}
                  className="border-r border-grid px-1 py-1 text-center text-[10px] font-medium text-text-primary opacity-80"
                >
                  Total
                </th>
              </tr>
              <tr className="border-b border-grid-subtle">
                {p.renderWeekHeaderCells("customer", "border-grid")}
              </tr>
            </thead>
          </table>
        </div>
        <div className="allocation-tables-scroll h-0 min-h-0 min-w-0 flex-1 px-2 pb-2">
          <table className="w-full min-w-0 table-fixed border border-form border-t-0 text-[10px]">
            {renderCustomerColgroup("b")}
            <tbody>
            {(p.perCustomer as Array<{
              customer: { id: string; name: string };
              projectGroups: Array<{
                project: { id: string; name: string };
                consultantRows: Array<{
                  consultantId: string;
                  consultantName: string;
                  roleId: string | null;
                  roleName: string;
                  weeks: {
                    week: number;
                    cells: {
                      id: string;
                      hours: number;
                      displayHours: number;
                      isHidden: boolean;
                      projectId: string;
                    }[];
                  }[];
                  unavailableByWeek: boolean[];
                }>;
                totalByWeek: Map<string, number>;
              }>;
              totalByWeek: Map<string, number>;
            }>).map((row) => {
              const expanded = p.expandedCustomers.has(row.customer.id);
              const hasProjects = row.projectGroups.length > 0;
              return (
                <Fragment key={row.customer.id}>
                  <tr
                    className={`border-b border-grid-light-subtle last:border-form ${expanded && hasProjects ? "shadow-[0_2px_8px_rgba(0,0,0,0.28)]" : ""} ${allocationRowHoverClass(`cust-name-${row.customer.id}`)}`}
                    {...allocationRowHoverHandlers(`cust-name-${row.customer.id}`)}
                  >
                    <td className="allocation-name-col border-r border-grid-light-subtle px-2 py-1.5 align-top">
                      <div className="flex items-center justify-between gap-1 w-full">
                        <button
                          type="button"
                          onClick={() => hasProjects && p.toggleCustomer(row.customer.id)}
                          className="flex min-w-0 flex-1 items-center gap-1 text-left whitespace-nowrap"
                        >
                          {hasProjects ? (
                            expanded ? (
                              <ChevronDown className="h-4 w-4 shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0" />
                            )
                          ) : (
                            <span className="w-4 shrink-0" />
                          )}
                          <span className="font-medium text-text-primary">{row.customer.name}</span>
                        </button>
                        <Link
                          href={customerHref(row.customer.id)}
                          prefetch={false}
                          className="shrink-0 rounded p-0.5 text-text-primary opacity-60 hover:bg-bg-muted hover:opacity-100"
                          aria-label={`Open ${row.customer.name}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                    {data.weeks.map((w, i) => {
                      const total = row.totalByWeek.get(`${w.year}-${w.week}`) ?? 0;
                      const hasBooking = total > 0;
                      const prev = data.weeks[i - 1];
                      const prevTotal = i > 0 && prev ? row.totalByWeek.get(`${prev.year}-${prev.week}`) ?? 0 : 0;
                      const showLeftBorder = hasBooking && (i === 0 || prevTotal === 0);
                      return (
                        <td
                          key={`${w.year}-${w.week}`}
                          {...timeGridColumnCellInteractionProps(
                            i,
                            setHighlightedColumnIndex
                          )}
                          className={`${showLeftBorder ? "border-l border-grid-light " : ""}${hasBooking ? "border-r border-grid-light" : ""} px-1 py-1 text-center text-[9px] tabular-nums text-text-primary ${p.isCurrentWeek(data.weeks[i]) ? "current-week-cell border-l border-r bg-brand-signal/15" : ""} ${allocColHoverClass(i)}`}
                        >
                          {hasBooking ? `${total}h` : null}
                        </td>
                      );
                    })}
                    <td className="border-r border-grid-light px-1 py-1 text-right text-[9px] font-medium tabular-nums text-text-primary">
                      {(() => {
                        const customerTotal = data.weeks.reduce(
                          (sum, w) => sum + (row.totalByWeek.get(`${w.year}-${w.week}`) ?? 0),
                          0
                        );
                        return customerTotal > 0 ? `${customerTotal}h` : null;
                      })()}
                    </td>
                  </tr>
                  {expanded &&
                    row.projectGroups.map((pg) => (
                      <Fragment key={pg.project.id}>
                        <tr
                          className={`border-b border-grid-light-subtle bg-bg-muted/30 ${allocationRowHoverClass(`cust-proj-${row.customer.id}-${pg.project.id}`)}`}
                          {...allocationRowHoverHandlers(`cust-proj-${row.customer.id}-${pg.project.id}`)}
                        >
                          <td className="allocation-name-col border-r border-grid-light-subtle px-2 py-1 pl-8 text-text-primary">
                            <Link
                              href={`/projects/${pg.project.id}`}
                              prefetch={false}
                              className="inline-block min-w-0 max-w-full truncate rounded-sm font-medium text-text-primary underline-offset-2 outline-offset-2 hover:bg-bg-muted/50 hover:underline"
                            >
                              {pg.project.name}
                            </Link>
                          </td>
                          {data.weeks.map((w, i) => {
                            const total = pg.totalByWeek.get(`${w.year}-${w.week}`) ?? 0;
                            const hasBooking = total > 0;
                            const prev = data.weeks[i - 1];
                            const prevTotal =
                              i > 0 && prev
                                ? pg.totalByWeek.get(`${prev.year}-${prev.week}`) ?? 0
                                : 0;
                            const showLeftBorder =
                              hasBooking && (i === 0 || prevTotal === 0);
                            const isProjectDragRange =
                              customerDragState?.mode === "project" &&
                              customerDragState.customerId === row.customer.id &&
                              customerDragState.projectId === pg.project.id &&
                              i >=
                                Math.min(
                                  customerDragState.weekIndexStart,
                                  customerDragState.weekIndexEnd
                                ) &&
                              i <=
                                Math.max(
                                  customerDragState.weekIndexStart,
                                  customerDragState.weekIndexEnd
                                );
                            const dragMin =
                              customerDragState?.mode === "project"
                                ? Math.min(
                                    customerDragState.weekIndexStart,
                                    customerDragState.weekIndexEnd
                                  )
                                : -1;
                            const dragMax =
                              customerDragState?.mode === "project"
                                ? Math.max(
                                    customerDragState.weekIndexStart,
                                    customerDragState.weekIndexEnd
                                  )
                                : -1;
                            const isDragLeft = isProjectDragRange && i === dragMin;
                            const isDragRight = isProjectDragRange && i === dragMax;
                            const colHl = timeGridColumnCellInteractionProps(
                              i,
                              setHighlightedColumnIndex
                            );
                            return (
                              <td
                                key={`${w.year}-${w.week}`}
                                className={`${showLeftBorder ? "border-l border-grid-light " : ""}${hasBooking ? "border-r border-grid-light" : ""} cursor-crosshair select-none px-1 py-1 text-center text-[9px] tabular-nums text-text-primary ${p.isCurrentWeek(data.weeks[i]) ? "current-week-cell border-l border-r bg-brand-signal/15" : ""} ${isProjectDragRange ? "drag-range-cell border-t border-b border-brand-signal bg-brand-signal/20" : ""} ${isDragLeft ? "border-l" : ""} ${isDragRight ? "border-r" : ""} ${allocColHoverClass(i)}`}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setCustomerDragState({
                                    mode: "project",
                                    customerId: row.customer.id,
                                    customerName: row.customer.name,
                                    projectId: pg.project.id,
                                    projectName: pg.project.name,
                                    weekIndexStart: i,
                                    weekIndexEnd: i,
                                    startWeek: w.week,
                                    startYear: w.year,
                                  });
                                  setCustomerDragMoved(false);
                                }}
                                onMouseLeave={colHl.onMouseLeave}
                                onFocusCapture={colHl.onFocusCapture}
                                onBlurCapture={colHl.onBlurCapture}
                                onMouseEnter={(e) => {
                                  colHl.onMouseEnter?.(e);
                                  if (
                                    customerDragState?.mode === "project" &&
                                    customerDragState.customerId === row.customer.id &&
                                    customerDragState.projectId === pg.project.id
                                  ) {
                                    setCustomerDragState((prev) =>
                                      prev ? { ...prev, weekIndexEnd: i } : null
                                    );
                                    setCustomerDragMoved(true);
                                  }
                                }}
                              >
                                {hasBooking ? `${total}h` : null}
                              </td>
                            );
                          })}
                          <td className="border-r border-grid-light px-1 py-1 text-right text-[9px] font-medium tabular-nums text-text-primary">
                            {(() => {
                              const projectTotal = data.weeks.reduce(
                                (sum, w) => sum + (pg.totalByWeek.get(`${w.year}-${w.week}`) ?? 0),
                                0
                              );
                              return projectTotal > 0 ? `${projectTotal}h` : null;
                            })()}
                          </td>
                        </tr>
                        {pg.consultantRows.map((cr) => (
                      <tr
                        key={`${pg.project.id}-${cr.consultantId}-${cr.roleId ?? "none"}`}
                        className={`border-b border-grid-light-subtle last:border-form ${allocationRowHoverClass(`cust-cell-${row.customer.id}-${pg.project.id}-${cr.consultantId}-${cr.roleId ?? "none"}`)}`}
                        {...allocationRowHoverHandlers(`cust-cell-${row.customer.id}-${pg.project.id}-${cr.consultantId}-${cr.roleId ?? "none"}`)}
                      >
                        <td className="allocation-name-col border-r border-grid-light-subtle px-2 py-1 pl-14 text-text-primary">
                          <div className="flex min-w-0 items-center gap-1 whitespace-nowrap text-text-primary">
                            <Link
                              href={consultantHref(cr.consultantId)}
                              prefetch={false}
                              className="min-w-0 shrink truncate rounded-sm font-medium text-text-primary underline-offset-2 outline-offset-2 hover:bg-bg-muted/50 hover:underline"
                            >
                              {cr.consultantName}
                            </Link>
                            {cr.roleName ? (
                              <span className="shrink-0 opacity-80"> · {cr.roleName}</span>
                            ) : null}
                          </div>
                        </td>
                        {cr.weeks.map((w, i) => {
                          const cells = w.cells;
                          const totalHours = cells.reduce((s, x) => s + x.hours, 0);
                          const displayTotal = cells.reduce((s, x) => s + (x.isHidden ? 0 : x.displayHours), 0);
                          const hasBooking = totalHours > 0;
                          const prevHours = i > 0 ? cr.weeks[i - 1].cells.reduce((s, x) => s + (x.isHidden ? 0 : x.displayHours), 0) : 0;
                          const showLeftBorder = hasBooking && (i === 0 || prevHours === 0);
                          const weekInfo = data.weeks[i];
                          const firstProjectForCustomer = data.projects.find((pr) => pr.customer_id === row.customer.id);
                          const editingCell = p.editingCell as { customerId: string; consultantId: string; roleId: string | null; weekIndex: number } | null;
                          const isEditing =
                            editingCell?.customerId === row.customer.id &&
                            editingCell?.consultantId === cr.consultantId &&
                            editingCell?.roleId === cr.roleId &&
                            editingCell?.weekIndex === i;
                          const colHl = timeGridColumnCellInteractionProps(
                            i,
                            setHighlightedColumnIndex
                          );
                          return (
                            <td
                              key={`${weekInfo.year}-${weekInfo.week}`}
                              className={`${showLeftBorder ? "border-l border-grid-light " : ""}${hasBooking ? "border-r border-grid-light" : ""} p-0 py-1 text-center text-[9px] tabular-nums cursor-crosshair select-none ${cr.unavailableByWeek[i] ? "!bg-[var(--color-border-default)] text-text-primary" : ""} ${p.isCurrentWeek(weekInfo) && !cr.unavailableByWeek[i] ? "current-week-cell border-l border-r bg-brand-signal/15" : ""} ${p.isCurrentWeek(weekInfo) && cr.unavailableByWeek[i] ? "current-week-cell border-l border-r" : ""} ${isEditing ? "align-middle" : ""} ${customerDragState?.mode === "consultant" && customerDragState.customerId === row.customer.id && customerDragState.projectId === pg.project.id && customerDragState.consultantId === cr.consultantId && i >= Math.min(customerDragState.weekIndexStart, customerDragState.weekIndexEnd) && i <= Math.max(customerDragState.weekIndexStart, customerDragState.weekIndexEnd) ? "drag-range-cell border-t border-b border-brand-signal bg-brand-signal/20" : ""} ${allocColHoverClass(i)}`}
                              onMouseDown={(e) => {
                                if (isEditing) return;
                                e.preventDefault();
                                setCustomerDragState({
                                  mode: "consultant",
                                  customerId: row.customer.id,
                                  customerName: row.customer.name,
                                  projectId: pg.project.id,
                                  projectName: pg.project.name,
                                  consultantId: cr.consultantId,
                                  consultantName: cr.consultantName,
                                  roleId: cr.roleId,
                                  weekIndexStart: i,
                                  weekIndexEnd: i,
                                  startWeek: w.week,
                                  startYear: weekInfo.year,
                                  startTotalHours: totalHours,
                                  startAllocationId: cells[0]?.id ?? null,
                                  startOtherAllocationIds: cells.slice(1).map((c) => c.id),
                                  startProjectId:
                                    cells[0]?.projectId ??
                                    pg.project.id ??
                                    firstProjectForCustomer?.id ??
                                    "",
                                });
                                setCustomerDragMoved(false);
                              }}
                              onMouseLeave={colHl.onMouseLeave}
                              onFocusCapture={colHl.onFocusCapture}
                              onBlurCapture={colHl.onBlurCapture}
                              onMouseEnter={(e) => {
                                colHl.onMouseEnter?.(e);
                                if (
                                  customerDragState?.mode === "consultant" &&
                                  customerDragState.customerId === row.customer.id &&
                                  customerDragState.projectId === pg.project.id &&
                                  customerDragState.consultantId === cr.consultantId
                                ) {
                                  setCustomerDragState((prev) =>
                                    prev ? { ...prev, weekIndexEnd: i } : null
                                  );
                                  setCustomerDragMoved(true);
                                }
                              }}
                            >
                              {isEditing ? (
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={p.editingCellValue}
                                  onChange={(e) => p.setEditingCellValue(e.target.value)}
                                  onFocus={(e) => e.target.select()}
                                  onBlur={p.handleCellInputBlur}
                                  onKeyDown={p.handleCellInputKeyDown}
                                  disabled={p.savingCell}
                                  aria-invalid={!!p.cellError}
                                  title={
                                    p.savingCell
                                      ? "Saving…"
                                      : p.cellError ?? undefined
                                  }
                                  className={`box-border block min-h-[1.5rem] w-full min-w-0 max-w-[3rem] rounded border bg-bg-default px-1 py-0.5 text-center text-[9px] text-text-primary focus:outline-none focus:ring-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                    p.cellError
                                      ? "border-danger focus:ring-danger"
                                      : "border-brand-signal focus:ring-brand-signal"
                                  }`}
                                  onClick={(e) => e.stopPropagation()}
                                  autoFocus
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (preventNextConsultantCellClick) {
                                      setPreventNextConsultantCellClick(false);
                                      return;
                                    }
                                    p.setEditingCell({
                                      customerId: row.customer.id,
                                      consultantId: cr.consultantId,
                                      roleId: cr.roleId,
                                      weekIndex: i,
                                      week: w.week,
                                      year: weekInfo.year,
                                      allocationId: cells[0]?.id ?? null,
                                      otherAllocationIds: cells.slice(1).map((c) => c.id),
                                      projectId:
                                        cells[0]?.projectId ??
                                        pg.project.id ??
                                        firstProjectForCustomer?.id ??
                                        "",
                                      currentHours: totalHours,
                                    });
                                    p.setEditingCellValue(String(totalHours || ""));
                                  }}
                                  className="block w-full min-h-[1.5rem] cursor-pointer rounded border border-transparent bg-transparent px-1 py-0.5 text-center text-[9px] text-text-primary transition-colors hover:bg-bg-muted/50 hover:border-form focus:outline-none focus:ring-1 focus:ring-inset focus:ring-brand-signal"
                                  tabIndex={0}
                                >
                                  {displayTotal > 0 ? `${displayTotal}h` : totalHours > 0 ? "—" : "\u00A0"}
                                </button>
                              )}
                            </td>
                          );
                        })}
                        <td className="border-r border-grid-light px-1 py-1" aria-hidden />
                      </tr>
                        ))}
                      </Fragment>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    );
  }

  // tab === "project"
  const perProject = p.perProject as Array<{
    project: {
      id: string;
      customer_id: string;
      customerName: string;
      name: string;
      label: string;
      showProbabilitySymbol?: boolean;
    };
    consultantRows: Array<{
      consultantId: string;
      consultantName: string;
      roleId: string | null;
      roleName: string;
      weeks: {
        week: number;
        cells: {
          id: string;
          hours: number;
          displayHours: number;
          isHidden: boolean;
          projectId?: string;
        }[];
      }[];
      unavailableByWeek: boolean[];
    }>;
    totalByWeek: Map<string, number>;
  }>;

  const renderProjectColgroup = (keyPrefix: string) => (
    <colgroup>
      <col className="allocation-name-col" />
      {data.weeks.map((w) => (
        <col key={`${keyPrefix}-${w.year}-${w.week}`} className="w-[29px]" />
      ))}
      <col className="w-[4rem]" />
    </colgroup>
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="allocation-tables-frozen shrink-0 border-b border-border-subtle bg-bg-default px-2 pt-2">
        <table className="w-full min-w-0 table-fixed border border-form border-b-0 text-[10px]">
          {renderProjectColgroup("h")}
          <thead>
            <tr className="border-b border-grid-subtle">
              <th
                rowSpan={2}
                className="allocation-name-col border-r border-border-subtle px-3 py-1 text-left text-label-s text-text-secondary"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="min-w-0">Project / Consultant</span>
                  {p.expandableProjectIds &&
                  p.expandableProjectIds.size > 0 &&
                  p.onExpandAllProjects &&
                  p.onCollapseAllProjects ? (
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={p.onExpandAllProjects}
                        className="rounded-sm p-0.5 text-text-primary opacity-50 transition-opacity hover:bg-bg-muted hover:opacity-100"
                        aria-label="Expand all"
                        title="Expand all"
                      >
                        <UnfoldVertical className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={p.onCollapseAllProjects}
                        className="rounded-sm p-0.5 text-text-primary opacity-50 transition-opacity hover:bg-bg-muted hover:opacity-100"
                        aria-label="Collapse all"
                        title="Collapse all"
                      >
                        <FoldVertical className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  ) : null}
                </div>
              </th>
              {p.renderMonthHeaderCells("border-grid")}
              <th
                rowSpan={2}
                className="border-r border-grid px-1 py-1 text-center text-[10px] font-medium text-text-primary opacity-80"
              >
                Total
              </th>
            </tr>
            <tr className="border-b border-grid-subtle">
              {p.renderWeekHeaderCells("project", "border-grid")}
            </tr>
          </thead>
        </table>
      </div>
      <div className="allocation-tables-scroll h-0 min-h-0 min-w-0 flex-1 px-2 pb-2">
        <table className="w-full min-w-0 table-fixed border border-form border-t-0 text-[10px]">
          {renderProjectColgroup("b")}
          <tbody>
            {perProject.map((row) => {
            const expanded = p.expandedProjects.has(row.project.id);
            const hasConsultants = row.consultantRows.length > 0;
            return (
              <Fragment key={row.project.id}>
                <tr
                  className={`border-b border-grid-light-subtle last:border-form ${expanded && hasConsultants ? "shadow-[0_2px_8px_rgba(0,0,0,0.28)]" : ""} ${allocationRowHoverClass(`proj-head-${row.project.id}`)}`}
                  {...allocationRowHoverHandlers(`proj-head-${row.project.id}`)}
                >
                  <td className="allocation-name-col border-r border-grid-light-subtle px-2 py-1.5 align-top">
                    <div className="flex items-center justify-between gap-1 w-full">
                      <button
                        type="button"
                        onClick={() => hasConsultants && p.toggleProject(row.project.id)}
                        className="flex min-w-0 flex-1 items-center gap-1 text-left whitespace-nowrap"
                      >
                        {hasConsultants ? (
                          expanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0" />
                          )
                        ) : (
                          <span className="w-4 shrink-0" />
                        )}
                        <span className="flex items-center gap-1 font-medium text-text-primary">
                          {row.project.showProbabilitySymbol && (
                            <Percent
                              className="h-3 w-3 shrink-0 opacity-60"
                              aria-label="Probability under 100%"
                            />
                          )}
                          {row.project.label}
                        </span>
                      </button>
                      <Link
                        href={`/projects/${row.project.id}`}
                        prefetch={false}
                        className="shrink-0 rounded p-0.5 text-text-primary opacity-60 hover:bg-bg-muted hover:opacity-100"
                        aria-label={`Open ${row.project.label}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </td>
                  {data.weeks.map((w, i) => {
                    const total = row.totalByWeek.get(`${w.year}-${w.week}`) ?? 0;
                    const hasBooking = total > 0;
                    const prev = data.weeks[i - 1];
                    const prevTotal = i > 0 && prev ? row.totalByWeek.get(`${prev.year}-${prev.week}`) ?? 0 : 0;
                    const showLeftBorder = hasBooking && (i === 0 || prevTotal === 0);
                    return (
                      <td
                        key={`${w.year}-${w.week}`}
                        {...timeGridColumnCellInteractionProps(
                          i,
                          setHighlightedColumnIndex
                        )}
                        className={`${showLeftBorder ? "border-l border-grid-light " : ""}${hasBooking ? "border-r border-grid-light" : ""} px-1 py-1 text-center text-[9px] tabular-nums text-text-primary ${p.isCurrentWeek(data.weeks[i]) ? "current-week-cell border-l border-r bg-brand-signal/15" : ""} ${allocColHoverClass(i)}`}
                      >
                        {hasBooking ? `${total}h` : null}
                      </td>
                    );
                  })}
                  <td className="border-r border-grid-light px-1 py-1 text-right text-[9px] font-medium tabular-nums text-text-primary">
                    {(() => {
                      const projectTotal = data.weeks.reduce(
                        (sum, w) => sum + (row.totalByWeek.get(`${w.year}-${w.week}`) ?? 0),
                        0
                      );
                      return projectTotal > 0 ? `${projectTotal}h` : null;
                    })()}
                  </td>
                </tr>
                {expanded &&
                  row.consultantRows.map((cr) => (
                    <tr
                      key={`${cr.consultantId}-${cr.roleId ?? "none"}`}
                      className={`border-b border-grid-light-subtle last:border-form ${allocationRowHoverClass(`proj-row-${row.project.id}-${cr.consultantId}-${cr.roleId ?? "none"}`)}`}
                      {...allocationRowHoverHandlers(`proj-row-${row.project.id}-${cr.consultantId}-${cr.roleId ?? "none"}`)}
                    >
                      <td className="allocation-name-col border-r border-grid-light-subtle px-2 py-1 pl-8 text-text-primary">
                        <div className="flex min-w-0 items-center gap-1 whitespace-nowrap text-text-primary">
                          <Link
                            href={consultantHref(cr.consultantId)}
                            prefetch={false}
                            className="min-w-0 shrink truncate rounded-sm font-medium text-text-primary underline-offset-2 outline-offset-2 hover:bg-bg-muted/50 hover:underline"
                          >
                            {cr.consultantName}
                          </Link>
                          {cr.roleName ? (
                            <span className="shrink-0 opacity-80"> · {cr.roleName}</span>
                          ) : null}
                        </div>
                      </td>
                      {cr.weeks.map((w, i) => {
                        const cells = w.cells;
                        const totalHours = cells.reduce((s, x) => s + x.hours, 0);
                        const displayTotal = cells.reduce((s, x) => s + (x.isHidden ? 0 : x.displayHours), 0);
                        const hasBooking = totalHours > 0;
                        const prevHours =
                          i > 0
                            ? cr.weeks[i - 1].cells.reduce((s, x) => s + (x.isHidden ? 0 : x.displayHours), 0)
                            : 0;
                        const showLeftBorder = hasBooking && (i === 0 || prevHours === 0);
                        const weekInfo = data.weeks[i];
                        const editingCell = p.editingCell as {
                          projectId: string;
                          consultantId: string;
                          roleId: string | null;
                          weekIndex: number;
                        } | null;
                        const isEditing =
                          editingCell?.projectId === row.project.id &&
                          editingCell?.consultantId === cr.consultantId &&
                          editingCell?.roleId === cr.roleId &&
                          editingCell?.weekIndex === i;
                        const colHl = timeGridColumnCellInteractionProps(
                          i,
                          setHighlightedColumnIndex
                        );
                        const isDragRange =
                          customerDragState?.mode === "consultant" &&
                          customerDragState.customerId === row.project.customer_id &&
                          customerDragState.projectId === row.project.id &&
                          customerDragState.consultantId === cr.consultantId &&
                          i >=
                            Math.min(
                              customerDragState.weekIndexStart,
                              customerDragState.weekIndexEnd
                            ) &&
                          i <=
                            Math.max(
                              customerDragState.weekIndexStart,
                              customerDragState.weekIndexEnd
                            );
                        return (
                          <td
                            key={`${weekInfo.year}-${weekInfo.week}`}
                            className={`${showLeftBorder ? "border-l border-grid-light " : ""}${hasBooking ? "border-r border-grid-light" : ""} p-0 py-1 text-center text-[9px] tabular-nums cursor-crosshair select-none ${cr.unavailableByWeek[i] ? "!bg-[var(--color-border-default)] text-text-primary" : ""} ${p.isCurrentWeek(weekInfo) && !cr.unavailableByWeek[i] ? "current-week-cell border-l border-r bg-brand-signal/15" : ""} ${p.isCurrentWeek(weekInfo) && cr.unavailableByWeek[i] ? "current-week-cell border-l border-r" : ""} ${isEditing ? "align-middle" : ""} ${isDragRange ? "drag-range-cell border-t border-b border-brand-signal bg-brand-signal/20" : ""} ${allocColHoverClass(i)}`}
                            onMouseDown={(e) => {
                              if (isEditing) return;
                              e.preventDefault();
                              setCustomerDragState({
                                mode: "consultant",
                                customerId: row.project.customer_id,
                                customerName: row.project.customerName,
                                projectId: row.project.id,
                                projectName: row.project.name,
                                consultantId: cr.consultantId,
                                consultantName: cr.consultantName,
                                roleId: cr.roleId,
                                weekIndexStart: i,
                                weekIndexEnd: i,
                                startWeek: w.week,
                                startYear: weekInfo.year,
                                startTotalHours: totalHours,
                                startAllocationId: cells[0]?.id ?? null,
                                startOtherAllocationIds: cells.slice(1).map((c) => c.id),
                                startProjectId: cells[0]?.projectId ?? row.project.id,
                              });
                              setCustomerDragMoved(false);
                            }}
                            onMouseLeave={colHl.onMouseLeave}
                            onFocusCapture={colHl.onFocusCapture}
                            onBlurCapture={colHl.onBlurCapture}
                            onMouseEnter={(e) => {
                              colHl.onMouseEnter?.(e);
                              if (
                                customerDragState?.mode === "consultant" &&
                                customerDragState.customerId === row.project.customer_id &&
                                customerDragState.projectId === row.project.id &&
                                customerDragState.consultantId === cr.consultantId
                              ) {
                                setCustomerDragState((prev) =>
                                  prev ? { ...prev, weekIndexEnd: i } : null
                                );
                                setCustomerDragMoved(true);
                              }
                            }}
                          >
                            {isEditing ? (
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={p.editingCellValue}
                                onChange={(e) => p.setEditingCellValue(e.target.value)}
                                onFocus={(e) => e.target.select()}
                                onBlur={p.handleCellInputBlur}
                                onKeyDown={p.handleCellInputKeyDown}
                                disabled={p.savingCell}
                                aria-invalid={!!p.cellError}
                                title={
                                  p.savingCell
                                    ? "Saving…"
                                    : p.cellError ?? undefined
                                }
                                className={`box-border block min-h-[1.5rem] w-full min-w-0 max-w-[3rem] rounded border bg-bg-default px-1 py-0.5 text-center text-[9px] text-text-primary focus:outline-none focus:ring-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                  p.cellError
                                    ? "border-danger focus:ring-danger"
                                    : "border-brand-signal focus:ring-brand-signal"
                                }`}
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (preventNextConsultantCellClick) {
                                    setPreventNextConsultantCellClick(false);
                                    return;
                                  }
                                  p.setEditingCell({
                                    customerId: row.project.customer_id,
                                    consultantId: cr.consultantId,
                                    roleId: cr.roleId,
                                    weekIndex: i,
                                    week: w.week,
                                    year: weekInfo.year,
                                    allocationId: cells[0]?.id ?? null,
                                    otherAllocationIds: cells.slice(1).map((c) => c.id),
                                    projectId: row.project.id,
                                    currentHours: totalHours,
                                  });
                                  p.setEditingCellValue(String(totalHours || ""));
                                }}
                                className="block w-full min-h-[1.5rem] cursor-pointer rounded border border-transparent bg-transparent px-1 py-0.5 text-center text-[9px] text-text-primary transition-colors hover:bg-bg-muted/50 hover:border-form focus:outline-none focus:ring-1 focus:ring-inset focus:ring-brand-signal"
                                tabIndex={0}
                              >
                                {displayTotal > 0 ? `${displayTotal}h` : totalHours > 0 ? "—" : "\u00A0"}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="border-r border-grid-light px-1 py-1" aria-hidden />
                    </tr>
                  ))}
              </Fragment>
            );
          })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
