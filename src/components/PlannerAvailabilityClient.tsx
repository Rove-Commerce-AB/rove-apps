"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  deletePlannerLeaveDayAction,
  upsertPlannerLeaveDayAction,
  upsertPlannerLeaveRangeAction,
} from "@/app/(app)/planner/leaveActions";
import { AllocationViewControls } from "@/components/AllocationViewControls";
import { AllocationWeekNav } from "@/components/allocation/AllocationWeekNav";
import { useAllocationHeaderPan } from "@/components/allocation/useAllocationHeaderPan";
import { Button, Dialog, Input, PageHeader, Select } from "@/components/ui";
import {
  buildAllocationSearch,
  readAllocationFilters,
  type AllocationFiltersState,
} from "@/lib/allocationUrl";
import {
  addWeeksToYearWeek,
  getISOWeekDateRange,
  getYearWeekForDate,
} from "@/lib/dateUtils";
import type {
  PlannerLeaveDay,
  PlannerLeavePageData,
  PlannerLeaveWeeklyAbsence,
} from "@/lib/plannerLeave";
import { absenceCodeLabel } from "@/lib/paxml/absenceCodes";
import { ROUTES, consultantHref } from "@/lib/routes";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type LeavePrompt = {
  consultantId: string;
  consultantName: string;
  hoursPerDay: number;
  dates: string[];
  /** Existing leave on the first date for quick remove (single-day edit). */
  existing?: PlannerLeaveDay | null;
};

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function isWeekend(ymd: string): boolean {
  const day = new Date(`${ymd}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

function isoDowLabel(ymd: string): string {
  const day = new Date(`${ymd}T12:00:00`).getDay();
  const iso = day === 0 ? 6 : day - 1;
  return WEEKDAY_LABELS[iso]!;
}

function monthSpansForDates(
  dates: string[]
): { label: string; colSpan: number }[] {
  const spans: { label: string; colSpan: number }[] = [];
  for (const date of dates) {
    const d = new Date(`${date}T12:00:00`);
    const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    const last = spans[spans.length - 1];
    if (last && last.label === label) last.colSpan += 1;
    else spans.push({ label, colSpan: 1 });
  }
  return spans;
}

function weekSpansForDates(
  dates: string[]
): { label: string; colSpan: number; year: number; week: number }[] {
  const spans: { label: string; colSpan: number; year: number; week: number }[] =
    [];
  for (const date of dates) {
    const { year, week } = getYearWeekForDate(new Date(`${date}T12:00:00`));
    const label = `v${week}`;
    const last = spans[spans.length - 1];
    if (last && last.year === year && last.week === week) last.colSpan += 1;
    else spans.push({ label, colSpan: 1, year, week });
  }
  return spans;
}

/**
 * Shared absence palette — day cells and week bands use the same fill/text.
 * Week bands add a dashed outline so “weekly plan” reads differently from day-assigned.
 *
 * SEM  blue   · SJK red · VAB amber · FPE/HAV purple · KOM green · UTB teal · else muted
 */
function absenceTone(code: string | null): {
  fill: string;
  text: string;
  outline: string;
} {
  switch (code) {
    case "SEM":
    case "SEM_OBE":
      return {
        fill: "bg-interactive-primary/16",
        text: "text-accent-primary-text",
        outline: "outline-interactive-primary/50",
      };
    case "SJK":
      return {
        fill: "bg-danger/14",
        text: "text-danger",
        outline: "outline-danger/55",
      };
    case "VAB":
      return {
        fill: "bg-warning/16",
        text: "text-status-warning",
        outline: "outline-warning/55",
      };
    case "FPE":
    case "HAV":
      return {
        fill: "bg-accent-3/18",
        text: "text-accent-3",
        outline: "outline-accent-3/55",
      };
    case "KOM":
      return {
        fill: "bg-success/14",
        text: "text-status-success",
        outline: "outline-success/50",
      };
    case "UTB":
      return {
        fill: "bg-accent-2/16",
        text: "text-accent-2",
        outline: "outline-accent-2/50",
      };
    case "PEM":
    case "PER":
    case "SMB":
      return {
        fill: "bg-bg-muted",
        text: "text-text-secondary",
        outline: "outline-text-secondary/50",
      };
    default:
      return {
        fill: "bg-bg-muted",
        text: "text-text-primary",
        outline: "outline-text-secondary/40",
      };
  }
}

function leaveTone(code: string | null): string {
  const t = absenceTone(code);
  return `${t.fill} ${t.text}`;
}

/** Same colors as day leave; dashed outline = weekly plan (not day-assigned). */
function weekBandTone(code: string | null): string {
  const t = absenceTone(code);
  return `${t.fill} ${t.text} outline outline-1 outline-dashed -outline-offset-1 ${t.outline}`;
}

function shortLeaveLabel(code: string | null): string {
  if (code === "SEM" || code === "SEM_OBE") return "V";
  if (code === "SJK") return "S";
  if (code === "VAB") return "B";
  if (code === "FPE" || code === "HAV") return "P";
  if (code === "KOM") return "K";
  if (code === "UTB") return "U";
  if (code === "PEM") return "O"; // obetald
  if (code === "PER") return "L"; // permission / ledig
  if (code === "SMB") return "M";
  return code?.slice(0, 1) ?? "L";
}

type WeekBandCell = {
  hours: number;
  projectId: string;
  projectName: string;
  absenceCode: string | null;
  year: number;
  week: number;
  showLabel: boolean;
};

/**
 * Map weekly absence allocations onto workable days (skip weekend + that
 * consultant’s holidays). Only when the week has no day-level leave for the
 * same consultant+project — otherwise day cells own the display.
 */
function buildWeekBandByConsultantDate(
  weeklyAbsences: PlannerLeaveWeeklyAbsence[],
  leaveDays: PlannerLeaveDay[],
  holidaysByConsultantId: Map<string, Map<string, string>>,
  visibleDates: Set<string>
): Map<string, WeekBandCell> {
  const dayHoursByConsultantProjectWeek = new Map<string, number>();
  for (const day of leaveDays) {
    const { year, week } = getYearWeekForDate(
      new Date(`${day.leaveDate}T12:00:00`)
    );
    const key = `${day.consultantId}:${day.projectId}:${weekKey(year, week)}`;
    dayHoursByConsultantProjectWeek.set(
      key,
      (dayHoursByConsultantProjectWeek.get(key) ?? 0) + day.hours
    );
  }

  // One band per consultant+week (prefer more hours, then SEM).
  const bestByConsultantWeek = new Map<string, PlannerLeaveWeeklyAbsence>();
  for (const row of weeklyAbsences) {
    const dayKey = `${row.consultantId}:${row.projectId}:${weekKey(row.year, row.week)}`;
    const dayHours = dayHoursByConsultantProjectWeek.get(dayKey) ?? 0;
    if (dayHours > 0.01) continue; // day-assigned — don’t double-draw

    const cw = `${row.consultantId}:${weekKey(row.year, row.week)}`;
    const prev = bestByConsultantWeek.get(cw);
    if (!prev || row.hours > prev.hours) {
      bestByConsultantWeek.set(cw, row);
      continue;
    }
    if (
      row.hours === prev.hours &&
      (row.absenceCode === "SEM" || row.absenceCode === "SEM_OBE") &&
      prev.absenceCode !== "SEM" &&
      prev.absenceCode !== "SEM_OBE"
    ) {
      bestByConsultantWeek.set(cw, row);
    }
  }

  const out = new Map<string, WeekBandCell>();
  for (const row of bestByConsultantWeek.values()) {
    const { start, end } = getISOWeekDateRange(row.year, row.week);
    const weekDates = eachDate(start, end);
    const holidayByDate = holidaysByConsultantId.get(row.consultantId);
    const bandDates = weekDates.filter(
      (d) =>
        visibleDates.has(d) &&
        !isWeekend(d) &&
        !(holidayByDate?.has(d) ?? false)
    );
    let labeled = false;
    for (const date of bandDates) {
      out.set(`${row.consultantId}:${date}`, {
        hours: row.hours,
        projectId: row.projectId,
        projectName: row.projectName,
        absenceCode: row.absenceCode,
        year: row.year,
        week: row.week,
        showLabel: !labeled,
      });
      labeled = true;
    }
  }
  return out;
}

function weekKey(year: number, week: number): string {
  return `${year}-${String(week).padStart(2, "0")}`;
}

function formatDateRangeLabel(dates: string[]): string {
  if (dates.length === 0) return "";
  if (dates.length === 1) return dates[0]!;
  return `${dates[0]} → ${dates[dates.length - 1]} (${dates.length} days)`;
}

function workableDates(
  dates: string[],
  holidayByDate: Map<string, string> | undefined
): string[] {
  return dates.filter(
    (d) => !isWeekend(d) && !(holidayByDate?.has(d) ?? false)
  );
}

/** CSS :has() crosshair — same idea as Time report; avoids React hover races with nested buttons.
 * Disabled while `.availability-crosshair-panning` (header remaps, body translates — indices diverge). */
function availabilityCrosshairCss(columnCount: number): string {
  const colMix =
    "color-mix(in srgb, var(--color-interactive-primary) 16%, transparent)";
  const rowMix =
    "color-mix(in srgb, var(--color-interactive-primary) 18%, transparent)";
  const bothMix =
    "color-mix(in srgb, var(--color-interactive-primary) 32%, transparent)";
  const root = `.availability-crosshair:not(.availability-crosshair-panning)`;
  const lines: string[] = [
    `${root} tbody tr:hover > td {
  box-shadow: inset 0 0 0 9999px ${rowMix} !important;
}`,
    `${root} tbody tr:hover > td > button {
  box-shadow: inset 0 0 0 9999px ${rowMix} !important;
}`,
  ];
  for (let i = 0; i < columnCount; i++) {
    const hover = `${root}:has([data-col-index="${i}"]:hover)`;
    const focus = `${root}:has([data-col-index="${i}"]:focus-within)`;
    lines.push(
      `${hover} td[data-col-index="${i}"],
${focus} td[data-col-index="${i}"] {
  box-shadow: inset 0 0 0 9999px ${colMix} !important;
}`,
      `${hover} td[data-col-index="${i}"] > button,
${focus} td[data-col-index="${i}"] > button {
  box-shadow: inset 0 0 0 9999px ${colMix} !important;
}`,
      `${hover} tbody tr:hover > td[data-col-index="${i}"],
${focus} tbody tr:hover > td[data-col-index="${i}"] {
  box-shadow: inset 0 0 0 9999px ${bothMix} !important;
}`,
      `${hover} tbody tr:hover > td[data-col-index="${i}"] > button,
${focus} tbody tr:hover > td[data-col-index="${i}"] > button {
  box-shadow: inset 0 0 0 9999px ${bothMix} !important;
}`,
      `${hover} thead th[data-col-index="${i}"],
${focus} thead th[data-col-index="${i}"] {
  background: color-mix(in srgb, var(--color-interactive-primary) 28%, var(--color-bg-default)) !important;
  box-shadow:
    inset 0 -1px 0 var(--color-border-subtle),
    inset 0 -5px 0 0 var(--color-interactive-primary) !important;
}`
    );
  }
  return lines.join("\n");
}

function AvailabilityGrid({
  data,
  dates,
  headerDates,
  consultants,
  pending,
  panning,
  holidaysByConsultantId,
  leaveByKey,
  weekBandByKey,
  dragConsultantId,
  dragStartIdx,
  dragEndIdx,
  headerPanHandlers,
  headerPanClassName,
  onCellPointerDown,
  onCellPointerEnter,
  onCellClick,
}: {
  data: PlannerLeavePageData;
  dates: string[];
  /** Header labels follow pan immediately (may differ from body dates while dragging). */
  headerDates: string[];
  consultants: PlannerLeavePageData["consultants"];
  pending: boolean;
  /** True while header-dragging or held pan offset — disables crosshair. */
  panning: boolean;
  /** Per consultant: leave_date → holiday name (only their calendar). */
  holidaysByConsultantId: Map<string, Map<string, string>>;
  leaveByKey: Map<string, PlannerLeaveDay[]>;
  /** Weekly absence bands (Consultant view) — key consultantId:date. */
  weekBandByKey: Map<string, WeekBandCell>;
  dragConsultantId: string | null;
  dragStartIdx: number | null;
  dragEndIdx: number | null;
  headerPanHandlers: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
    title: string;
  };
  headerPanClassName: string;
  onCellPointerDown: (
    consultantId: string,
    dateIndex: number,
    event: React.PointerEvent
  ) => void;
  onCellPointerEnter: (dateIndex: number) => void;
  onCellClick: (consultantId: string, dateIndex: number) => void;
}) {
  const monthSpans = useMemo(
    () => monthSpansForDates(headerDates),
    [headerDates]
  );
  const weekSpans = useMemo(
    () => weekSpansForDates(headerDates),
    [headerDates]
  );
  const todayYmd = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);
  const crosshairCss = useMemo(
    () => availabilityCrosshairCss(dates.length),
    [dates.length]
  );

  const dragLo =
    dragStartIdx != null && dragEndIdx != null
      ? Math.min(dragStartIdx, dragEndIdx)
      : null;
  const dragHi =
    dragStartIdx != null && dragEndIdx != null
      ? Math.max(dragStartIdx, dragEndIdx)
      : null;

  const colgroup = (
    <colgroup>
      <col className="allocation-name-col" />
      {dates.map((date) => (
        <col key={date} className="allocation-week-col" />
      ))}
      <col className="allocation-total-col" />
    </colgroup>
  );

  return (
    <div
      className={`availability-crosshair flex h-full min-h-0 min-w-0 flex-1 flex-col${
        panning ? " availability-crosshair-panning" : ""
      }`}
    >
      <style>{crosshairCss}</style>
      <div className="allocation-tables-frozen shrink-0 border-b border-border-subtle bg-bg-default">
        <div className="h-0.5" aria-hidden />
        <table className="w-full min-w-0 table-fixed border border-form border-b-0 text-[10px]">
          {colgroup}
          <thead>
            <tr className="border-b border-grid-subtle">
              <th
                rowSpan={3}
                className="allocation-name-col border-r border-border-subtle px-3 py-1 text-left text-label-s text-text-secondary"
              >
                Consultant
              </th>
              {monthSpans.map((span, i) => (
                <th
                  key={i}
                  colSpan={span.colSpan}
                  {...headerPanHandlers}
                  title={span.label}
                  className={`overflow-hidden border-r border-border-subtle px-1.5 py-1 text-left text-[11px] font-medium uppercase tracking-wide text-text-secondary ${headerPanClassName}`}
                >
                  <span className="block truncate">{span.label}</span>
                </th>
              ))}
              <th
                rowSpan={3}
                className="allocation-total-col border-l border-r border-grid-subtle px-0.5 py-1 text-center text-[10px] font-medium text-text-primary opacity-80"
              >
                Leave
              </th>
            </tr>
            <tr className="border-b border-grid-subtle">
              {weekSpans.map((span, i) => (
                <th
                  key={`${span.year}-${span.week}-${i}`}
                  colSpan={span.colSpan}
                  {...headerPanHandlers}
                  title={`${span.label} ${span.year}`}
                  className={`overflow-hidden border-r border-border-subtle px-0.5 py-1 text-center text-[10px] font-medium tabular-nums text-text-secondary ${headerPanClassName}`}
                >
                  <span className="block truncate">{span.label}</span>
                </th>
              ))}
            </tr>
            <tr className="border-b border-grid-subtle">
              {headerDates.map((date, idx) => {
                const isToday = date === todayYmd;
                const weekend = isWeekend(date);
                const titleParts = [
                  date,
                  isToday ? "today" : null,
                  "Drag to pan timeline",
                ].filter(Boolean);
                return (
                  <th
                    key={`${date}-${idx}`}
                    data-col-index={idx}
                    {...headerPanHandlers}
                    className={`border-r border-border-subtle px-0.5 py-1 text-center text-[10px] font-medium tabular-nums ${headerPanClassName} ${
                      isToday
                        ? "current-week-header bg-accent-primary-subtle text-accent-primary-text border-l border-r"
                        : weekend
                          ? "bg-bg-muted/80 text-text-secondary"
                          : "text-text-secondary"
                    }`}
                    title={titleParts.join(" · ")}
                  >
                    <div>{isoDowLabel(date)}</div>
                    <div>{Number(date.slice(8, 10))}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
        </table>
      </div>
      <div className="allocation-tables-scroll h-0 min-h-0 min-w-0 flex-1">
        <table className="w-full min-w-0 table-fixed border border-form border-t-0 text-[10px]">
          {colgroup}
          <tbody>
            {consultants.length === 0 ? (
              <tr>
                <td
                  colSpan={dates.length + 2}
                  className="px-3 py-8 text-[12px] text-text-secondary"
                >
                  No consultants match the current filters.
                </td>
              </tr>
            ) : (
              consultants.map((consultant) => {
                const dayLeaveTotal = dates.reduce((sum, date) => {
                  const leaves =
                    leaveByKey.get(`${consultant.id}:${date}`) ?? [];
                  return (
                    sum + leaves.reduce((s, leave) => s + leave.hours, 0)
                  );
                }, 0);
                const weekBandHoursSeen = new Set<string>();
                let weekBandTotal = 0;
                for (const date of dates) {
                  const band = weekBandByKey.get(`${consultant.id}:${date}`);
                  if (!band) continue;
                  const wk = weekKey(band.year, band.week);
                  if (weekBandHoursSeen.has(wk)) continue;
                  weekBandHoursSeen.add(wk);
                  weekBandTotal += band.hours;
                }
                const leaveTotal = dayLeaveTotal + weekBandTotal;
                return (
                  <tr
                    key={consultant.id}
                    className="border-b border-grid-light-subtle last:border-form"
                  >
                    <td className="allocation-name-col border-r border-grid-light-subtle px-2 py-1.5 align-middle">
                      <div className="flex items-center justify-between gap-1">
                        <span className="min-w-0 truncate font-medium text-text-primary">
                          {consultant.name}
                          {consultant.teamName ? (
                            <span className="ml-2 text-text-primary opacity-60">
                              ({consultant.teamName})
                            </span>
                          ) : null}
                        </span>
                        <Link
                          href={consultantHref(consultant.id)}
                          prefetch={false}
                          className="shrink-0 rounded p-0.5 text-text-primary opacity-60 hover:bg-bg-muted hover:opacity-100"
                          aria-label={`Open ${consultant.name}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                    {dates.map((date, idx) => {
                      const isToday = date === todayYmd;
                      const weekend = isWeekend(date);
                      const holidayName = holidaysByConsultantId
                        .get(consultant.id)
                        ?.get(date);
                      const holiday = Boolean(holidayName);
                      const blocked = weekend || holiday;
                      const leaves =
                        leaveByKey.get(`${consultant.id}:${date}`) ?? [];
                      const primary = leaves[0];
                      const weekBand = weekBandByKey.get(
                        `${consultant.id}:${date}`
                      );
                      const inDrag =
                        dragConsultantId === consultant.id &&
                        dragLo != null &&
                        dragHi != null &&
                        idx >= dragLo &&
                        idx <= dragHi;
                      const { year, week } = getYearWeekForDate(
                        new Date(`${date}T12:00:00`)
                      );
                      const booked =
                        data.bookedHoursByConsultantWeek[
                          `${consultant.id}:${weekKey(year, week)}`
                        ] ?? 0;
                      const weekBandHoursLabel = weekBand
                        ? weekBand.hours % 1 === 0
                          ? String(weekBand.hours)
                          : weekBand.hours.toFixed(1)
                        : "";
                      const title = [
                        isToday ? `${date} (today)` : date,
                        holidayName ? `Public holiday: ${holidayName}` : null,
                        primary
                          ? `${primary.projectName} ${primary.hours}h`
                          : weekBand
                            ? `${weekBand.projectName} · ${weekBandHoursLabel}h this week (from weekly plan) · v${weekBand.week}`
                            : holiday
                              ? null
                              : "No leave",
                        booked > 0
                          ? `Week booked (non-absence): ${booked}h`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <td
                          key={date}
                          data-col-index={idx}
                          className={`allocation-pan-cell border-r border-grid-light-subtle p-0 text-center select-none cursor-crosshair ${
                            inDrag
                              ? "drag-range-cell"
                              : isToday
                                ? "current-week-cell border-l border-r bg-accent-primary-subtle/40"
                                : holiday
                                  ? "bg-status-danger-subtle ring-1 ring-inset ring-danger/70"
                                  : weekend
                                    ? "bg-bg-muted/70"
                                    : ""
                          }`}
                        >
                          <button
                            type="button"
                            disabled={pending || blocked}
                            title={title}
                            onPointerDown={(event) => {
                              if (blocked || pending) return;
                              onCellPointerDown(consultant.id, idx, event);
                            }}
                            onPointerEnter={() => {
                              if (blocked) return;
                              onCellPointerEnter(idx);
                            }}
                            onClick={() => {
                              if (blocked || pending) return;
                              onCellClick(consultant.id, idx);
                            }}
                            className={`flex h-7 w-full cursor-crosshair items-center justify-center text-[10px] font-medium tabular-nums disabled:cursor-default ${
                              primary
                                ? leaveTone(primary.absenceCode)
                                : weekBand
                                  ? weekBandTone(weekBand.absenceCode)
                                  : holiday
                                    ? "bg-danger/15 text-danger"
                                    : "bg-transparent text-text-tertiary hover:bg-accent-primary-subtle/50"
                            }`}
                          >
                            {primary
                              ? `${shortLeaveLabel(primary.absenceCode)}${
                                  primary.hours % 1 === 0
                                    ? primary.hours
                                    : primary.hours.toFixed(1)
                                }`
                              : weekBand
                                ? weekBand.showLabel
                                  ? `${shortLeaveLabel(weekBand.absenceCode)}${weekBandHoursLabel}`
                                  : ""
                                : ""}
                          </button>
                        </td>
                      );
                    })}
                    <td className="allocation-total-col border-l border-r border-grid-light-subtle px-0.5 py-1 text-center tabular-nums text-text-primary opacity-80">
                      {leaveTotal > 0
                        ? leaveTotal % 1 === 0
                          ? leaveTotal
                          : leaveTotal.toFixed(1)
                        : ""}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PlannerAvailabilityClient({
  initialData,
  error,
  year,
  weekFrom,
  weekTo,
  fromDate,
  toDate,
  initialFilters,
}: {
  initialData: PlannerLeavePageData | null;
  error: string | null;
  year: number;
  weekFrom: number;
  weekTo: number;
  fromDate: string;
  toDate: string;
  initialFilters: AllocationFiltersState;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState(initialData);
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const [filters, setFilters] = useState<AllocationFiltersState>(initialFilters);
  useEffect(() => {
    setFilters(readAllocationFilters(searchParams));
  }, [searchParams]);

  const [message, setMessage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<LeavePrompt | null>(null);
  const [promptProjectId, setPromptProjectId] = useState("");
  const [promptHours, setPromptHours] = useState("8");

  const [dragConsultantId, setDragConsultantId] = useState<string | null>(null);
  const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);
  const [dragEndIdx, setDragEndIdx] = useState<number | null>(null);
  const dragMovedRef = useRef(false);
  const suppressClickRef = useRef(false);

  const dates = useMemo(() => eachDate(fromDate, toDate), [fromDate, toDate]);
  const holidaysByConsultantId = useMemo(() => {
    const byConsultant = new Map<string, Map<string, string>>();
    if (!data) return byConsultant;
    for (const consultant of data.consultants) {
      const list = consultant.calendarId
        ? (data.holidaysByCalendarId[consultant.calendarId] ?? [])
        : [];
      const byDate = new Map<string, string>();
      for (const h of list) byDate.set(h.date, h.name);
      byConsultant.set(consultant.id, byDate);
    }
    return byConsultant;
  }, [data]);

  const leaveByKey = useMemo(() => {
    const map = new Map<string, PlannerLeaveDay[]>();
    for (const day of data?.leaveDays ?? []) {
      const key = `${day.consultantId}:${day.leaveDate}`;
      const list = map.get(key) ?? [];
      list.push(day);
      map.set(key, list);
    }
    return map;
  }, [data?.leaveDays]);

  const weekBandByKey = useMemo(() => {
    if (!data) return new Map<string, WeekBandCell>();
    return buildWeekBandByConsultantDate(
      data.weeklyAbsences ?? [],
      data.leaveDays,
      holidaysByConsultantId,
      new Set(dates)
    );
  }, [data, holidaysByConsultantId, dates]);

  const consultants = useMemo(() => {
    if (!data) return [];
    let rows = data.consultants;
    if (filters.team.length > 0) {
      const set = new Set(filters.team);
      rows = rows.filter((c) => c.teamId != null && set.has(c.teamId));
    }
    if (filters.role.length > 0) {
      const set = new Set(filters.role);
      rows = rows.filter((c) => c.roleId != null && set.has(c.roleId));
    }
    return rows;
  }, [data, filters.team, filters.role]);

  const defaultProjectId =
    data?.defaultVacationProjectId ?? data?.absenceProjects[0]?.id ?? "";

  function openPrompt(next: LeavePrompt) {
    const workDates = workableDates(
      next.dates,
      holidaysByConsultantId.get(next.consultantId)
    );
    if (workDates.length === 0) return;
    setPrompt({ ...next, dates: workDates });
    // Prefer existing day leave, else week-band absence already booked on these days.
    const bandProjectId = workDates
      .map((d) => weekBandByKey.get(`${next.consultantId}:${d}`)?.projectId)
      .find((id): id is string => Boolean(id));
    setPromptProjectId(
      next.existing?.projectId || bandProjectId || defaultProjectId
    );
    setPromptHours(
      String(
        next.existing?.hours ??
          next.hoursPerDay ??
          8
      )
    );
  }

  const clearDrag = useCallback(() => {
    setDragConsultantId(null);
    setDragStartIdx(null);
    setDragEndIdx(null);
    dragMovedRef.current = false;
  }, []);

  useEffect(() => {
    if (dragConsultantId == null) return;
    function onUp() {
      if (
        dragConsultantId == null ||
        dragStartIdx == null ||
        dragEndIdx == null ||
        !data
      ) {
        clearDrag();
        return;
      }
      const moved = dragMovedRef.current;
      const lo = Math.min(dragStartIdx, dragEndIdx);
      const hi = Math.max(dragStartIdx, dragEndIdx);
      const consultant = data.consultants.find((c) => c.id === dragConsultantId);
      const selectedDates = dates.slice(lo, hi + 1);
      if (moved) suppressClickRef.current = true;
      clearDrag();
      if (!moved || !consultant) return;
      openPrompt({
        consultantId: consultant.id,
        consultantName: consultant.name,
        hoursPerDay: consultant.hoursPerDay,
        dates: selectedDates,
        existing: null,
      });
    }
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openPrompt uses latest holiday/data via closure on drag end
  }, [
    dragConsultantId,
    dragStartIdx,
    dragEndIdx,
    data,
    dates,
    clearDrag,
  ]);

  const buildAvailabilityUrl = useCallback(
    (deltaDays: number, nextFilters: AllocationFiltersState = filters) => {
      const newStart = addDaysYmd(fromDate, deltaDays);
      const first = getYearWeekForDate(new Date(`${newStart}T12:00:00`));
      const span =
        weekFrom <= weekTo
          ? weekTo - weekFrom
          : 52 - weekFrom + weekTo;
      const last = addWeeksToYearWeek(first.year, first.week, span);
      const qs = new URLSearchParams(
        buildAllocationSearch(
          { year: first.year, from: first.week, to: last.week },
          nextFilters
        )
      );
      qs.set("start", newStart);
      return `${ROUTES.plannerPlanAvailability}?${qs.toString()}`;
    },
    [filters, fromDate, weekFrom, weekTo]
  );

  const replaceFilters = useCallback(
    (patch: Partial<AllocationFiltersState>) => {
      const next: AllocationFiltersState = {
        team: patch.team !== undefined ? (patch.team ?? []) : filters.team,
        role: patch.role !== undefined ? (patch.role ?? []) : filters.role,
        prob: patch.prob !== undefined ? patch.prob : filters.prob,
        projects:
          patch.projects !== undefined ? patch.projects : filters.projects,
        bookedOnly:
          patch.bookedOnly !== undefined
            ? Boolean(patch.bookedOnly)
            : filters.bookedOnly,
      };
      setFilters(next);
      router.replace(buildAvailabilityUrl(0, next));
    },
    [filters, router, buildAvailabilityUrl]
  );

  const getShiftUrl = useCallback(
    (deltaWeeks: number) => buildAvailabilityUrl(deltaWeeks * 7),
    [buildAvailabilityUrl]
  );

  const shiftWeeks = useCallback(
    (delta: number) => {
      router.push(getShiftUrl(delta));
    },
    [getShiftUrl, router]
  );

  const shiftDays = useCallback(
    (deltaDays: number) => {
      router.push(buildAvailabilityUrl(deltaDays));
    },
    [buildAvailabilityUrl, router]
  );

  const {
    panning,
    panWeeks,
    gridPanStyle,
    headerPanClassName,
    headerPanHandlers,
  } = useAllocationHeaderPan({
    // Same contract as other Planner grids:
    // - header labels follow panWeeks (no CSS translate on header)
    // - body cells CSS-translate via --allocation-pan-x
    // - offset held until rangeKey changes (avoids release double-shift)
    onShiftWeeks: shiftDays,
    rangeKey: `${fromDate}:${toDate}`,
  });

  // Header day labels track the pan immediately; body stays on `dates` + translate.
  const headerDates = useMemo(() => {
    if (panWeeks === 0) return dates;
    return dates.map((d) => addDaysYmd(d, panWeeks));
  }, [dates, panWeeks]);

  function handleCellPointerDown(
    consultantId: string,
    dateIndex: number,
    event: React.PointerEvent
  ) {
    if (event.button !== 0) return;
    dragMovedRef.current = false;
    setDragConsultantId(consultantId);
    setDragStartIdx(dateIndex);
    setDragEndIdx(dateIndex);
  }

  function handleCellPointerEnter(dateIndex: number) {
    if (dragConsultantId == null || dragStartIdx == null) return;
    if (dateIndex !== dragStartIdx) dragMovedRef.current = true;
    setDragEndIdx(dateIndex);
  }

  function handleCellClick(consultantId: string, dateIndex: number) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!data) return;
    const consultant = data.consultants.find((c) => c.id === consultantId);
    const date = dates[dateIndex];
    if (!consultant || !date) return;
    const existing = leaveByKey.get(`${consultantId}:${date}`)?.[0] ?? null;
    openPrompt({
      consultantId: consultant.id,
      consultantName: consultant.name,
      hoursPerDay: consultant.hoursPerDay,
      dates: [date],
      existing,
    });
  }

  function applyLeaveDays(rows: PlannerLeaveDay[]) {
    setData((prev) => {
      if (!prev) return prev;
      let next = prev.leaveDays;
      for (const row of rows) {
        next = next.filter(
          (d) =>
            !(
              d.consultantId === row.consultantId &&
              d.leaveDate === row.leaveDate &&
              d.projectId === row.projectId
            )
        );
        next = [...next, row];
      }
      return { ...prev, leaveDays: next };
    });
  }

  function submitPrompt() {
    if (!prompt || !promptProjectId) return;
    const hours = Number(promptHours.replace(",", "."));
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      setMessage("Hours must be between 0 and 24");
      return;
    }
    const datesToSave = prompt.dates;
    startTransition(async () => {
      setMessage(null);
      try {
        if (datesToSave.length === 1) {
          const row = await upsertPlannerLeaveDayAction({
            consultantId: prompt.consultantId,
            projectId: promptProjectId,
            leaveDate: datesToSave[0]!,
            hours,
          });
          applyLeaveDays([row]);
        } else {
          await upsertPlannerLeaveRangeAction({
            consultantId: prompt.consultantId,
            projectId: promptProjectId,
            dates: datesToSave,
            hoursPerDay: hours,
          });
          applyLeaveDays(
            datesToSave.map((leaveDate) => ({
              id: `tmp:${prompt.consultantId}:${promptProjectId}:${leaveDate}`,
              consultantId: prompt.consultantId,
              projectId: promptProjectId,
              absenceCode:
                data?.absenceProjects.find((p) => p.id === promptProjectId)
                  ?.absenceCode ?? null,
              projectName:
                data?.absenceProjects.find((p) => p.id === promptProjectId)
                  ?.name ?? "Absence",
              leaveDate,
              hours,
              note: null,
            }))
          );
        }
        setPrompt(null);
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  function removePromptLeave() {
    if (!prompt?.existing) return;
    const id = prompt.existing.id;
    startTransition(async () => {
      setMessage(null);
      try {
        await deletePlannerLeaveDayAction(id);
        setData((prev) =>
          prev
            ? {
                ...prev,
                leaveDays: prev.leaveDays.filter((d) => d.id !== id),
              }
            : prev
        );
        setPrompt(null);
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Remove failed");
      }
    });
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Availability" className="mb-3 shrink-0" />
        <p className="text-danger">{error ?? "No data"}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Availability"
        description="Manage leave per day"
        className="mb-3 shrink-0"
      />

      <div className="mb-1.5 flex shrink-0 items-center justify-end gap-1 px-2">
        <div className="flex items-center gap-1">
          <AllocationViewControls
            teams={data.teams}
            roles={data.roles}
            teamFilterIds={filters.team}
            onTeamFilterChange={(value) => replaceFilters({ team: value })}
            roleFilterIds={filters.role}
            onRoleFilterChange={(value) => replaceFilters({ role: value })}
            showView={false}
          />
          <AllocationWeekNav
            onShift={shiftWeeks}
            getUrl={getShiftUrl}
            prefetch={router.prefetch.bind(router)}
          />
        </div>
      </div>

      {message ? (
        <p className="mb-1 px-2 text-[12px] text-danger">{message}</p>
      ) : null}
      {pending ? (
        <p className="mb-1 px-2 text-[12px] text-text-tertiary">Saving…</p>
      ) : null}

      <div
        className={`allocation-tables flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-default ${
          panning ? "allocation-tables-panning" : ""
        }`}
        style={{
          ...gridPanStyle,
          ["--allocation-name-col-width" as string]: "300px",
          ["--allocation-week-col-width" as string]: "1.75rem",
          ["--allocation-total-col-width" as string]: "3.25rem",
        }}
      >
        <AvailabilityGrid
          data={data}
          dates={dates}
          headerDates={headerDates}
          consultants={consultants}
          pending={pending}
          panning={panning || panWeeks !== 0}
          holidaysByConsultantId={holidaysByConsultantId}
          leaveByKey={leaveByKey}
          weekBandByKey={weekBandByKey}
          dragConsultantId={dragConsultantId}
          dragStartIdx={dragStartIdx}
          dragEndIdx={dragEndIdx}
          headerPanHandlers={headerPanHandlers}
          headerPanClassName={headerPanClassName}
          onCellPointerDown={handleCellPointerDown}
          onCellPointerEnter={handleCellPointerEnter}
          onCellClick={handleCellClick}
        />
      </div>

      <Dialog
        open={prompt != null}
        onOpenChange={(open) => {
          if (!open) setPrompt(null);
        }}
        title="Add leave"
        subtitle={
          prompt
            ? `${prompt.consultantName} · ${formatDateRangeLabel(prompt.dates)}`
            : undefined
        }
      >
        {prompt ? (
          <div className="modal-form-discreet space-y-4">
            <Select
              label="Absence type"
              value={promptProjectId}
              onValueChange={setPromptProjectId}
              options={data.absenceProjects.map((project) => ({
                value: project.id,
                label: project.absenceCode
                  ? absenceCodeLabel(project.absenceCode)
                  : project.name,
              }))}
            />
            <Input
              label={
                prompt.dates.length > 1 ? "Hours per day" : "Hours"
              }
              value={promptHours}
              onChange={(event) => setPromptHours(event.target.value)}
              inputMode="decimal"
            />
            <div className="flex justify-end gap-2 pt-1">
              {prompt.existing ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={removePromptLeave}
                >
                  Remove
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => setPrompt(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={pending || !promptProjectId}
                onClick={submitPrompt}
              >
                Save
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
