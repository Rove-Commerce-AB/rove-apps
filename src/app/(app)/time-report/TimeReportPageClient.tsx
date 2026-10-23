"use client";

import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  Fragment,
  useMemo,
  memo,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Plus,
  Trash2,
  X,
  Copy,
  CopyPlus,
  Link,
  Link2Off,
  ExternalLink,
  Loader2,
  Save,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  getActiveProjectsForCustomer,
  getJiraDevOpsOptionsForProject,
  getTaskOptionsForCustomerAndProject,
  getWorkIssueOptionsForCustomer,
  getHolidayDatesForWeek,
  getHolidayDatesForRange,
  getTimeReportEntries,
  getTimeReportEntriesForWeeks,
  saveTimeReportEntries,
  copyEntryToWeek,
  copyTimeReportEntriesBatch,
  batchHydrateTimeReport,
  getTimeReportWeekRevision,
  getTimeReportWeekRevisions,
} from "./actions";
import type {
  ProjectOption,
  JiraDevOpsOption,
  TaskOption,
  TimeReportCopyBatchOperation,
} from "@/types";
import { Button, Select, Combobox, Dialog, IconButton, SegmentedControl } from "@/components/ui";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DEFAULT_CUSTOMER_COLOR } from "@/lib/constants";
import {
  collectWorkIssueIdsFromLinkKeys,
  workIssueLinkKey,
} from "@/lib/workIssueTimeLink";
import {
  getISOWeekDateRangeLocal,
  addWeeksToYearWeekLocal,
  getWeeksInMonthLocal,
  getWeekDates,
  getCalendarDatesInMonth,
  getYearWeekForDateLocal,
  weekSliceKey,
  displayMonthForWeekNavigation,
} from "@/lib/timeReportBrowserWeek";
import {
  buildMergedMonthRows,
  buildCustomerGroupsForWeekFromMerged,
  sortCustomerGroupsByCustomerName,
  sortMonthMergedRowsByCustomerName,
  weekSliceKeysForMergedRow,
  type TimeReportMonthMergedRow,
} from "@/lib/timeReportMonthMerge";
import {
  TIME_REPORT_DAY_LABELS,
  TIME_REPORT_MONTH_GRID_DOW,
  TIME_REPORT_VIEW_MODE_STORAGE_KEY,
} from "./timeReportShared";
import {
  type TimeReportEntry as Entry,
  type TimeReportCustomerGroup as CustomerGroup,
  newTimeReportEntry as newEntry,
  timeReportEntryHasContent as entryHasContent,
  timeReportTaskCacheKey as taskCacheKey,
  timeReportGroupTotalHours as groupTotalHours,
  timeReportDayTotals as dayTotals,
} from "./timeReportEntryModel";
import { TimeReportHourCell } from "./TimeReportHourCell";

const ENABLE_PERF_DEBUG = process.env.NEXT_PUBLIC_DEBUG_PERF === "1";

function collectTimeReportHydratePayload(groups: CustomerGroup[]): {
  customerIds: string[];
  taskOptionPairs: Array<{ customerId: string; projectId: string }>;
  workIssueIds: string[];
} {
  const customerIds = [...new Set(groups.map((g) => g.customerId))];
  const pairSeen = new Set<string>();
  const taskOptionPairs: Array<{ customerId: string; projectId: string }> = [];
  const workIssueIds: string[] = [];
  const workSeen = new Set<string>();
  for (const g of groups) {
    for (const e of g.entries) {
      const k = `${g.customerId}|${e.projectId || ""}`;
      if (!pairSeen.has(k)) {
        pairSeen.add(k);
        taskOptionPairs.push({
          customerId: g.customerId,
          projectId: e.projectId || "",
        });
      }
      for (const workIssueId of collectWorkIssueIdsFromLinkKeys([e.jiraDevOpsValue])) {
        if (workSeen.has(workIssueId)) continue;
        workSeen.add(workIssueId);
        workIssueIds.push(workIssueId);
      }
    }
  }
  return { customerIds, taskOptionPairs, workIssueIds };
}

/** Parallel server-action bursts when switching months could stall the pool; fetch sequentially + timeout so UI never hangs on `loading` forever. */
const TIME_REPORT_FETCH_TIMEOUT_MS = 45_000;
/** If Postgres or the server action stalls, month save loops would otherwise leave “Saving…” indefinitely. */
const SAVE_SERVER_ACTION_TIMEOUT_MS = 90_000;

function promiseWithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label}: exceeded ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }) as Promise<T>;
}

type TimeReportWeekPayload = Awaited<ReturnType<typeof getTimeReportEntries>>;

/**
 * One server action loads the month weeks sequentially server-side. This keeps
 * browser request pressure low without reintroducing parallel DB bursts.
 */
async function fetchTimeReportWeeksSequentialUnlessAborted(
  consultantId: string,
  weeks: { year: number; week: number }[],
  labelPrefix: string,
  shouldAbort: () => boolean,
  /** Only set for month aggregate loads — ISO weeks can span two calendar months. */
  calendarMonthForLineFilter?: { year: number; month: number } | null
): Promise<TimeReportWeekPayload[] | null> {
  if (shouldAbort()) return null;
  const timeoutMs = TIME_REPORT_FETCH_TIMEOUT_MS * Math.max(1, weeks.length);
  const payload = await promiseWithTimeout(
    getTimeReportEntriesForWeeks(
      consultantId,
      weeks,
      calendarMonthForLineFilter ?? undefined
    ),
    timeoutMs,
    `${labelPrefix} ${weeks.length} week batch`
  );
  return shouldAbort() ? null : payload;
}

function weekSliceKeysForCalendarDate(
  dateStr: string,
  monthWeeks: { year: number; week: number }[]
): string[] {
  const keys: string[] = [];
  for (const { year, week } of monthWeeks) {
    if (getWeekDates(year, week).includes(dateStr)) {
      keys.push(weekSliceKey(year, week));
    }
  }
  return keys;
}

/** Native `title` on the Jira/DevOps/ClickUp key: shows summary/title when loaded. */
function jiraDevOpsKeyTooltipTitle(
  displayKey: string,
  description?: string | null
): string {
  const d = description?.trim();
  if (!d) return `${displayKey} — Change Jira/DevOps/ClickUp/Work`;
  const normalizedDisplay = displayKey.toLowerCase();
  const normalizedDescription = d.toLowerCase();
  // Jira labels already include summary (e.g. "ABC-123: Summary"), so avoid duplicates.
  if (normalizedDisplay.includes(normalizedDescription)) return displayKey;
  return `${displayKey} — ${d}`;
}

function jiraDevOpsDisplayLabel(
  rawValue: string,
  option?: { label: string } | null
): string {
  const label = option?.label?.trim();
  if (label) return label;
  return rawValue.replace(/^(jira|devops|clickup|work):/, "");
}

/** Compact display for footer / row hour totals (matches week vs month grid footers). */
function formatReportHoursTotal(
  w: number,
  precision: "week" | "month"
): string {
  if (!Number.isFinite(w) || w === 0) return "";
  if (Math.abs(w - Math.round(w)) < 1e-6) return String(Math.round(w));
  if (precision === "week") {
    return String(Math.round(w * 10) / 10).replace(/\.0$/, "");
  }
  return String(Math.round(w * 100) / 100).replace(/\.?0+$/, "");
}

/** Computed totals only — italic + secondary tone vs editable hour cells and date labels. */
function timeReportSumFigureClass(size: "week" | "month"): string {
  return [
    // No truncate: overflow:hidden clips italic glyph overshoot in narrow columns.
    "inline-flex max-w-full items-center justify-center overflow-visible italic tabular-nums font-semibold text-text-secondary empty:hidden pl-px pr-1",
    size === "week" ? "text-xs leading-none" : "text-[12px] leading-tight",
  ].join(" ");
}

/** Ref must update synchronously: month save loops multiple ISO weeks in one run; the next `expected` revision must not lag React state. */
function syncWeekRevisionAfterSave(
  setWeekRevisionsByKey: Dispatch<SetStateAction<Record<string, number>>>,
  weekRevisionsByKeyRef: MutableRefObject<Record<string, number>>,
  sk: string,
  revision: number
) {
  weekRevisionsByKeyRef.current = { ...weekRevisionsByKeyRef.current, [sk]: revision };
  setWeekRevisionsByKey((prev) => ({ ...prev, [sk]: revision }));
}

/** One logical time row in month view (may span multiple ISO weeks after merge). */
type MonthMergedRow = TimeReportMonthMergedRow;

function mergedRowAllLineIds(row: MonthMergedRow): string[] {
  const ids = new Set<string>();
  for (const id of Object.values(row.lineIdByWeekSliceKey)) {
    if (id) ids.add(id);
  }
  if (row.lineId) ids.add(row.lineId);
  return [...ids];
}

function newMonthMergedRow(customerId: string, monthCalendarDates: string[]): MonthMergedRow {
  const hoursByDate: Record<string, number> = {};
  const commentsByDate: Record<string, string> = {};
  for (const d of monthCalendarDates) {
    hoursByDate[d] = 0;
    commentsByDate[d] = "";
  }
  return {
    rowKey: crypto.randomUUID(),
    lineId: crypto.randomUUID(),
    lineIdByWeekSliceKey: {},
    displayOrder: 0,
    weekSliceKeys: [],
    isDraft: true,
    customerId,
    projectId: "",
    roleId: "",
    jiraDevOpsValue: "",
    task: "",
    hoursByDate,
    commentsByDate,
  };
}

function pseudoCustomerGroupsForHydrate(rows: MonthMergedRow[]): CustomerGroup[] {
  const byCustomer = new Map<string, Entry[]>();
  const order: string[] = [];
  for (const row of rows) {
    if (!byCustomer.has(row.customerId)) {
      byCustomer.set(row.customerId, []);
      order.push(row.customerId);
    }
    byCustomer.get(row.customerId)!.push({
      id: row.lineId,
      displayOrder: row.displayOrder,
      projectId: row.projectId,
      roleId: row.roleId,
      jiraDevOpsValue: row.jiraDevOpsValue,
      task: row.task,
      hours: [0, 0, 0, 0, 0, 0, 0],
      comments: {},
    });
  }
  return order.map((cid) => ({ customerId: cid, entries: byCustomer.get(cid)! }));
}

function mergedRowHasContent(row: MonthMergedRow): boolean {
  const hasHours = Object.values(row.hoursByDate).some((h) => (h ?? 0) > 0);
  const hasComment = Object.values(row.commentsByDate).some((c) => (c ?? "").trim() !== "");
  return hasHours || hasComment;
}

function hasAmbiguousLineIdentity(groups: CustomerGroup[]): boolean {
  const byId = new Map<string, string>();
  for (const g of groups) {
    for (const e of g.entries) {
      const shape = [
        g.customerId,
        e.projectId ?? "",
        e.roleId ?? "",
        e.jiraDevOpsValue ?? "",
        (e.task ?? "").trim(),
        String(e.displayOrder ?? 0),
      ].join("|");
      const prev = byId.get(e.id);
      if (prev && prev !== shape) return true;
      byId.set(e.id, shape);
    }
  }
  return false;
}

/** Same calendar day-of-month in another (year, month), clamped to last day of target month. */
function mapDateSameDomToMonth(
  sourceYmd: string,
  targetYear: number,
  targetMonth: number
): string {
  const d0 = new Date(sourceYmd + "T12:00:00");
  const dom = d0.getDate();
  const last = new Date(targetYear, targetMonth, 0).getDate();
  const day = Math.min(dom, last);
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function nextCalendarMonth(year: number, month: number): { y: number; m: number } {
  if (month === 12) return { y: year + 1, m: 1 };
  return { y: year, m: month + 1 };
}

function dedupeWeeksFromCopyOperations(
  operations: TimeReportCopyBatchOperation[]
): { year: number; week: number }[] {
  const seen = new Set<string>();
  const weeks: { year: number; week: number }[] = [];
  for (const op of operations) {
    const k = weekSliceKey(op.targetYear, op.targetWeek);
    if (seen.has(k)) continue;
    seen.add(k);
    weeks.push({ year: op.targetYear, week: op.targetWeek });
  }
  return weeks;
}

/** Builds server payloads for copying one merged month row into the following calendar month. */
function buildCopyMergedRowToNextMonthOperations(
  row: MonthMergedRow,
  displayYear: number,
  displayMonth: number,
  copyHours: boolean
): TimeReportCopyBatchOperation[] {
  if (copyHours) {
    if (!row.projectId || !row.roleId) return [];
    if (!mergedRowHasContent(row)) return [];
  }

  const { y: ny, m: nm } = nextCalendarMonth(displayYear, displayMonth);
  const curDates = getCalendarDatesInMonth(displayYear, displayMonth);
  const nextDates = getCalendarDatesInMonth(ny, nm);
  const monthDaySet = new Set(nextDates);
  const targetLineId = crypto.randomUUID();
  const hoursByNext: Record<string, number> = {};
  const commentsByNext: Record<string, string> = {};
  for (const d of nextDates) {
    hoursByNext[d] = 0;
    commentsByNext[d] = "";
  }
  if (copyHours) {
    for (const d of curDates) {
      const h = row.hoursByDate[d] ?? 0;
      const c = (row.commentsByDate[d] ?? "").trim();
      if (h === 0 && !c) continue;
      const mapped = mapDateSameDomToMonth(d, ny, nm);
      hoursByNext[mapped] = (hoursByNext[mapped] ?? 0) + h;
      if (c) commentsByNext[mapped] = c;
    }
  }

  const operations: TimeReportCopyBatchOperation[] = [];
  const nextWeeks = getWeeksInMonthLocal(nm, ny);
  const lineDisplayOrder = row.displayOrder;

  for (const { year: y, week: w } of nextWeeks) {
    const wd = getWeekDates(y, w);
    const hours = wd.map((d) => hoursByNext[d] ?? 0);
    const comments: Record<number, string> = {};
    wd.forEach((d, i) => {
      const t = (commentsByNext[d] ?? "").trim();
      if (t) comments[i] = commentsByNext[d] ?? "";
    });
    const has = hours.some((hh) => (hh ?? 0) > 0) || Object.keys(comments).length > 0;
    if (copyHours && !has) continue;

    const stubHeaderAnchor: string | undefined = copyHours
      ? undefined
      : (wd.find((d) => monthDaySet.has(d)) ?? nextDates[0]);
    if (!copyHours && stubHeaderAnchor == null) continue;

    operations.push({
      targetYear: y,
      targetWeek: w,
      customerId: row.customerId,
      entry: {
        lineId: targetLineId,
        lineDisplayOrder,
        projectId: row.projectId,
        roleId: row.roleId,
        jiraDevOpsValue: row.jiraDevOpsValue,
        task: row.task,
        hours,
        comments,
        copyHours,
        rowOnlyAnchorDate: stubHeaderAnchor,
      },
    });
  }

  return operations;
}

type CustomerOption = { id: string; name: string; color?: string | null };

type Props = {
  consultant: { id: string; name: string; calendar_id?: string } | null;
  customers: CustomerOption[];
  initialYear: number;
  initialWeek: number;
  initialDisplayYear: number;
  initialDisplayMonth: number;
  calendarId: string | null;
  initialHolidayDates: string[];
};

type TimeReportSaveState = "idle" | "saving" | "error";
type FloatingSaveStatusState = "saved" | "pending" | "saving" | "error";

function FloatingSaveStatus({
  saveState,
  isDirty,
  saveError,
}: {
  saveState: TimeReportSaveState;
  isDirty: boolean;
  saveError: string | null;
}) {
  const status: FloatingSaveStatusState =
    saveState === "error"
      ? "error"
      : saveState === "saving"
        ? "saving"
        : isDirty
          ? "pending"
          : "saved";
  const errorMessage = saveError?.trim() || "Save failed";
  const isError = status === "error";
  const label =
    status === "saving"
      ? "Saving"
      : status === "pending"
        ? "Pending save"
        : isError
          ? "Save failed"
          : "Saved";
  const description =
    status === "saving"
      ? "Autosave is running"
      : status === "pending"
        ? "Changes will autosave shortly"
        : isError
          ? errorMessage
          : "All changes are saved";
  const toneClass = isError
    ? "bg-status-warning text-text-inverse"
    : "bg-brand-signal text-text-inverse";

  return (
    <div className="fixed right-20 bottom-6 z-40">
      <div
        role={isError ? "alert" : "status"}
        aria-live="polite"
        aria-label={`${label}: ${description}`}
        tabIndex={isError ? 0 : -1}
        title={isError ? errorMessage : description}
        className={`group/save-status relative flex h-12 w-44 items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold shadow-lg transition-opacity hover:opacity-90 ${toneClass}`}
      >
        <span
          className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 ${
            status === "saving" ? "animate-pulse" : ""
          }`}
          aria-hidden
        >
          <Save className="h-4 w-4" />
          {status === "saved" ? (
            <CheckCircle2 className="absolute -right-1 -bottom-1 h-4 w-4 rounded-full bg-bg-default text-brand-signal animate-[savedCheckFade_2s_ease-out]" />
          ) : null}
          {isError ? (
            <AlertTriangle className="absolute -right-1 -bottom-1 h-4 w-4 rounded-full bg-bg-default text-status-warning" />
          ) : null}
          {status === "saving" ? (
            <span className="absolute inset-0 rounded-full border border-current opacity-40 animate-ping" />
          ) : null}
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="whitespace-nowrap">{label}</span>
          <span className="max-w-[8.5rem] truncate text-[10px] font-medium opacity-70">
            {description}
          </span>
        </span>
        {isError ? (
          <div
            role="tooltip"
            className="pointer-events-none absolute right-0 bottom-full mb-2 w-max max-w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-form bg-bg-default px-3 py-2 text-left text-[11px] font-medium leading-snug text-text-primary opacity-0 shadow-lg transition-opacity duration-150 group-hover/save-status:opacity-100 group-focus-within/save-status:opacity-100"
            style={{ borderColor: "var(--panel-border)" }}
          >
            {errorMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type EditableHourTdProps = {
  dayIndex: number;
  entryId: string;
  value: number;
  isEditing: boolean;
  isGray: boolean;
  /** Sat–Sun (month: lör–sön): slightly stronger mute than weekday public holidays. */
  grayWeekend?: boolean;
  isToday: boolean;
  onStartEdit: () => void;
  onCommit: (value: number) => void;
  onBlur: () => void;
  compact?: boolean;
  /** When set, overrides default `dayIndex === 0` for left border (month grid). */
  showLeftBorder?: boolean;
  /** Trimmed internal comment for this day; corner marker + instant hover preview when set. */
  internalCommentText?: string;
  /** Day/date column index for CSS :has() column crosshair (0–31). */
  colIndex: number;
};

const EditableHourTd = memo(function EditableHourTd({
  dayIndex,
  entryId,
  value,
  isEditing,
  isGray,
  grayWeekend = false,
  isToday,
  onStartEdit,
  onCommit,
  onBlur,
  compact = false,
  showLeftBorder,
  internalCommentText,
  colIndex,
}: EditableHourTdProps) {
  const leftBorder = showLeftBorder ?? (dayIndex === 0 && !compact);
  const cellW = compact
    ? "min-w-0 w-full max-w-none"
    : "w-[clamp(2.25rem,3.6vw,3rem)] min-w-[2.25rem]";
  const rowH = compact ? "h-7" : "h-8";
  const grayBg = isGray ? (grayWeekend ? "bg-bg-muted/60" : "bg-bg-muted/51") : "";
  const commentPreview = internalCommentText?.trim();
  const hasInternalComment = Boolean(commentPreview);
  return (
    <td
      data-col-index={colIndex}
      className={`relative ${rowH} ${cellW} border-r border-border-subtle p-0 align-middle ${leftBorder ? "border-l border-border-subtle" : ""} ${grayBg} ${isToday ? "time-report-today-cell" : ""}`}
    >
      <div
        role="button"
        tabIndex={isEditing ? -1 : 0}
        onFocus={() => {
          if (!isEditing) onStartEdit();
        }}
        onClick={() => (isEditing ? undefined : onStartEdit())}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!isEditing) onStartEdit();
          }
        }}
        className={`absolute inset-0 flex items-center justify-center rounded-sm transition-colors ${
          hasInternalComment ? "group/comment-tip" : ""
        } ${isEditing ? "cursor-default" : "cursor-pointer hover:bg-bg-muted/60"}`}
      >
        <TimeReportHourCell
          value={value}
          entryId={entryId}
          dayIndex={dayIndex}
          isEditing={isEditing}
          onStartEdit={onStartEdit}
          onCommit={onCommit}
          onBlur={onBlur}
          compact={compact}
        />
        {hasInternalComment ? (
          <div
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-0.5 w-max max-w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 whitespace-pre-wrap break-words rounded-md border border-border-subtle bg-bg-default px-2 py-1.5 text-left text-[11px] leading-snug text-text-primary opacity-0 shadow-md transition-none group-hover/comment-tip:opacity-100"
          >
            {commentPreview}
          </div>
        ) : null}
      </div>
      {hasInternalComment ? (
        <svg
          className={`pointer-events-none absolute top-0 right-0 z-10 text-brand-signal ${compact ? "h-2 w-2" : "h-2.5 w-2.5"}`}
          viewBox="0 0 8 8"
          aria-hidden
        >
          <polygon points="8 0 8 8 0 0" className="fill-current" />
        </svg>
      ) : null}
    </td>
  );
});

export function TimeReportPageClient({
  consultant,
  customers,
  initialYear,
  initialWeek,
  initialDisplayYear,
  initialDisplayMonth,
  calendarId,
  initialHolidayDates,
}: Props) {
  const [year, setYear] = useState(initialYear);
  const [week, setWeek] = useState(initialWeek);
  const [holidayDates, setHolidayDates] = useState<string[]>(initialHolidayDates);
  const [customerGroups, setCustomerGroups] = useState<CustomerGroup[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const router = useRouter();
  const [projectCache, setProjectCache] = useState<Record<string, ProjectOption[]>>({});
  const [taskCache, setTaskCache] = useState<Record<string, TaskOption[]>>({});
  const [workIssueCache, setWorkIssueCache] = useState<
    Record<string, { value: string; label: string; url?: string }[]>
  >({});
  const [projectOptionsLoading, setProjectOptionsLoading] = useState<Record<string, boolean>>(
    {}
  );
  const [taskOptionsLoading, setTaskOptionsLoading] = useState<Record<string, boolean>>({});
  const [workIssueOptionsLoading, setWorkIssueOptionsLoading] = useState<
    Record<string, boolean>
  >({});
  const projectLoadInflightRef = useRef<Set<string>>(new Set());
  const taskLoadInflightRef = useRef<Set<string>>(new Set());
  const workIssueLoadInflightRef = useRef<Set<string>>(new Set());
  const [jiraDevOpsCache, setJiraDevOpsCache] = useState<Record<string, JiraDevOpsOption[]>>({});
  const [jiraOptionsLoading, setJiraOptionsLoading] = useState<Record<string, boolean>>({});
  const jiraLoadInflightRef = useRef<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<
    | { scope: "week"; entryId: string; dayIndex: number }
    | { scope: "month"; rowId: string; dateStr: string }
    | null
  >(null);
  const [commentState, setCommentState] = useState<
    | { kind: "week"; entryId: string; weekYear: number; weekWeek: number }
    | { kind: "month"; rowId: string }
    | null
  >(null);
  const [commentTexts, setCommentTexts] = useState<Record<number, string>>({});
  const [commentTextsByDate, setCommentTextsByDate] = useState<Record<string, string>>({});
  const [jiraDevOpsModal, setJiraDevOpsModal] = useState<{
    customerId: string;
    entryId: string;
  } | null>(null);
  const [jiraDevOpsModalValue, setJiraDevOpsModalValue] = useState("");
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [copyToWeekState, setCopyToWeekState] = useState<"idle" | "copying" | "error">("idle");
  const [copyRowDialog, setCopyRowDialog] = useState<
    | null
    | { mode: "current-week"; customerId: string; entry: Entry }
    | { mode: "next-month"; row: MonthMergedRow }
    | { mode: "whole-week-next-week" }
    | { mode: "whole-month-next-month" }
  >(null);
  const [pendingRowDelete, setPendingRowDelete] = useState<{
    customerId: string;
    entryId: string;
  } | null>(null);
  const [copyToNextMonthState, setCopyToNextMonthState] = useState<"idle" | "copying" | "error">("idle");
  const [loadState, setLoadState] = useState<"idle" | "loading" | "loaded">("idle");
  const [saveState, setSaveState] = useState<TimeReportSaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showValidationHighlights, setShowValidationHighlights] = useState(false);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRequestIdRef = useRef(0);
  const weekRevisionRef = useRef(0);
  const [weekRevisionsByKey, setWeekRevisionsByKey] = useState<Record<string, number>>({});
  const weekRevisionsByKeyRef = useRef<Record<string, number>>({});
  const deletedLineIdsByWeekRef = useRef<Record<string, Set<string>>>({});
  const [revisionConflictOpen, setRevisionConflictOpen] = useState(false);
  const savePausedForRevisionConflictRef = useRef(false);
  const lastLocalSaveAtRef = useRef(0);
  const lastVisibilityRevalidateAtRef = useRef(0);
  const saveStateRef = useRef(saveState);
  const loadStateRef = useRef(loadState);
  const weekLoadRequestIdRef = useRef(0);
  const customerById = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers]
  );
  const customerGroupsRef = useRef(customerGroups);
  const isDirtyRef = useRef(isDirty);
  const yearRef = useRef(year);
  const weekRef = useRef(week);
  const consultantRef = useRef(consultant);
  const [displayMonth, setDisplayMonth] = useState(initialDisplayMonth);
  const [displayYear, setDisplayYear] = useState(initialDisplayYear);
  const [weekStripAnimClass, setWeekStripAnimClass] = useState<
    ""
    | "animate-week-strip-out-to-left"
    | "animate-week-strip-out-to-right"
    | "animate-week-strip-in-from-left"
    | "animate-week-strip-in-from-right"
  >("");
  const [isWeekStripTransitioning, setIsWeekStripTransitioning] = useState(false);
  const [viewMode, setViewMode] = useState<"week" | "month">("month");
  const [viewModeStorageReady, setViewModeStorageReady] = useState(false);
  const [monthMergedRows, setMonthMergedRows] = useState<MonthMergedRow[]>([]);
  const monthLoadRequestIdRef = useRef(0);
  /** ISO week slice keys touched in month view — only these weeks are autosaved. */
  const dirtyWeekSliceKeysRef = useRef<Set<string>>(new Set());
  const viewModeRef = useRef(viewMode);
  /** Serialize server saves so concurrent requests never reuse a stale expectedRevision (revision_conflict). */
  const saveQueueTailRef = useRef(Promise.resolve());
  const enqueueTimeReportSave = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = saveQueueTailRef.current.then(fn);
    saveQueueTailRef.current = run.then(() => {}).catch(() => {});
    return run;
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TIME_REPORT_VIEW_MODE_STORAGE_KEY);
      if (raw === "week" || raw === "month") {
        setViewMode(raw);
      }
    } catch {
      // private mode / blocked storage
    } finally {
      setViewModeStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!viewModeStorageReady) return;
    try {
      localStorage.setItem(TIME_REPORT_VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
      // ignore
    }
  }, [viewMode, viewModeStorageReady]);
  const monthMergedRowsRef = useRef(monthMergedRows);
  const displayMonthRef = useRef(displayMonth);
  const displayYearRef = useRef(displayYear);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);
  useLayoutEffect(() => {
    monthMergedRowsRef.current = monthMergedRows;
  }, [monthMergedRows]);
  useEffect(() => {
    displayMonthRef.current = displayMonth;
  }, [displayMonth]);
  useEffect(() => {
    displayYearRef.current = displayYear;
  }, [displayYear]);

  useLayoutEffect(() => {
    customerGroupsRef.current = customerGroups;
  }, [customerGroups]);
  useLayoutEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);
  const clearDirtyWeekSliceKeys = useCallback(() => {
    dirtyWeekSliceKeysRef.current = new Set();
  }, []);

  const markDirty = useCallback((monthWeekSliceKeys?: string[]) => {
    if (monthWeekSliceKeys?.length) {
      for (const k of monthWeekSliceKeys) dirtyWeekSliceKeysRef.current.add(k);
    }
    setIsDirty(true);
    // flushSave may run before React commits state; keep ref in sync immediately.
    isDirtyRef.current = true;
  }, []);

  const markDirtyEntireDisplayMonth = useCallback(() => {
    const keys = getWeeksInMonthLocal(displayMonthRef.current, displayYearRef.current).map(
      ({ year: y, week: w }) => weekSliceKey(y, w)
    );
    markDirty(keys);
  }, [markDirty]);

  const getMonthWeeksToSave = useCallback((): { year: number; week: number }[] => {
    const all = getWeeksInMonthLocal(displayMonthRef.current, displayYearRef.current);
    const dirty = dirtyWeekSliceKeysRef.current;
    if (dirty.size === 0) return all;
    return all.filter(({ year, week }) => dirty.has(weekSliceKey(year, week)));
  }, []);
  useEffect(() => {
    yearRef.current = year;
  }, [year]);
  useEffect(() => {
    weekRef.current = week;
  }, [week]);
  useEffect(() => {
    consultantRef.current = consultant;
  }, [consultant]);
  useEffect(() => {
    weekRevisionsByKeyRef.current = weekRevisionsByKey;
  }, [weekRevisionsByKey]);
  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);
  useLayoutEffect(() => {
    loadStateRef.current = loadState;
  }, [loadState]);

  const runBatchHydrate = useCallback(async (groups: CustomerGroup[]) => {
    const { customerIds, taskOptionPairs, workIssueIds } =
      collectTimeReportHydratePayload(groups);
    if (customerIds.length === 0 && taskOptionPairs.length === 0) return;

    for (const cid of customerIds) {
      setProjectOptionsLoading((s) => ({ ...s, [cid]: true }));
      setWorkIssueOptionsLoading((s) => ({ ...s, [cid]: true }));
    }
    for (const p of taskOptionPairs) {
      const key = taskCacheKey(p.customerId, p.projectId);
      setTaskOptionsLoading((s) => ({ ...s, [key]: true }));
    }
    try {
      const result = await batchHydrateTimeReport(
        customerIds,
        taskOptionPairs,
        workIssueIds
      );
      setProjectCache((prev) => ({ ...prev, ...result.projectsByCustomerId }));
      setTaskCache((prev) => ({ ...prev, ...result.tasksByCacheKey }));
      setWorkIssueCache((prev) => ({ ...prev, ...result.workIssuesByCustomerId }));
    } finally {
      for (const cid of customerIds) {
        setProjectOptionsLoading((s) => {
          const next = { ...s };
          delete next[cid];
          return next;
        });
        setWorkIssueOptionsLoading((s) => {
          const next = { ...s };
          delete next[cid];
          return next;
        });
      }
      for (const p of taskOptionPairs) {
        const key = taskCacheKey(p.customerId, p.projectId);
        setTaskOptionsLoading((s) => {
          const next = { ...s };
          delete next[key];
          return next;
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!calendarId) {
      setHolidayDates([]);
      return;
    }
    if (viewMode === "week") {
      getHolidayDatesForWeek(calendarId, year, week).then(setHolidayDates);
      return;
    }
    const monthStart = `${displayYear}-${String(displayMonth).padStart(2, "0")}-01`;
    const last = new Date(displayYear, displayMonth, 0);
    const monthEnd = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
    getHolidayDatesForRange(calendarId, monthStart, monthEnd).then(setHolidayDates);
  }, [calendarId, year, week, viewMode, displayMonth, displayYear]);

  useEffect(() => {
    document.body.classList.add("time-report-portals-font-12");
    return () => {
      document.body.classList.remove("time-report-portals-font-12");
    };
  }, []);

  /** Avoid infinite “Loading…” if consultant disappears mid-flight or reload helpers reject without clearing state. */
  useEffect(() => {
    if (!consultant) {
      loadStateRef.current = "idle";
      setLoadState("idle");
    }
  }, [consultant]);

  useEffect(() => {
    if (!consultant || viewMode !== "week") return;

    loadStateRef.current = "loading";
    setLoadState("loading");
    // Clear old week view immediately to avoid showing stale rows during week switch.
    setCustomerGroups([]);
    const requestId = ++weekLoadRequestIdRef.current;
    promiseWithTimeout(
      getTimeReportEntries(consultant.id, year, week),
      TIME_REPORT_FETCH_TIMEOUT_MS,
      `Week load ${year}-W${week}`
    )
      .then((data) => {
        if (requestId !== weekLoadRequestIdRef.current) return;
        const sliceKey = weekSliceKey(year, week);
        setCustomerGroups(data.groups);
        weekRevisionRef.current = data.revision;
        syncWeekRevisionAfterSave(setWeekRevisionsByKey, weekRevisionsByKeyRef, sliceKey, data.revision);
        setLoadState("loaded");
        setIsDirty(false);
        clearDirtyWeekSliceKeys();
        savePausedForRevisionConflictRef.current = false;
        setRevisionConflictOpen(false);
        void runBatchHydrate(data.groups);
      })
      .catch(() => {
        if (requestId !== weekLoadRequestIdRef.current) return;
        setLoadState("loaded");
      });
  }, [consultant?.id, year, week, runBatchHydrate, viewMode, clearDirtyWeekSliceKeys]);

  useEffect(() => {
    if (!consultant || viewMode !== "month") return;

    loadStateRef.current = "loading";
    setLoadState("loading");
    setSaveError(null);
    setMonthMergedRows([]);
    clearDirtyWeekSliceKeys();
    const weeks = getWeeksInMonthLocal(displayMonth, displayYear);
    const requestId = ++monthLoadRequestIdRef.current;
    const calDates = getCalendarDatesInMonth(displayYear, displayMonth);
    const cid = consultant.id;
    let cancelled = false;

    void (async () => {
      try {
        const allData = await fetchTimeReportWeeksSequentialUnlessAborted(
          cid,
          weeks,
          `Month load ${displayYear}-${String(displayMonth).padStart(2, "0")}`,
          () => cancelled || requestId !== monthLoadRequestIdRef.current,
          { year: displayYear, month: displayMonth }
        );
        if (allData === null || cancelled || requestId !== monthLoadRequestIdRef.current) return;
        const slices: Record<string, CustomerGroup[]> = {};
        const revMap: Record<string, number> = {};
        weeks.forEach(({ year: y, week: w }, i) => {
          const payload = allData[i];
          const key = weekSliceKey(y, w);
          slices[key] = payload?.groups ?? [];
          revMap[key] = payload?.revision ?? 0;
        });
        weekRevisionsByKeyRef.current = { ...weekRevisionsByKeyRef.current, ...revMap };
        setWeekRevisionsByKey((prev) => ({ ...prev, ...revMap }));
        const mergedRows = buildMergedMonthRows(slices, weeks, calDates, customerById);
        setMonthMergedRows(mergedRows);
        loadStateRef.current = "loaded";
        setLoadState("loaded");
        setIsDirty(false);
        clearDirtyWeekSliceKeys();
        savePausedForRevisionConflictRef.current = false;
        setRevisionConflictOpen(false);
        void runBatchHydrate(pseudoCustomerGroupsForHydrate(mergedRows));
      } catch {
        if (cancelled || requestId !== monthLoadRequestIdRef.current) return;
        loadStateRef.current = "loaded";
        setLoadState("loaded");
        setSaveError(
          "Kunde inte ladda tidrapporten (timeout eller serverfel). Välj månad igen eller uppdatera sidan."
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    consultant?.id,
    viewMode,
    displayMonth,
    displayYear,
    runBatchHydrate,
    customerById,
    clearDirtyWeekSliceKeys,
  ]);

  useEffect(() => {
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = null;
    }
    if (!isDirty || !consultant) return;
    if (savePausedForRevisionConflictRef.current) return;

    // Debounce autosave to avoid one request per keystroke.
    saveDebounceRef.current = setTimeout(() => {
      const saveStart = performance.now();
      const requestId = ++saveRequestIdRef.current;
      saveStateRef.current = "saving";
      setSaveState("saving");
      setSaveError(null);
      const cid = consultant.id;
      const mode = viewModeRef.current;

      const finishOk = () => {
        if (requestId !== saveRequestIdRef.current) return;
        saveStateRef.current = "idle";
        setSaveState("idle");
        setIsDirty(false);
        isDirtyRef.current = false;
        clearDirtyWeekSliceKeys();
        setShowValidationHighlights(false);
      };
      const finishErr = (msg: string, validation?: boolean) => {
        if (requestId !== saveRequestIdRef.current) return;
        setSaveError(msg);
        saveStateRef.current = "error";
        setSaveState("error");
        if (validation && msg.includes("Project and Role")) {
          setShowValidationHighlights(true);
        }
      };

      if (mode === "week") {
        void enqueueTimeReportSave(async () => {
          try {
            const result = await promiseWithTimeout(
              saveTimeReportEntries(
                cid,
                yearRef.current,
                weekRef.current,
                customerGroupsRef.current,
                weekRevisionRef.current,
                null,
                Array.from(
                  deletedLineIdsByWeekRef.current[
                    weekSliceKey(yearRef.current, weekRef.current)
                  ] ?? []
                )
              ),
              SAVE_SERVER_ACTION_TIMEOUT_MS,
              `autosave week ${yearRef.current}-W${weekRef.current}`
            );
            if (!result.success) {
              if (requestId !== saveRequestIdRef.current) return;
              if (result.code === "revision_conflict") {
                savePausedForRevisionConflictRef.current = true;
                setRevisionConflictOpen(true);
                saveStateRef.current = "idle";
                setSaveState("idle");
                return;
              }
              finishErr(result.error, true);
              return;
            }
            const sk = weekSliceKey(yearRef.current, weekRef.current);
            // Keep local revision in sync even if a newer request is queued.
            // Otherwise server revision may advance while client map stays stale,
            // which triggers false "changed elsewhere" prompts.
            weekRevisionRef.current = result.revision;
            syncWeekRevisionAfterSave(setWeekRevisionsByKey, weekRevisionsByKeyRef, sk, result.revision);
            lastLocalSaveAtRef.current = Date.now();
            delete deletedLineIdsByWeekRef.current[sk];
            if (requestId !== saveRequestIdRef.current) return;
            finishOk();
            if (ENABLE_PERF_DEBUG) {
              fetch("http://127.0.0.1:7377/ingest/142286f1-190a-49b6-8e1e-854ceb792769", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Debug-Session-Id": "97edeb",
                },
                body: JSON.stringify({
                  sessionId: "97edeb",
                  runId: "perf-scan-1",
                  hypothesisId: "H3",
                  location: "TimeReportPageClient.tsx:autosave-week",
                  message: "time report autosave result",
                  data: {
                    ms: Math.round((performance.now() - saveStart) * 100) / 100,
                    week: weekRef.current,
                    year: yearRef.current,
                    groups: customerGroupsRef.current.length,
                    error: null,
                  },
                  timestamp: Date.now(),
                }),
              }).catch(() => {});
            }
          } catch {
            if (requestId !== saveRequestIdRef.current) return;
            saveStateRef.current = "error";
            setSaveState("error");
            setSaveError("Save failed");
          }
        });
        return;
      }

      void enqueueTimeReportSave(async () => {
        try {
          const weeks = getMonthWeeksToSave();
          const monthScope = {
            year: displayYearRef.current,
            month: displayMonthRef.current,
          };
          for (const { year: y, week: w } of weeks) {
            const sk = weekSliceKey(y, w);
            const expected = weekRevisionsByKeyRef.current[sk] ?? 0;
            const groups = buildCustomerGroupsForWeekFromMerged(monthMergedRowsRef.current, y, w);
            if (hasAmbiguousLineIdentity(groups)) {
              finishErr("Ambiguous row identity detected. Reload before saving.");
              return;
            }
            const result = await promiseWithTimeout(
              saveTimeReportEntries(
                cid,
                y,
                w,
                groups,
                expected,
                monthScope,
                Array.from(deletedLineIdsByWeekRef.current[sk] ?? [])
              ),
              SAVE_SERVER_ACTION_TIMEOUT_MS,
              `autosave month ${monthScope.year}-${monthScope.month} ${y}-W${w}`
            );
            if (!result.success) {
              if (requestId !== saveRequestIdRef.current) return;
              if (result.code === "revision_conflict") {
                savePausedForRevisionConflictRef.current = true;
                setRevisionConflictOpen(true);
                saveStateRef.current = "idle";
                setSaveState("idle");
                return;
              }
              finishErr(result.error, true);
              return;
            }
            // Keep revision map current even for non-latest queued saves.
            syncWeekRevisionAfterSave(setWeekRevisionsByKey, weekRevisionsByKeyRef, sk, result.revision);
            lastLocalSaveAtRef.current = Date.now();
            delete deletedLineIdsByWeekRef.current[sk];
            if (requestId !== saveRequestIdRef.current) return;
          }
          finishOk();
          if (ENABLE_PERF_DEBUG) {
            fetch("http://127.0.0.1:7377/ingest/142286f1-190a-49b6-8e1e-854ceb792769", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Debug-Session-Id": "97edeb",
              },
              body: JSON.stringify({
                sessionId: "97edeb",
                runId: "perf-scan-1",
                hypothesisId: "H3",
                location: "TimeReportPageClient.tsx:autosave-month",
                message: "time report month autosave done",
                data: {
                  ms: Math.round((performance.now() - saveStart) * 100) / 100,
                  weeks: weeks.length,
                },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
          }
        } catch {
          if (requestId !== saveRequestIdRef.current) return;
          saveStateRef.current = "error";
          setSaveState("error");
          setSaveError("Save failed");
        }
      });
    }, 700);

    return () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
    };
  }, [
    isDirty,
    customerGroups,
    monthMergedRows,
    viewMode,
    year,
    week,
    consultant?.id,
    displayMonth,
    displayYear,
    enqueueTimeReportSave,
    getMonthWeeksToSave,
    clearDirtyWeekSliceKeys,
  ]);

  useEffect(() => {
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const handleClick = (e: MouseEvent) => {
      const link = (e.target as Element).closest("a[href]");
      if (!link) return;
      const href = (link as HTMLAnchorElement).getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      const isInternal = href.startsWith("/") || (typeof window !== "undefined" && new URL(href, window.location.origin).origin === window.location.origin);
      if (!isInternal) return;
      const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
      const linkPath = href.startsWith("/") ? href : new URL(href, window.location.origin).pathname;
      if (linkPath === currentPath) return;
      e.preventDefault();
      e.stopPropagation();
      if (window.confirm("You have unsaved changes. Leave this page?")) {
        const path = href.startsWith("/") ? href : new URL(href, window.location.origin).pathname;
        router.push(path);
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty, router]);

  const flushSave = useCallback(async (): Promise<boolean> => {
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = null;
    }

    const activeConsultant = consultantRef.current;
    if (!isDirtyRef.current || !activeConsultant) return true;

    return enqueueTimeReportSave(async (): Promise<boolean> => {
      const requestId = ++saveRequestIdRef.current;
      saveStateRef.current = "saving";
      setSaveState("saving");
      setSaveError(null);

      if (typeof document !== "undefined") {
        const activeElement = document.activeElement as HTMLElement | null;
        if (activeElement && typeof activeElement.blur === "function") {
          activeElement.blur();
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      try {
        if (viewModeRef.current === "week") {
          const result = await promiseWithTimeout(
            saveTimeReportEntries(
              activeConsultant.id,
              yearRef.current,
              weekRef.current,
              customerGroupsRef.current,
              weekRevisionRef.current,
              null,
              Array.from(
                deletedLineIdsByWeekRef.current[
                  weekSliceKey(yearRef.current, weekRef.current)
                ] ?? []
              )
            ),
            SAVE_SERVER_ACTION_TIMEOUT_MS,
            `flush week ${yearRef.current}-W${weekRef.current}`
          );
          if (requestId !== saveRequestIdRef.current) return false;
          if (!result.success) {
            if (result.code === "revision_conflict") {
              savePausedForRevisionConflictRef.current = true;
              setRevisionConflictOpen(true);
              saveStateRef.current = "idle";
              setSaveState("idle");
              return false;
            }
            setSaveError(result.error);
            saveStateRef.current = "error";
            setSaveState("error");
            if (result.error.includes("Project and Role")) {
              setShowValidationHighlights(true);
            }
            return false;
          }
          const sk = weekSliceKey(yearRef.current, weekRef.current);
          weekRevisionRef.current = result.revision;
          syncWeekRevisionAfterSave(setWeekRevisionsByKey, weekRevisionsByKeyRef, sk, result.revision);
          lastLocalSaveAtRef.current = Date.now();
          delete deletedLineIdsByWeekRef.current[sk];
        } else {
          const weeks = getMonthWeeksToSave();
          const monthScope = {
            year: displayYearRef.current,
            month: displayMonthRef.current,
          };
          for (const { year: y, week: w } of weeks) {
            const sk = weekSliceKey(y, w);
            const expected = weekRevisionsByKeyRef.current[sk] ?? 0;
            const groups = buildCustomerGroupsForWeekFromMerged(monthMergedRowsRef.current, y, w);
            if (hasAmbiguousLineIdentity(groups)) {
              setSaveError("Ambiguous row identity detected. Reload before saving.");
              saveStateRef.current = "error";
              setSaveState("error");
              return false;
            }
            const result = await promiseWithTimeout(
              saveTimeReportEntries(
                activeConsultant.id,
                y,
                w,
                groups,
                expected,
                monthScope,
                Array.from(deletedLineIdsByWeekRef.current[sk] ?? [])
              ),
              SAVE_SERVER_ACTION_TIMEOUT_MS,
              `flush month ${monthScope.year}-${monthScope.month} ${y}-W${w}`
            );
            if (requestId !== saveRequestIdRef.current) return false;
            if (!result.success) {
              if (result.code === "revision_conflict") {
                savePausedForRevisionConflictRef.current = true;
                setRevisionConflictOpen(true);
                saveStateRef.current = "idle";
                setSaveState("idle");
                return false;
              }
              setSaveError(result.error);
              saveStateRef.current = "error";
              setSaveState("error");
              if (result.error.includes("Project and Role")) {
                setShowValidationHighlights(true);
              }
              return false;
            }
            syncWeekRevisionAfterSave(setWeekRevisionsByKey, weekRevisionsByKeyRef, sk, result.revision);
            lastLocalSaveAtRef.current = Date.now();
            delete deletedLineIdsByWeekRef.current[sk];
          }
        }
        if (requestId !== saveRequestIdRef.current) return false;
        saveStateRef.current = "idle";
        setSaveState("idle");
        setIsDirty(false);
        isDirtyRef.current = false;
        clearDirtyWeekSliceKeys();
        setShowValidationHighlights(false);
        return true;
      } catch {
        if (requestId !== saveRequestIdRef.current) return false;
        saveStateRef.current = "error";
        setSaveState("error");
        setSaveError("Save failed");
        return false;
      }
    });
  }, [enqueueTimeReportSave, getMonthWeeksToSave, clearDirtyWeekSliceKeys]);

  useEffect(() => {
    const onPageHide = () => {
      if (!isDirtyRef.current) return;
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
      void flushSave();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [flushSave]);

  const reloadWeekFromServer = useCallback(() => {
    const c = consultantRef.current;
    if (!c || viewModeRef.current !== "week") return;
    const y = yearRef.current;
    const w = weekRef.current;
    const requestId = ++weekLoadRequestIdRef.current;
    loadStateRef.current = "loading";
    setLoadState("loading");
    void promiseWithTimeout(getTimeReportEntries(c.id, y, w), TIME_REPORT_FETCH_TIMEOUT_MS, `Reload week ${y}-W${w}`)
      .then((data) => {
        if (requestId !== weekLoadRequestIdRef.current) return;
        const sliceKey = weekSliceKey(y, w);
        setCustomerGroups(data.groups);
        weekRevisionRef.current = data.revision;
        syncWeekRevisionAfterSave(setWeekRevisionsByKey, weekRevisionsByKeyRef, sliceKey, data.revision);
        delete deletedLineIdsByWeekRef.current[sliceKey];
        setLoadState("loaded");
        setIsDirty(false);
        isDirtyRef.current = false;
        clearDirtyWeekSliceKeys();
        savePausedForRevisionConflictRef.current = false;
        setRevisionConflictOpen(false);
        void runBatchHydrate(data.groups);
      })
      .catch(() => {
        if (requestId !== weekLoadRequestIdRef.current) return;
        loadStateRef.current = "loaded";
        setLoadState("loaded");
      });
  }, [runBatchHydrate, clearDirtyWeekSliceKeys]);

  const reloadMonthFromServer = useCallback(() => {
    const c = consultantRef.current;
    if (!c || viewModeRef.current !== "month") return;
    const weeks = getWeeksInMonthLocal(displayMonthRef.current, displayYearRef.current);
    const calDates = getCalendarDatesInMonth(displayYearRef.current, displayMonthRef.current);
    const requestId = ++monthLoadRequestIdRef.current;
    loadStateRef.current = "loading";
    setLoadState("loading");
    void (async () => {
      try {
        const allData = await fetchTimeReportWeeksSequentialUnlessAborted(
          c.id,
          weeks,
          `Reload month ${displayYearRef.current}-${String(displayMonthRef.current).padStart(2, "0")}`,
          () => requestId !== monthLoadRequestIdRef.current,
          { year: displayYearRef.current, month: displayMonthRef.current }
        );
        if (allData === null || requestId !== monthLoadRequestIdRef.current) return;
        const slices: Record<string, CustomerGroup[]> = {};
        const revMap: Record<string, number> = {};
        weeks.forEach(({ year: y, week: w }, i) => {
          const payload = allData[i];
          const key = weekSliceKey(y, w);
          slices[key] = payload?.groups ?? [];
          revMap[key] = payload?.revision ?? 0;
          delete deletedLineIdsByWeekRef.current[key];
        });
        weekRevisionsByKeyRef.current = { ...weekRevisionsByKeyRef.current, ...revMap };
        setWeekRevisionsByKey((prev) => ({ ...prev, ...revMap }));
        const mergedRows = buildMergedMonthRows(slices, weeks, calDates, customerById);
        setMonthMergedRows(mergedRows);
        loadStateRef.current = "loaded";
        setLoadState("loaded");
        setIsDirty(false);
        isDirtyRef.current = false;
        clearDirtyWeekSliceKeys();
        savePausedForRevisionConflictRef.current = false;
        setRevisionConflictOpen(false);
        void runBatchHydrate(pseudoCustomerGroupsForHydrate(mergedRows));
      } catch {
        if (requestId !== monthLoadRequestIdRef.current) return;
        loadStateRef.current = "loaded";
        setLoadState("loaded");
        setSaveError(
          "Kunde inte ladda om tidrapporten (timeout eller serverfel). Välj månad igen eller uppdatera sidan."
        );
      }
    })();
  }, [runBatchHydrate, customerById, clearDirtyWeekSliceKeys]);

  useEffect(() => {
    const checkStaleRevision = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastVisibilityRevalidateAtRef.current < 2500) return;
      lastVisibilityRevalidateAtRef.current = now;
      if (now - lastLocalSaveAtRef.current < 3500) return;
      if (saveStateRef.current === "saving") return;
      // Avoid false positives while month/week slices fetch — client rev map may not match yet.
      if (loadStateRef.current === "loading") return;
      const c = consultantRef.current;
      if (!c) return;
      if (viewModeRef.current === "week") {
        void getTimeReportWeekRevision(c.id, yearRef.current, weekRef.current).then((rev) => {
          if (rev == null) return;
          if (rev !== weekRevisionRef.current) {
            if (isDirtyRef.current) {
              savePausedForRevisionConflictRef.current = true;
              setRevisionConflictOpen(true);
            } else {
              reloadWeekFromServer();
            }
          }
        });
      } else {
        const weeks = getWeeksInMonthLocal(displayMonthRef.current, displayYearRef.current);
        void getTimeReportWeekRevisions(c.id, weeks).then((revs) => {
          let mismatch = false;
          for (const w of weeks) {
            const k = weekSliceKey(w.year, w.week);
            if ((revs[k] ?? 0) !== (weekRevisionsByKeyRef.current[k] ?? 0)) {
              mismatch = true;
              break;
            }
          }
          if (!mismatch) return;
          if (isDirtyRef.current) {
            savePausedForRevisionConflictRef.current = true;
            setRevisionConflictOpen(true);
          } else {
            reloadMonthFromServer();
          }
        });
      }
    };
    document.addEventListener("visibilitychange", checkStaleRevision);
    window.addEventListener("focus", checkStaleRevision);
    return () => {
      document.removeEventListener("visibilitychange", checkStaleRevision);
      window.removeEventListener("focus", checkStaleRevision);
    };
  }, [reloadWeekFromServer, reloadMonthFromServer]);

  const weekDates = useMemo(() => getWeekDates(year, week), [year, week]);
  const todayStr = useMemo(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;
  }, []);
  const isTodayColumn = useCallback(
    (dayIndex: number) => weekDates[dayIndex] === todayStr,
    [weekDates, todayStr]
  );

  const holidayDateSet = useMemo(() => new Set(holidayDates), [holidayDates]);
  const isDayGrayed = useCallback(
    (dayIndex: number) => {
      const isWeekend = dayIndex === 5 || dayIndex === 6;
      const isHoliday = holidayDateSet.has(weekDates[dayIndex]!);
      return isWeekend || isHoliday;
    },
    [holidayDateSet, weekDates]
  );

  const isMonthDateGrayed = useCallback(
    (dateStr: string) => {
      const d = new Date(dateStr + "T12:00:00");
      const dow = d.getDay();
      const isWeekend = dow === 0 || dow === 6;
      return isWeekend || holidayDateSet.has(dateStr);
    },
    [holidayDateSet]
  );
  const isMonthDateToday = useCallback(
    (dateStr: string) => dateStr === todayStr,
    [todayStr]
  );

  const isWeekDayWeekend = useCallback((dayIndex: number) => dayIndex === 5 || dayIndex === 6, []);
  const isMonthDateWeekend = useCallback((dateStr: string) => {
    const dow = new Date(dateStr + "T12:00:00").getDay();
    return dow === 0 || dow === 6;
  }, []);

  /** Cell-only: weekend columns a bit stronger than weekday public holidays (headers stay uniform). */
  const dayCellWeekendGrayClass = "bg-bg-muted/60";
  const dayCellHolidayWeekdayGrayClass = "bg-bg-muted/51";
  const dayHeaderGrayClass = "bg-bg-muted/40 text-text-muted";
  const todayColumnClass = "time-report-today-cell";
  const todayHeaderClass = "time-report-today-header";

  const applyCalendarMonth = useCallback((newYear: number, newMonth: number) => {
    setDisplayYear(newYear);
    setDisplayMonth(newMonth);
    const weeks = getWeeksInMonthLocal(newMonth, newYear);
    if (weeks.length > 0) {
      setYear(weeks[0].year);
      setWeek(weeks[0].week);
    }
  }, []);

  const runWeekStripMonthTransition = (direction: "prev" | "next", apply: () => void) => {
    setIsWeekStripTransitioning(true);
    setWeekStripAnimClass(
      direction === "prev" ? "animate-week-strip-out-to-right" : "animate-week-strip-out-to-left"
    );
    window.setTimeout(() => {
      apply();
      setWeekStripAnimClass(
        direction === "prev"
          ? "animate-week-strip-in-from-left"
          : "animate-week-strip-in-from-right"
      );
      window.setTimeout(() => {
        setWeekStripAnimClass("");
        setIsWeekStripTransitioning(false);
      }, 320);
    }, 280);
  };

  const stepWeek = async (delta: -1 | 1) => {
    if (isWeekStripTransitioning) return;
    const ok = await flushSave();
    if (!ok) return;
    const next = addWeeksToYearWeekLocal(year, week, delta);
    const nextDisplay = displayMonthForWeekNavigation(
      displayYear,
      displayMonth,
      next.year,
      next.week
    );
    const monthChanged =
      nextDisplay.year !== displayYear || nextDisplay.month !== displayMonth;
    const apply = () => {
      setYear(next.year);
      setWeek(next.week);
      setDisplayYear(nextDisplay.year);
      setDisplayMonth(nextDisplay.month);
    };
    if (monthChanged) {
      runWeekStripMonthTransition(delta < 0 ? "prev" : "next", apply);
    } else {
      apply();
    }
  };

  const goPrevMonth = async () => {
    if (viewMode === "week") {
      await stepWeek(-1);
      return;
    }
    if (isWeekStripTransitioning) return;
    const ok = await flushSave();
    if (!ok) return;
    let newMonth = displayMonth - 1;
    let newYear = displayYear;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    applyCalendarMonth(newYear, newMonth);
  };

  const goNextMonth = async () => {
    if (viewMode === "week") {
      await stepWeek(1);
      return;
    }
    if (isWeekStripTransitioning) return;
    const ok = await flushSave();
    if (!ok) return;
    let newMonth = displayMonth + 1;
    let newYear = displayYear;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    applyCalendarMonth(newYear, newMonth);
  };

  const jumpToWeek = useCallback(
    async (nextYear: number, nextWeek: number) => {
      if (nextYear === year && nextWeek === week) return;
      const ok = await flushSave();
      if (!ok) return;
      setYear(nextYear);
      setWeek(nextWeek);
    },
    [flushSave, week, year]
  );

  const goToCurrentWeek = useCallback(async () => {
    if (isWeekStripTransitioning) return;
    const now = new Date();
    const { year: currentY, week: currentW } = getYearWeekForDateLocal(now);
    const currentCalYear = now.getFullYear();
    const currentCalMonth = now.getMonth() + 1;
    if (
      year === currentY &&
      week === currentW &&
      displayYear === currentCalYear &&
      displayMonth === currentCalMonth
    ) {
      return;
    }
    const ok = await flushSave();
    if (!ok) return;
    setDisplayYear(currentCalYear);
    setDisplayMonth(currentCalMonth);
    setYear(currentY);
    setWeek(currentW);
  }, [
    displayMonth,
    displayYear,
    flushSave,
    isWeekStripTransitioning,
    week,
    year,
  ]);

  const onPickCalendarMonth = useCallback(
    async (ym: string) => {
      if (isWeekStripTransitioning) return;
      const parts = ym.split("-");
      const newYear = parseInt(parts[0]!, 10);
      const newMonth = parseInt(parts[1]!, 10);
      if (!Number.isFinite(newYear) || !Number.isFinite(newMonth)) return;
      if (newYear === displayYear && newMonth === displayMonth) return;
      const ok = await flushSave();
      if (!ok) return;
      applyCalendarMonth(newYear, newMonth);
    },
    [
      applyCalendarMonth,
      displayMonth,
      displayYear,
      flushSave,
      isWeekStripTransitioning,
    ]
  );

  const switchToMonthView = useCallback(async () => {
    if (viewMode === "month") return;
    const ok = await flushSave();
    if (!ok) return;
    setViewMode("month");
  }, [flushSave, viewMode]);

  const switchToWeekView = useCallback(async () => {
    if (viewMode === "week") return;
    const ok = await flushSave();
    if (!ok) return;
    setViewMode("week");
  }, [flushSave, viewMode]);

  const customerOptionsForSelect = [
    { value: "", label: "—" },
    ...customers.map((c) => ({ value: c.id, label: c.name })),
  ];

  const availableToAdd = customers.filter((c) => {
    if (viewMode === "week") {
      return !customerGroups.some((g) => g.customerId === c.id);
    }
    return !monthMergedRows.some((r) => r.customerId === c.id);
  });
  const entryById = useMemo(() => {
    const map = new Map<string, Entry>();
    if (viewMode === "week") {
      customerGroups.forEach((g) => {
        g.entries.forEach((e) => map.set(e.id, e));
      });
    } else {
      for (const r of monthMergedRows) {
        map.set(r.rowKey, {
          id: r.lineId,
          displayOrder: r.displayOrder,
          projectId: r.projectId,
          roleId: r.roleId,
          jiraDevOpsValue: r.jiraDevOpsValue,
          task: r.task,
          hours: [0, 0, 0, 0, 0, 0, 0],
          comments: {},
        });
      }
    }
    return map;
  }, [viewMode, customerGroups, monthMergedRows]);
  const customerIdByEntryId = useMemo(() => {
    const map = new Map<string, string>();
    if (viewMode === "week") {
      customerGroups.forEach((g) => {
        g.entries.forEach((e) => map.set(e.id, g.customerId));
      });
    } else {
      for (const r of monthMergedRows) {
        map.set(r.rowKey, r.customerId);
      }
    }
    return map;
  }, [viewMode, customerGroups, monthMergedRows]);
  const jiraOptionByProjectAndValue = useMemo(() => {
    const map = new Map<string, JiraDevOpsOption>();
    Object.entries(jiraDevOpsCache).forEach(([projectId, options]) => {
      options.forEach((option) => map.set(`${projectId}|${option.value}`, option));
    });
    return map;
  }, [jiraDevOpsCache]);
  const workOptionByValue = useMemo(() => {
    const map = new Map<string, JiraDevOpsOption>();
    Object.values(workIssueCache).forEach((options) => {
      options.forEach((option) => {
        map.set(workIssueLinkKey(option.value), {
          value: workIssueLinkKey(option.value),
          label: option.label,
          url: option.url,
          description: option.label,
        });
      });
    });
    return map;
  }, [workIssueCache]);

  const loadProjectsForCustomer = useCallback(async (customerId: string) => {
    if (!customerId) return;
    if (projectCache[customerId] !== undefined) return;
    if (projectLoadInflightRef.current.has(customerId)) return;
    projectLoadInflightRef.current.add(customerId);
    setProjectOptionsLoading((s) => ({ ...s, [customerId]: true }));
    try {
      const list = await getActiveProjectsForCustomer(customerId);
      setProjectCache((prev) =>
        prev[customerId] !== undefined ? prev : { ...prev, [customerId]: list }
      );
    } finally {
      projectLoadInflightRef.current.delete(customerId);
      setProjectOptionsLoading((s) => {
        const next = { ...s };
        delete next[customerId];
        return next;
      });
    }
  }, [projectCache]);

  const loadTaskOptions = useCallback(async (customerId: string, projectId: string) => {
    const key = taskCacheKey(customerId, projectId);
    if (!customerId) return;
    if (taskCache[key] !== undefined) return;
    if (taskLoadInflightRef.current.has(key)) return;
    taskLoadInflightRef.current.add(key);
    setTaskOptionsLoading((s) => ({ ...s, [key]: true }));
    try {
      const list = await getTaskOptionsForCustomerAndProject(customerId, projectId || undefined);
      setTaskCache((prev) => (prev[key] !== undefined ? prev : { ...prev, [key]: list }));
    } finally {
      taskLoadInflightRef.current.delete(key);
      setTaskOptionsLoading((s) => {
        const next = { ...s };
        delete next[key];
        return next;
      });
    }
  }, [taskCache]);

  const loadJiraDevOpsForProject = useCallback(async (
    projectId: string,
    options?: { force?: boolean }
  ) => {
    if (!projectId) return;
    if (!options?.force && jiraDevOpsCache[projectId] !== undefined) return;
    if (jiraLoadInflightRef.current.has(projectId)) return;
    jiraLoadInflightRef.current.add(projectId);
    setJiraOptionsLoading((s) => ({ ...s, [projectId]: true }));
    try {
      const list = await getJiraDevOpsOptionsForProject(projectId);
      setJiraDevOpsCache((prev) =>
        !options?.force && prev[projectId] !== undefined
          ? prev
          : { ...prev, [projectId]: list }
      );
    } finally {
      jiraLoadInflightRef.current.delete(projectId);
      setJiraOptionsLoading((s) => {
        const next = { ...s };
        delete next[projectId];
        return next;
      });
    }
  }, [jiraDevOpsCache]);

  const getProjectOptions = (customerId: string): { value: string; label: string }[] => {
    if (!customerId) return [{ value: "", label: "—" }];
    const list = projectCache[customerId];
    if (list === undefined) return [{ value: "", label: "—" }];
    return [{ value: "", label: "—" }, ...list];
  };

  const getTaskOptions = (customerId: string, projectId: string): { value: string; label: string }[] => {
    if (!customerId) return [{ value: "", label: "—" }];
    const key = taskCacheKey(customerId, projectId);
    const list = taskCache[key];
    if (list === undefined) return [{ value: "", label: "—" }];
    return [{ value: "", label: "—" }, ...list];
  };

  const loadWorkIssuesForCustomer = useCallback(async (
    customerId: string,
    extraIssueIds: string[] = []
  ) => {
    if (!customerId) return;
    const cached = workIssueCache[customerId];
    if (cached !== undefined) {
      const have = new Set(cached.map((option) => option.value));
      if (extraIssueIds.every((id) => !id || have.has(id))) return;
    }
    if (workIssueLoadInflightRef.current.has(customerId)) return;
    workIssueLoadInflightRef.current.add(customerId);
    setWorkIssueOptionsLoading((s) => ({ ...s, [customerId]: true }));
    try {
      const list = await getWorkIssueOptionsForCustomer(customerId, extraIssueIds);
      setWorkIssueCache((prev) => ({ ...prev, [customerId]: list }));
    } finally {
      workIssueLoadInflightRef.current.delete(customerId);
      setWorkIssueOptionsLoading((s) => {
        const next = { ...s };
        delete next[customerId];
        return next;
      });
    }
  }, [workIssueCache]);

  const getJiraDevOpsOptions = (
    customerId: string,
    projectId: string
  ): { value: string; label: string; url?: string | null }[] => {
    const work = (workIssueCache[customerId] ?? []).map((option) => ({
      value: workIssueLinkKey(option.value),
      label: option.label,
      url: option.url,
    }));
    const jira = projectId ? (jiraDevOpsCache[projectId] ?? []) : [];
    return [{ value: "", label: "—" }, ...work, ...jira];
  };

  const resolveLinkOption = (
    projectId: string,
    value: string
  ): JiraDevOpsOption | undefined => {
    if (!value) return undefined;
    return (
      workOptionByValue.get(value) ??
      (projectId
        ? jiraOptionByProjectAndValue.get(`${projectId}|${value}`)
        : undefined)
    );
  };

  useEffect(() => {
    const projectIds = new Set<string>();
    if (viewMode === "week") {
      for (const group of customerGroups) {
        for (const entry of group.entries) {
          if (entry.projectId && entry.jiraDevOpsValue) projectIds.add(entry.projectId);
        }
      }
    } else {
      for (const row of monthMergedRows) {
        if (row.projectId && row.jiraDevOpsValue) projectIds.add(row.projectId);
      }
    }
    for (const projectId of projectIds) {
      void loadJiraDevOpsForProject(projectId);
    }
  }, [viewMode, customerGroups, monthMergedRows, loadJiraDevOpsForProject]);

  useEffect(() => {
    const extraByCustomer = new Map<string, string[]>();
    if (viewMode === "week") {
      for (const group of customerGroups) {
        extraByCustomer.set(
          group.customerId,
          collectWorkIssueIdsFromLinkKeys(group.entries.map((entry) => entry.jiraDevOpsValue))
        );
      }
    } else {
      for (const row of monthMergedRows) {
        const extras = extraByCustomer.get(row.customerId) ?? [];
        extras.push(...collectWorkIssueIdsFromLinkKeys([row.jiraDevOpsValue]));
        extraByCustomer.set(row.customerId, extras);
      }
    }
    for (const [customerId, extras] of extraByCustomer) {
      void loadWorkIssuesForCustomer(customerId, extras);
    }
  }, [viewMode, customerGroups, monthMergedRows, loadWorkIssuesForCustomer]);

  const updateEntryInGroup = (customerId: string, entryId: string, patch: Partial<Entry>) => {
    if (viewMode === "week") {
      markDirty();
      setCustomerGroups((prev) =>
        prev.map((g) =>
          g.customerId !== customerId
            ? g
            : {
                ...g,
                entries: g.entries.map((e) =>
                  e.id !== entryId ? e : { ...e, ...patch }
                ),
              }
        )
      );
      return;
    }
    const monthWeeks = getWeeksInMonthLocal(displayMonthRef.current, displayYearRef.current);
    const row = monthMergedRowsRef.current.find(
      (r) => r.customerId === customerId && r.rowKey === entryId
    );
    markDirty(row ? weekSliceKeysForMergedRow(row, monthWeeks) : undefined);
    setMonthMergedRows((prev) =>
      prev.map((r) => {
        if (r.customerId !== customerId || r.rowKey !== entryId) return r;
        const next = { ...r };
        if (patch.projectId !== undefined) next.projectId = patch.projectId;
        if (patch.roleId !== undefined) next.roleId = patch.roleId;
        if (patch.jiraDevOpsValue !== undefined) next.jiraDevOpsValue = patch.jiraDevOpsValue;
        if (patch.task !== undefined) next.task = patch.task ?? "";
        return next;
      })
    );
  };

  const addCustomerGroup = (customerId: string) => {
    if (viewMode === "week") {
      if (customerGroups.some((g) => g.customerId === customerId)) return;
      markDirty();
      setCustomerGroups((prev) =>
        sortCustomerGroupsByCustomerName(
          [...prev, { customerId, entries: [newEntry()] }],
          customerById
        )
      );
    } else {
      if (monthMergedRows.some((r) => r.customerId === customerId)) return;
      markDirtyEntireDisplayMonth();
      setMonthMergedRows((prev) =>
        sortMonthMergedRowsByCustomerName(
          [
            ...prev,
            newMonthMergedRow(customerId, getCalendarDatesInMonth(displayYear, displayMonth)),
          ],
          customerById
        )
      );
    }
    setAddCustomerOpen(false);
    const c = customerById.get(customerId);
    if (c) {
      loadProjectsForCustomer(customerId);
      void loadWorkIssuesForCustomer(customerId);
    }
  };

  const refreshAfterCopyToCurrentWeek = useCallback(() => {
    const c = consultantRef.current;
    if (!c) return;
    if (viewModeRef.current === "month") {
      const weeks = getWeeksInMonthLocal(displayMonthRef.current, displayYearRef.current);
      const calDates = getCalendarDatesInMonth(
        displayYearRef.current,
        displayMonthRef.current
      );
      void (async () => {
        try {
          const allData = await fetchTimeReportWeeksSequentialUnlessAborted(
            c.id,
            weeks,
            `Refresh after copy ${displayYearRef.current}-${String(displayMonthRef.current).padStart(2, "0")}`,
            () => false,
            { year: displayYearRef.current, month: displayMonthRef.current }
          );
          if (allData === null) return;
          const slices: Record<string, CustomerGroup[]> = {};
          const revMap: Record<string, number> = {};
          weeks.forEach(({ year: y, week: w }, i) => {
            const payload = allData[i];
            const key = weekSliceKey(y, w);
            slices[key] = payload?.groups ?? [];
            revMap[key] = payload?.revision ?? 0;
          });
          weekRevisionsByKeyRef.current = { ...weekRevisionsByKeyRef.current, ...revMap };
          setWeekRevisionsByKey((prev) => ({ ...prev, ...revMap }));
          const mergedRows = buildMergedMonthRows(slices, weeks, calDates, customerById);
          setMonthMergedRows(mergedRows);
          void runBatchHydrate(pseudoCustomerGroupsForHydrate(mergedRows));
        } catch {
          // Silent: copy already succeeded; user can switch month to retry refresh.
        }
      })();
      return;
    }
    if (yearRef.current === initialYear && weekRef.current === initialWeek) {
      void promiseWithTimeout(
        getTimeReportEntries(c.id, yearRef.current, weekRef.current),
        TIME_REPORT_FETCH_TIMEOUT_MS,
        `Refresh after copy W${yearRef.current}-${weekRef.current}`
      ).then((data) => {
        const sk = weekSliceKey(yearRef.current, weekRef.current);
        setCustomerGroups(data.groups);
        weekRevisionRef.current = data.revision;
        syncWeekRevisionAfterSave(setWeekRevisionsByKey, weekRevisionsByKeyRef, sk, data.revision);
        void runBatchHydrate(data.groups);
      });
    }
  }, [runBatchHydrate, customerById]);

  const getFreshTargetWeekRevision = useCallback(
    async (consultantId: string, y: number, w: number): Promise<number> => {
      const sk = weekSliceKey(y, w);
      const serverRevision = await getTimeReportWeekRevision(consultantId, y, w);
      const revision = Number(serverRevision ?? 0);
      syncWeekRevisionAfterSave(setWeekRevisionsByKey, weekRevisionsByKeyRef, sk, revision);
      return revision;
    },
    []
  );

  const copyEntryToWeekWithRevisionRetry = useCallback(
    async (
      consultantId: string,
      y: number,
      w: number,
      customerId: string,
      payload: {
        lineId?: string;
        lineDisplayOrder?: number;
        projectId: string;
        roleId: string;
        jiraDevOpsValue: string;
        task: string;
        hours: number[];
        comments: Record<number, string>;
        copyHours: boolean;
        rowOnlyAnchorDate?: string;
      }
    ) => {
      const sk = weekSliceKey(y, w);
      let expectedRev =
        weekRevisionsByKeyRef.current[sk] ??
        (await getFreshTargetWeekRevision(consultantId, y, w));

      let result = await copyEntryToWeek(
        consultantId,
        y,
        w,
        customerId,
        payload,
        expectedRev
      );

      if (!result.success && result.code === "revision_conflict") {
        expectedRev =
          result.currentRevision ??
          (await getFreshTargetWeekRevision(consultantId, y, w));
        result = await copyEntryToWeek(
          consultantId,
          y,
          w,
          customerId,
          payload,
          expectedRev
        );
      }

      if (result.success) {
        syncWeekRevisionAfterSave(
          setWeekRevisionsByKey,
          weekRevisionsByKeyRef,
          sk,
          result.revision
        );
      }
      return result;
    },
    [getFreshTargetWeekRevision]
  );

  const buildRevisionMapForWeeks = useCallback(
    async (consultantId: string, weeks: { year: number; week: number }[]) => {
      const rev: Record<string, number> = {};
      for (const { year: y, week: w } of weeks) {
        const sk = weekSliceKey(y, w);
        rev[sk] =
          weekRevisionsByKeyRef.current[sk] ??
          (await getFreshTargetWeekRevision(consultantId, y, w));
      }
      return rev;
    },
    [getFreshTargetWeekRevision]
  );

  const copyTimeReportEntriesBatchWithRevisionRetry = useCallback(
    async (consultantId: string, operations: TimeReportCopyBatchOperation[]) => {
      if (operations.length === 0) {
        return { success: true as const, weekRevisions: {} as Record<string, number> };
      }
      const weeks = dedupeWeeksFromCopyOperations(operations);
      let initialRev = await buildRevisionMapForWeeks(consultantId, weeks);
      let result = await copyTimeReportEntriesBatch(consultantId, operations, initialRev);
      if (!result.success && result.code === "revision_conflict") {
        await Promise.all(
          weeks.map(({ year: y, week: w }) => getFreshTargetWeekRevision(consultantId, y, w))
        );
        initialRev = await buildRevisionMapForWeeks(consultantId, weeks);
        result = await copyTimeReportEntriesBatch(consultantId, operations, initialRev);
      }
      if (result.success) {
        for (const [sk, revision] of Object.entries(result.weekRevisions)) {
          syncWeekRevisionAfterSave(setWeekRevisionsByKey, weekRevisionsByKeyRef, sk, revision);
        }
      }
      return result;
    },
    [buildRevisionMapForWeeks, getFreshTargetWeekRevision]
  );

  const performCopyRowToCurrentWeek = async (
    customerId: string,
    entry: Entry,
    copyHours: boolean
  ) => {
    if (!consultant || !entry.projectId || !entry.roleId) return;
    if (year === initialYear && week === initialWeek) return;
    if (copyHours && !entryHasContent(entry)) return;

    const ok = await flushSave();
    if (!ok) return;
    setCopyRowDialog(null);

    setCopyToWeekState("copying");
    setSaveError(null);
    const targetKey = weekSliceKey(initialYear, initialWeek);
    const result = await copyEntryToWeekWithRevisionRetry(
      consultant.id,
      initialYear,
      initialWeek,
      customerId,
      {
        projectId: entry.projectId,
        roleId: entry.roleId,
        jiraDevOpsValue: entry.jiraDevOpsValue,
        task: entry.task ?? "",
        hours: entry.hours,
        comments: entry.comments,
        copyHours,
        ...(!copyHours
          ? {
              rowOnlyAnchorDate: getWeekDates(initialYear, initialWeek)[0],
            }
          : {}),
      }
    );
    if (!result.success) {
      if (result.code === "revision_conflict") {
        savePausedForRevisionConflictRef.current = true;
        setRevisionConflictOpen(true);
      }
      setCopyToWeekState("error");
      setSaveError(result.error);
      return;
    }
    syncWeekRevisionAfterSave(setWeekRevisionsByKey, weekRevisionsByKeyRef, targetKey, result.revision);
    setCopyToWeekState("idle");
    refreshAfterCopyToCurrentWeek();
  };

  const performCopyMergedRowToNextMonth = async (
    row: MonthMergedRow,
    copyHours: boolean,
    options?: { skipFlush?: boolean; manageCopyState?: boolean }
  ): Promise<boolean> => {
    if (!consultant) return false;
    if (copyHours && (!row.projectId || !row.roleId)) return false;
    if (copyHours && !mergedRowHasContent(row)) return false;

    const skipFlush = options?.skipFlush === true;
    const manageCopyState = options?.manageCopyState !== false;
    if (!skipFlush) {
      const ok = await flushSave();
      if (!ok) return false;
      setCopyRowDialog(null);
    }

    if (manageCopyState) {
      setCopyToNextMonthState("copying");
      setSaveError(null);
    }

    const operations = buildCopyMergedRowToNextMonthOperations(
      row,
      displayYear,
      displayMonth,
      copyHours
    );
    if (operations.length === 0) {
      if (manageCopyState) setCopyToNextMonthState("idle");
      return true;
    }

    const result = await copyTimeReportEntriesBatchWithRevisionRetry(consultant.id, operations);
    if (!result.success) {
      if (result.code === "revision_conflict") {
        savePausedForRevisionConflictRef.current = true;
        setRevisionConflictOpen(true);
      }
      if (manageCopyState) setCopyToNextMonthState("error");
      setSaveError(result.error);
      return false;
    }

    if (manageCopyState) setCopyToNextMonthState("idle");
    return true;
  };

  const performCopyWholeWeekToNextWeek = async (copyHours: boolean) => {
    if (!consultant) return;
    const ok = await flushSave();
    if (!ok) return;
    setCopyRowDialog(null);

    const sourceGroups = customerGroupsRef.current;
    const target = addWeeksToYearWeekLocal(yearRef.current, weekRef.current, 1);
    const targetWeekDates = getWeekDates(target.year, target.week);
    const stubAnchorDate = targetWeekDates[0];
    setCopyToWeekState("copying");
    setSaveError(null);

    for (const group of sourceGroups) {
      for (const entry of group.entries) {
        const includeHoursForThisRow = copyHours && entryHasContent(entry);
        const targetKey = weekSliceKey(target.year, target.week);
        const result = await copyEntryToWeekWithRevisionRetry(
          consultant.id,
          target.year,
          target.week,
          group.customerId,
          {
            projectId: entry.projectId,
            roleId: entry.roleId,
            jiraDevOpsValue: entry.jiraDevOpsValue,
            task: entry.task ?? "",
            hours: entry.hours,
            comments: entry.comments,
            copyHours: includeHoursForThisRow,
            ...(includeHoursForThisRow || stubAnchorDate == null
              ? {}
              : { rowOnlyAnchorDate: stubAnchorDate }),
          }
        );
        if (!result.success) {
          if (result.code === "revision_conflict") {
            savePausedForRevisionConflictRef.current = true;
            setRevisionConflictOpen(true);
          }
          setCopyToWeekState("error");
          setSaveError(result.error);
          return;
        }
        syncWeekRevisionAfterSave(
          setWeekRevisionsByKey,
          weekRevisionsByKeyRef,
          targetKey,
          result.revision
        );
      }
    }

    setCopyToWeekState("idle");
    // Refresh source week if we're currently there.
    if (yearRef.current === target.year && weekRef.current === target.week) {
      refreshAfterCopyToCurrentWeek();
    }
  };

  const performCopyWholeMonthToNextMonth = async (copyHours: boolean) => {
    const rows = monthMergedRowsRef.current;
    if (rows.length === 0) return;

    const ok = await flushSave();
    if (!ok) return;
    setCopyRowDialog(null);
    setCopyToNextMonthState("copying");
    setSaveError(null);

    if (!consultant) {
      setCopyToNextMonthState("idle");
      return;
    }

    const operations: TimeReportCopyBatchOperation[] = [];
    const dy = displayYearRef.current;
    const dm = displayMonthRef.current;
    for (const row of rows) {
      const includeHoursForThisRow = copyHours && mergedRowHasContent(row);
      operations.push(...buildCopyMergedRowToNextMonthOperations(row, dy, dm, includeHoursForThisRow));
    }

    const result = await copyTimeReportEntriesBatchWithRevisionRetry(consultant.id, operations);
    if (!result.success) {
      if (result.code === "revision_conflict") {
        savePausedForRevisionConflictRef.current = true;
        setRevisionConflictOpen(true);
      }
      setCopyToNextMonthState("error");
      setSaveError(result.error);
      return;
    }
    setCopyToNextMonthState("idle");
  };

  const addRow = (customerId: string) => {
    if (viewMode === "week") {
      markDirty();
      setCustomerGroups((prev) =>
        prev.map((g) =>
          g.customerId !== customerId
            ? g
            : { ...g, entries: [...g.entries, newEntry()] }
        )
      );
      return;
    }
    markDirtyEntireDisplayMonth();
    const dates = getCalendarDatesInMonth(displayYear, displayMonth);
    const newRow = newMonthMergedRow(customerId, dates);
    setMonthMergedRows((prev) => {
      let insertAt = prev.length;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i]!.customerId === customerId) {
          insertAt = i + 1;
          break;
        }
      }
      return [...prev.slice(0, insertAt), newRow, ...prev.slice(insertAt)];
    });
  };

  const duplicateRow = (customerId: string, entryId: string) => {
    if (viewMode === "week") {
      markDirty();
      setCustomerGroups((prev) =>
        prev.map((g) => {
          if (g.customerId !== customerId) return g;
          const source = g.entries.find((e) => e.id === entryId);
          if (!source) return g;
          return {
            ...g,
            entries: [
              ...g.entries,
              {
                ...newEntry(),
                projectId: source.projectId,
                roleId: source.roleId,
              },
            ],
          };
        })
      );
      return;
    }

    const monthWeeks = getWeeksInMonthLocal(displayMonth, displayYear);
    const sourceRow = monthMergedRows.find(
      (r) => r.customerId === customerId && r.rowKey === entryId
    );
    markDirty(sourceRow ? weekSliceKeysForMergedRow(sourceRow, monthWeeks) : undefined);
    const dates = getCalendarDatesInMonth(displayYear, displayMonth);
    const duplicate = (source: MonthMergedRow): MonthMergedRow => ({
      ...newMonthMergedRow(customerId, dates),
      projectId: source.projectId,
      roleId: source.roleId,
    });
    setMonthMergedRows((prev) => {
      const index = prev.findIndex((r) => r.customerId === customerId && r.rowKey === entryId);
      if (index === -1) return prev;
      const source = prev[index]!;
      const next = duplicate(source);
      return [...prev.slice(0, index + 1), next, ...prev.slice(index + 1)];
    });
  };

  const markDeletedLineIds = (lineIds: string[]) => {
    if (lineIds.length === 0) return;
    if (viewMode === "week") {
      const sk = weekSliceKey(yearRef.current, weekRef.current);
      const cur = deletedLineIdsByWeekRef.current[sk] ?? new Set<string>();
      for (const id of lineIds) cur.add(id);
      deletedLineIdsByWeekRef.current[sk] = cur;
      return;
    }
    const weeks = getWeeksInMonthLocal(displayMonthRef.current, displayYearRef.current);
    for (const { year: y, week: w } of weeks) {
      const sk = weekSliceKey(y, w);
      const cur = deletedLineIdsByWeekRef.current[sk] ?? new Set<string>();
      for (const id of lineIds) cur.add(id);
      deletedLineIdsByWeekRef.current[sk] = cur;
    }
  };

  const removeEntry = (customerId: string, entryId: string, explicitLineIds?: string[]) => {
    if (viewMode === "week") {
      markDirty();
      const removedIds: string[] =
        explicitLineIds ??
        customerGroupsRef.current
          .find((g) => g.customerId === customerId)
          ?.entries.filter((e) => e.id === entryId)
          .map((e) => e.id) ??
        [];
      setCustomerGroups((prev) => {
        const next = prev
          .map((g) => {
            if (g.customerId !== customerId) return g;
            const keep = g.entries.filter((e) => e.id !== entryId);
            return { ...g, entries: keep };
          })
          .filter((g) => g.entries.length > 0);
        customerGroupsRef.current = next;
        return next;
      });
      markDeletedLineIds(removedIds);
    } else {
      markDirtyEntireDisplayMonth();
      const removedIds: string[] =
        explicitLineIds ??
        monthMergedRowsRef.current
          .filter((r) => r.customerId === customerId && r.rowKey === entryId)
          .flatMap((r) => mergedRowAllLineIds(r));
      setMonthMergedRows((prev) => {
        const keep = prev.filter((r) => {
          if (!(r.customerId === customerId && r.rowKey === entryId)) return true;
          return false;
        });
        monthMergedRowsRef.current = keep;
        return keep;
      });
      markDeletedLineIds(removedIds);
    }
    if (
      editingCell &&
      ((editingCell.scope === "week" && editingCell.entryId === entryId) ||
        (editingCell.scope === "month" && editingCell.rowId === entryId))
    ) {
      setEditingCell(null);
    }
  };

  const entryHasComment = (entry: Entry): boolean =>
    Object.values(entry.comments).some((c) => (c ?? "").trim() !== "");

  const requestRemoveEntry = (customerId: string, entryId: string) => {
    if (viewMode === "week") {
      const entry = customerGroups
        .find((g) => g.customerId === customerId)
        ?.entries.find((e) => e.id === entryId);
      if (entry && !entryHasContent(entry)) {
        removeEntry(customerId, entryId);
        return;
      }
    } else {
      const row = monthMergedRows.find((r) => r.customerId === customerId && r.rowKey === entryId);
      if (row && !mergedRowHasContent(row)) {
        removeEntry(customerId, entryId, mergedRowAllLineIds(row));
        return;
      }
    }
    setPendingRowDelete({
      customerId,
      entryId,
    });
  };

  const openComment = (entryId: string) => {
    const entry = entryById.get(entryId);
    const texts: Record<number, string> = {};
    for (let i = 0; i < 7; i++) {
      texts[i] = entry?.comments[i]?.trim() ?? "";
    }
    setCommentTexts(entry ? texts : {});
    setCommentState({ kind: "week", entryId, weekYear: year, weekWeek: week });
  };

  const openCommentMonth = (rowId: string) => {
    const dates = getCalendarDatesInMonth(displayYear, displayMonth);
    const row = monthMergedRows.find((r) => r.rowKey === rowId);
    const texts: Record<string, string> = {};
    for (const d of dates) {
      texts[d] = (row?.commentsByDate[d] ?? "").trim();
    }
    setCommentTextsByDate(texts);
    setCommentState({ kind: "month", rowId });
  };

  const saveComment = () => {
    if (!commentState) return;
    if (commentState.kind === "week") {
      markDirty();
      const customerId = customerIdByEntryId.get(commentState.entryId);
      if (!customerId) return;
      const entry = entryById.get(commentState.entryId);
      const comments: Record<number, string> = {};
      for (let i = 0; i < 7; i++) {
        if ((entry?.hours[i] ?? 0) <= 0) continue;
        const t = (commentTexts[i] ?? "").trim();
        if (t) comments[i] = t;
      }
      const { entryId } = commentState;
      setCustomerGroups((prev) =>
        prev.map((g) =>
          g.customerId !== customerId
            ? g
            : {
                ...g,
                entries: g.entries.map((e) =>
                  e.id !== entryId ? e : { ...e, comments }
                ),
              }
        )
      );
    } else {
      const dates = getCalendarDatesInMonth(displayYear, displayMonth);
      const monthWeeks = getWeeksInMonthLocal(displayMonth, displayYear);
      const row = monthMergedRows.find((r) => r.rowKey === commentState.rowId);
      markDirty(row ? weekSliceKeysForMergedRow(row, monthWeeks) : undefined);
      setMonthMergedRows((prev) =>
        prev.map((r) => {
          if (r.rowKey !== commentState.rowId) return r;
          const nextComments = { ...r.commentsByDate };
          for (const d of dates) {
            if ((r.hoursByDate[d] ?? 0) <= 0) {
              delete nextComments[d];
              continue;
            }
            const t = (commentTextsByDate[d] ?? "").trim();
            if (t) nextComments[d] = t;
            else delete nextComments[d];
          }
          return { ...r, commentsByDate: nextComments };
        })
      );
    }
    setCommentState(null);
  };

  const { start: weekStartStr } = getISOWeekDateRangeLocal(year, week);
  const weekStart = new Date(weekStartStr + "T12:00:00");
  const dayDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d.getDate();
  });

  const weekTotalHours = useMemo(
    () => customerGroups.reduce((sum, g) => sum + groupTotalHours(g.entries), 0),
    [customerGroups]
  );

  const weekTotalDisplay = useMemo(
    () => formatReportHoursTotal(weekTotalHours, "week"),
    [weekTotalHours]
  );

  const calendarMonthValue = `${displayYear}-${String(displayMonth).padStart(2, "0")}`;

  const calendarMonthSelectOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const fromY = displayYear - 3;
    const toY = displayYear + 4;
    for (let y = fromY; y <= toY; y++) {
      for (let m = 1; m <= 12; m++) {
        const labelRaw = new Date(y, m - 1, 15).toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        });
        const label = labelRaw.charAt(0).toUpperCase() + labelRaw.slice(1);
        out.push({
          value: `${y}-${String(m).padStart(2, "0")}`,
          label,
        });
      }
    }
    return out;
  }, [displayYear]);

  const monthWeeks = useMemo(
    () => getWeeksInMonthLocal(displayMonth, displayYear),
    [displayMonth, displayYear]
  );

  const liveCurrentWeek = getYearWeekForDateLocal(new Date());
  const isOnLiveCurrentWeek =
    year === liveCurrentWeek.year && week === liveCurrentWeek.week;

  const monthCalendarDates = useMemo(
    () => getCalendarDatesInMonth(displayYear, displayMonth),
    [displayYear, displayMonth]
  );

  const monthRowsByCustomer = useMemo(() => {
    const byCustomer = new Map<string, MonthMergedRow[]>();
    const order: string[] = [];
    for (const row of monthMergedRows) {
      if (!byCustomer.has(row.customerId)) {
        byCustomer.set(row.customerId, []);
        order.push(row.customerId);
      }
      byCustomer.get(row.customerId)!.push(row);
    }
    return order.map((id) => ({ customerId: id, rows: byCustomer.get(id)! }));
  }, [monthMergedRows]);

  const monthDateDayTotals = useMemo(
    () =>
      monthCalendarDates.map((dateStr) =>
        monthMergedRows.reduce((sum, row) => sum + (row.hoursByDate[dateStr] ?? 0), 0)
      ),
    [monthCalendarDates, monthMergedRows]
  );

  const monthGridTotalHours = useMemo(
    () => monthDateDayTotals.reduce((a, b) => a + b, 0),
    [monthDateDayTotals]
  );
  const monthGridTotalDisplay = useMemo(
    () => formatReportHoursTotal(monthGridTotalHours, "month"),
    [monthGridTotalHours]
  );

  const monthTableColSpan = 5 + monthCalendarDates.length + 1;

  const commentDialogWeekDayNumbers = useMemo(() => {
    if (!commentState || commentState.kind !== "week") return dayDates;
    return getWeekDates(commentState.weekYear, commentState.weekWeek).map((s) =>
      parseInt(s.slice(8, 10), 10)
    );
  }, [commentState, dayDates]);

  const commentDialogWeekEntry = useMemo(() => {
    if (!commentState || commentState.kind !== "week") return null;
    return entryById.get(commentState.entryId) ?? null;
  }, [commentState, entryById]);

  const commentDialogMonthRow = useMemo(() => {
    if (!commentState || commentState.kind !== "month") return null;
    return monthMergedRows.find((r) => r.rowKey === commentState.rowId) ?? null;
  }, [commentState, monthMergedRows]);

  const totalHoursPerDay = useMemo(
    () =>
      customerGroups.reduce<number[]>(
        (acc, g) => {
          const daily = dayTotals(g.entries);
          daily.forEach((h, i) => {
            acc[i] = (acc[i] ?? 0) + h;
          });
          return acc;
        },
        [0, 0, 0, 0, 0, 0, 0]
      ),
    [customerGroups]
  );
  const totalEntries = useMemo(() => {
    if (viewMode === "week") {
      return customerGroups.reduce((n, g) => n + g.entries.length, 0);
    }
    return monthMergedRows.length;
  }, [viewMode, customerGroups, monthMergedRows]);

  useEffect(() => {
    if (!ENABLE_PERF_DEBUG) return;
    fetch("http://127.0.0.1:7377/ingest/142286f1-190a-49b6-8e1e-854ceb792769", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "97edeb",
      },
      body: JSON.stringify({
        sessionId: "97edeb",
        runId: "perf-scan-1",
        hypothesisId: "H4",
        location: "TimeReportPageClient.tsx",
        message: "time report render summary",
        data: {
          customerGroups: customerGroups.length,
          totalEntries,
          weekTotalHours,
          loadState,
          saveState,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, [customerGroups.length, totalEntries, weekTotalHours, loadState, saveState]);

  if (!consultant) {
    return (
      <div className="rounded-lg bg-bg-muted p-6 text-center text-text-secondary">
        Link your user to a consultant to report time.
      </div>
    );
  }

  return (
    <div className="time-report-font-12 flex min-w-0 flex-col gap-4">
      <FloatingSaveStatus
        saveState={saveState}
        isDirty={isDirty}
        saveError={saveError}
      />

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex justify-end">
          <SegmentedControl
            aria-label="Time report view"
            value={viewMode}
            onChange={(mode) => {
              if (mode === "month") void switchToMonthView();
              else void switchToWeekView();
            }}
            options={[
              { value: "month", label: "Month" },
              { value: "week", label: "Week" },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
            <div className="flex w-full min-w-0 items-center justify-start gap-2 px-1">
              <IconButton
                aria-label={viewMode === "week" ? "Previous week" : "Previous month"}
                title={viewMode === "week" ? "Previous week" : "Previous month"}
                onClick={() => void goPrevMonth()}
                disabled={isWeekStripTransitioning}
              >
                <ChevronLeft className="h-5 w-5" />
              </IconButton>
              <Select
                id="time-report-calendar-month-select"
                value={calendarMonthValue}
                onValueChange={(v) => void onPickCalendarMonth(v)}
                options={calendarMonthSelectOptions}
                disabled={isWeekStripTransitioning}
                size="sm"
                variant="filter"
                triggerClassName="h-8 min-w-[12rem] max-w-[min(100%,20rem)] justify-between text-xs"
                viewportClassName="max-h-64"
              />
              <IconButton
                aria-label={viewMode === "week" ? "Next week" : "Next month"}
                title={viewMode === "week" ? "Next week" : "Next month"}
                onClick={() => void goNextMonth()}
                disabled={isWeekStripTransitioning}
              >
                <ChevronRight className="h-5 w-5" />
              </IconButton>
            </div>
            {viewMode === "week" && (
              <div
                className={`flex w-full min-w-0 flex-wrap items-center justify-start gap-1.5 px-1 ${weekStripAnimClass}`}
              >
                {monthWeeks.map(({ year: wY, week: w }) => {
                  const isSelected = wY === year && w === week;
                  const isCurrentWeek =
                    wY === liveCurrentWeek.year && w === liveCurrentWeek.week;
                  return (
                    <button
                      key={`${wY}-${w}`}
                      type="button"
                      onClick={() => void jumpToWeek(wY, w)}
                      className={`w-[4rem] cursor-pointer shrink-0 rounded-md px-1.5 py-0.5 text-center text-[11px] font-medium transition-colors whitespace-nowrap ${
                        isSelected
                          ? "bg-interactive-primary text-text-inverse"
                          : "border border-border-subtle bg-bg-default text-text-primary hover:bg-bg-muted"
                      } ${!isSelected && isCurrentWeek ? "ring-2 ring-interactive-primary ring-offset-1 ring-offset-bg-default" : ""}`}
                      aria-label={`Week ${w}${isCurrentWeek ? " (current week)" : ""}`}
                      aria-pressed={isSelected}
                      title={isCurrentWeek ? "Current week" : `Week ${w}`}
                    >
                      W{w}
                    </button>
                  );
                })}
                {!isOnLiveCurrentWeek ? (
                  <button
                    type="button"
                    onClick={() => void goToCurrentWeek()}
                    disabled={isWeekStripTransitioning}
                    className="ml-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-interactive-primary hover:bg-bg-muted disabled:opacity-50"
                    title={`Go to current week (W${liveCurrentWeek.week})`}
                  >
                    This week
                  </button>
                ) : null}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex min-h-5 flex-wrap items-center justify-end gap-2">
              <span
                className={`text-xs text-text-secondary ${saveState === "saving" ? "" : "invisible"}`}
                aria-hidden={saveState !== "saving"}
              >
                Saving…
              </span>
              {saveState === "error" && saveError && (
                <span className="text-xs text-danger" role="alert">
                  {saveError}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {loadState === "loading" ? (
        <div className="overflow-hidden rounded-lg bg-bg-default">
          <div className="h-0.5 w-full bg-brand-blue/70" />
          <div className="p-4">
            <div className="mb-3 flex items-center gap-2 text-xs text-text-secondary">
              <span className="h-2 w-2 animate-pulse rounded-full bg-brand-blue/80" aria-hidden />
              <span>Loading time report…</span>
            </div>
            <div className="space-y-2">
              <div className="h-7 rounded-md bg-bg-muted/40" />
              <div className="h-7 rounded-md bg-bg-muted/30" />
              <div className="h-7 rounded-md bg-bg-muted/25" />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div
            className={
              viewMode === "month"
                ? "time-report-tables w-full min-w-0 rounded-lg"
                : "time-report-tables rounded-lg"
            }
          >
          {viewMode === "week" ? (
          <table className="w-full min-w-[66rem] table-fixed border-collapse text-xs">
            <thead>
              <tr className="border-b border-border-subtle bg-bg-muted/40">
                <th className="w-[4.75rem] min-w-[4.75rem] px-0 py-1.5">
                  <div className="flex items-center justify-center">
                    <IconButton
                      aria-label="Copy whole week to next week"
                      title="Copy whole week to next week"
                      onClick={() => setCopyRowDialog({ mode: "whole-week-next-week" })}
                      disabled={copyToWeekState === "copying"}
                    >
                      {copyToWeekState === "copying" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </IconButton>
                  </div>
                </th>
                <th className="w-[140px] min-w-[140px] max-w-[140px] px-1.5 py-1.5 text-left font-medium text-text-secondary">
                  Project
                </th>
                <th className="w-[140px] min-w-[140px] max-w-[140px] px-1.5 py-1.5 text-left font-medium text-text-secondary">
                  Role
                </th>
                <th className="w-[clamp(8.5rem,15vw,11.25rem)] min-w-[8.5rem] max-w-[11.25rem] px-1.5 py-1.5 text-left font-medium text-text-secondary">
                  Description
                </th>
                <th className="w-[clamp(8rem,16vw,14rem)] min-w-[8rem] max-w-[14rem] px-1 py-1.5 text-left font-medium text-text-secondary" scope="col" title="Jira / DevOps / ClickUp / Work">
                  <Link className="inline-block h-4 w-4 text-text-muted" aria-hidden />
                </th>
                {TIME_REPORT_DAY_LABELS.map((label, i) => (
                  <th
                    key={i}
                    data-col-index={i}
                    className={`w-[clamp(2.25rem,3.6vw,3rem)] min-w-[2.25rem] border-r border-border-subtle p-0 py-1.5 font-medium text-text-secondary ${i === 0 ? "border-l border-border-subtle" : ""} ${isDayGrayed(i) ? dayHeaderGrayClass : ""} ${isTodayColumn(i) ? todayHeaderClass : ""}`}
                    title={isTodayColumn(i) ? "Today" : undefined}
                  >
                    <div className="flex h-full w-full items-center justify-center text-left text-text-secondary">
                      <div>
                        <div>{label}</div>
                        <div className="text-xs text-text-muted">{dayDates[i]}</div>
                      </div>
                    </div>
                  </th>
                ))}
                <th className="w-[3.5rem] min-w-[3.5rem] px-0.5 py-1.5">
                  <span className="sr-only">Row total</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {customerGroups.length === 0 ? (
                <tr className="border-b border-border-subtle bg-bg-default">
                  <td
                    colSpan={13}
                    className="px-4 py-6 text-center text-xs text-text-secondary"
                  >
                    No customers added. Click &quot;Add customer&quot; to start reporting time.
                  </td>
                </tr>
              ) : (
                <>
                  <tr
                    className={`border-b border-border-subtle bg-bg-muted/40 font-medium`}
                  >
                    <td colSpan={5} className="px-1.5 py-1 text-left text-text-primary" />
                    {totalHoursPerDay.map((h, i) => (
                      <td
                        key={i}
                        data-col-index={i}
                        className={`h-8 w-[clamp(2.25rem,3.6vw,3rem)] min-w-[2.25rem] border-r border-border-subtle p-0 py-1 align-middle ${i === 0 ? "border-l border-border-subtle" : ""} ${isDayGrayed(i) ? (isWeekDayWeekend(i) ? dayCellWeekendGrayClass : dayCellHolidayWeekdayGrayClass) : ""} ${isTodayColumn(i) ? todayColumnClass : ""}`}
                      >
                        <div className="flex h-full w-full items-center justify-center">
                          <span className={timeReportSumFigureClass("week")}>
                            {h > 0 ? String(h) : ""}
                          </span>
                        </div>
                      </td>
                    ))}
                    <td className="relative w-[3.5rem] min-w-[3.5rem] px-0.5 py-1 align-middle">
                      <div className="flex min-h-8 w-full items-center justify-center pr-7">
                        <span className={timeReportSumFigureClass("week")}>
                          {weekTotalDisplay}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {customerGroups.map((group, groupIndex) => {
                const customer = customerById.get(group.customerId);
                const name = customer?.name ?? "—";
                const color = customer?.color ?? DEFAULT_CUSTOMER_COLOR;
                const customerDayTotals = dayTotals(group.entries);
                const customerWeekTotal = groupTotalHours(group.entries);

                return (
                  <Fragment key={group.customerId}>
                    {groupIndex === 0 && (
                      <tr aria-hidden>
                        <td colSpan={13} className="h-2 p-0" />
                      </tr>
                    )}
                    <tr
                      className={`border-b border-border-subtle bg-bg-muted/40`}
                    >
                      <td
                        className="w-[4.75rem] min-w-[4.75rem] border-l-[4px] border-solid px-0 py-0.5 align-middle"
                        style={{ borderLeftColor: color }}
                      >
                        <button
                          type="button"
                          aria-label="Add row"
                          title="Add row"
                          onClick={() => addRow(group.customerId)}
                          className="flex h-full w-full cursor-pointer items-center justify-center rounded-sm p-1.5 transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-offset-2"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </td>
                      <td colSpan={4} className="px-1.5 py-1">
                        <div className="flex w-full min-w-0 items-center font-medium text-text-primary">
                          <span className="time-report-customer-name min-w-0 truncate">{name}</span>
                        </div>
                      </td>
                      {TIME_REPORT_DAY_LABELS.map((_, i) => (
                        <td
                          key={i}
                          data-col-index={i}
                          className={`w-[clamp(2.25rem,3.6vw,3rem)] min-w-[2.25rem] border-r border-border-subtle p-0 py-0.5 align-middle ${i === 0 ? "border-l border-border-subtle" : ""} ${isDayGrayed(i) ? (isWeekDayWeekend(i) ? dayCellWeekendGrayClass : dayCellHolidayWeekdayGrayClass) : ""} ${isTodayColumn(i) ? todayColumnClass : ""}`}
                        >
                          <div className="flex h-full w-full items-center justify-center">
                            <span className={timeReportSumFigureClass("week")}>
                              {(customerDayTotals[i] ?? 0) > 0 ? String(customerDayTotals[i]) : ""}
                            </span>
                          </div>
                        </td>
                      ))}
                      <td className="relative w-[3.5rem] min-w-[3.5rem] px-0.5 py-0.5 align-middle">
                        <div className="flex min-h-8 w-full items-center justify-center pr-7">
                          <span className={timeReportSumFigureClass("week")}>
                            {customerWeekTotal > 0 ? String(customerWeekTotal) : ""}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {group.entries.map((entry) => (
                        <tr
                          key={entry.id}
                          className={`border-b border-border-subtle bg-bg-default`}
                        >
                          <td
                            className="w-[4.75rem] min-w-[4.75rem] border-l-[4px] border-solid px-0 py-1"
                            style={{ borderLeftColor: color }}
                          >
                            <div className="flex items-center justify-center gap-0.5">
                              <IconButton
                                aria-label="Add internal comment"
                                title="Add internal comment"
                                onClick={() => openComment(entry.id)}
                                className={`${entryHasComment(entry) ? "text-brand-signal" : ""} time-report-icons-tight`.trim()}
                              >
                                <MessageSquare
                                  className={`h-3.5 w-3.5 ${entryHasComment(entry) ? "fill-brand-signal stroke-brand-signal" : ""}`}
                                />
                              </IconButton>
                              <IconButton
                                aria-label="Copy row to current week"
                                title="Copy row to current week"
                                onClick={() =>
                                  setCopyRowDialog({
                                    mode: "current-week",
                                    customerId: group.customerId,
                                    entry,
                                  })
                                }
                                disabled={
                                  !entry.projectId ||
                                  !entry.roleId ||
                                  (year === initialYear && week === initialWeek) ||
                                  copyToWeekState === "copying"
                                }
                                className="time-report-icons-tight"
                              >
                                {copyToWeekState === "copying" ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" aria-hidden />
                                )}
                              </IconButton>
                              <IconButton
                                aria-label="Duplicate row"
                                title="Duplicate row (Project + Role)"
                                onClick={() => duplicateRow(group.customerId, entry.id)}
                                className="time-report-icons-tight"
                              >
                                <CopyPlus className="h-3.5 w-3.5" />
                              </IconButton>
                            </div>
                          </td>
                          <td className="w-[140px] min-w-[140px] max-w-[140px] px-1.5 py-1">
                            <div
                              className={`min-w-0 overflow-hidden rounded ${showValidationHighlights && entryHasContent(entry) && !entry.projectId ? "ring-2 ring-danger ring-offset-1 ring-offset-bg-default" : ""}`}
                            >
                              <Select
                                value={entry.projectId}
                                onValueChange={(value) => {
                                  setShowValidationHighlights(false);
                                  updateEntryInGroup(group.customerId, entry.id, {
                                    projectId: value,
                                    jiraDevOpsValue: "",
                                    roleId: "",
                                  });
                                  loadTaskOptions(group.customerId, value);
                                }}
                                options={getProjectOptions(group.customerId)}
                                size="sm"
                                variant="filter"
                                placeholder="—"
                                triggerClassName="h-7 w-full min-w-0 max-w-full truncate text-xs"
                                isLoading={Boolean(projectOptionsLoading[group.customerId])}
                              />
                            </div>
                          </td>
                          <td className="w-[140px] min-w-[140px] max-w-[140px] px-1.5 py-1">
                            <div
                              className={`min-w-0 overflow-hidden rounded ${showValidationHighlights && entryHasContent(entry) && !entry.roleId ? "ring-2 ring-danger ring-offset-1 ring-offset-bg-default" : ""}`}
                            >
                              <Select
                                value={entry.roleId}
                                onValueChange={(value) => {
                                  setShowValidationHighlights(false);
                                  updateEntryInGroup(group.customerId, entry.id, { roleId: value });
                                }}
                                options={getTaskOptions(group.customerId, entry.projectId)}
                                size="sm"
                                variant="filter"
                                placeholder="—"
                                triggerClassName="h-7 w-full min-w-0 max-w-full truncate text-xs"
                                isLoading={Boolean(
                                  taskOptionsLoading[
                                    taskCacheKey(group.customerId, entry.projectId)
                                  ]
                                )}
                              />
                            </div>
                          </td>
                          <td className="w-[clamp(8.5rem,15vw,11.25rem)] min-w-[8.5rem] max-w-[11.25rem] px-1.5 py-1">
                            <input
                              type="text"
                              value={entry.task ?? ""}
                              onChange={(e) =>
                                updateEntryInGroup(group.customerId, entry.id, {
                                  task: e.target.value,
                                })
                              }
                              className="h-7 w-full min-w-0 rounded border border-form bg-bg-default px-1.5 py-0.5 text-xs text-text-primary placeholder-text-muted focus:border-brand-signal focus:outline-none focus:ring-1 focus:ring-brand-signal"
                            />
                          </td>
                          <td className="w-[clamp(8rem,16vw,14rem)] min-w-[8rem] max-w-[14rem] px-1 py-1 align-middle">
                            {entry.jiraDevOpsValue ? (() => {
                              const opt = resolveLinkOption(
                                entry.projectId,
                                entry.jiraDevOpsValue
                              );
                              const displayLabel = jiraDevOpsDisplayLabel(
                                entry.jiraDevOpsValue,
                                opt
                              );
                              const desc = opt?.description?.trim();
                              return (
                              <div className="flex items-center gap-0.5 min-w-0">
                                <button
                                  type="button"
                                  onMouseEnter={() => {
                                    if (entry.projectId) void loadJiraDevOpsForProject(entry.projectId);
                                    void loadWorkIssuesForCustomer(group.customerId);
                                  }}
                                  onClick={() => {
                                    setJiraDevOpsModalValue(entry.jiraDevOpsValue);
                                    setJiraDevOpsModal({ customerId: group.customerId, entryId: entry.id });
                                    void loadWorkIssuesForCustomer(group.customerId);
                                    if (entry.projectId) {
                                      void loadJiraDevOpsForProject(entry.projectId, { force: true });
                                    }
                                  }}
                                  className="min-w-0 flex-1 truncate cursor-pointer rounded px-1 py-0.5 text-left text-xs text-text-primary hover:bg-bg-muted"
                                  title={jiraDevOpsKeyTooltipTitle(displayLabel, opt?.description)}
                                >
                                  {displayLabel}
                                </button>
                                {(entry.jiraDevOpsValue.startsWith("jira:") ||
                                  entry.jiraDevOpsValue.startsWith("clickup:") ||
                                  entry.jiraDevOpsValue.startsWith("work:")) && (() => {
                                  const url = opt?.url?.trim();
                                  const sourceLabel = entry.jiraDevOpsValue.startsWith("clickup:")
                                    ? "ClickUp"
                                    : entry.jiraDevOpsValue.startsWith("work:")
                                      ? "Work"
                                      : "Jira";
                                  const key = entry.jiraDevOpsValue.replace(
                                    /^(jira|clickup|work):/,
                                    ""
                                  );
                                  return url ? (
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="shrink-0 rounded p-0.5 text-text-secondary hover:bg-bg-muted hover:text-brand-signal"
                                      aria-label={`Open in ${sourceLabel}`}
                                      title={
                                        desc
                                          ? `Open in ${sourceLabel} — ${desc}`
                                          : `Open in ${sourceLabel}`
                                      }
                                    >
                                      <ExternalLink className="h-3.5 w-3.5 stroke-[1.5]" />
                                    </a>
                                  ) : (
                                    <span
                                      className="shrink-0 rounded p-0.5 text-text-muted"
                                      title={key ? `${sourceLabel} ${key} – no URL in database` : undefined}
                                      aria-hidden
                                    >
                                      <ExternalLink className="h-3.5 w-3.5 stroke-[1.5]" />
                                    </span>
                                  );
                                })()}
                                <IconButton
                                  aria-label="Remove Jira/DevOps/ClickUp link"
                                  title="Remove link"
                                  className="time-report-icons-tight shrink-0 text-text-secondary hover:text-text-primary"
                                  onClick={() =>
                                    updateEntryInGroup(group.customerId, entry.id, {
                                      jiraDevOpsValue: "",
                                    })
                                  }
                                >
                                  <Link2Off className="h-3.5 w-3.5 stroke-[1.5]" />
                                </IconButton>
                              </div>
                              );
                            })() : (
                              <IconButton
                                aria-label="Add Jira/DevOps/ClickUp/Work"
                                onClick={() => {
                                  setJiraDevOpsModalValue("");
                                  setJiraDevOpsModal({ customerId: group.customerId, entryId: entry.id });
                                  void loadWorkIssuesForCustomer(group.customerId);
                                  if (entry.projectId) {
                                    void loadJiraDevOpsForProject(entry.projectId, { force: true });
                                  }
                                }}
                                title="Add Jira/DevOps/ClickUp/Work"
                              >
                                <Link className="h-3.5 w-3.5" />
                              </IconButton>
                            )}
                          </td>
                          {entry.hours.map((h, dayIndex) => (
                            <EditableHourTd
                              key={dayIndex}
                              dayIndex={dayIndex}
                              entryId={entry.id}
                              value={h}
                              isEditing={
                                editingCell?.scope === "week" &&
                                editingCell.entryId === entry.id &&
                                editingCell.dayIndex === dayIndex
                              }
                              isGray={isDayGrayed(dayIndex)}
                              grayWeekend={isWeekDayWeekend(dayIndex)}
                              isToday={isTodayColumn(dayIndex)}
                              onStartEdit={() =>
                                setEditingCell({ scope: "week", entryId: entry.id, dayIndex })
                              }
                              onCommit={(v) => {
                                const next = [...entry.hours];
                                next[dayIndex] = v;
                                updateEntryInGroup(group.customerId, entry.id, {
                                  hours: next,
                                });
                              }}
                              onBlur={() => setEditingCell(null)}
                              internalCommentText={(entry.comments[dayIndex] ?? "").trim() || undefined}
                              colIndex={dayIndex}
                            />
                          ))}
                          <td className="relative w-[3.5rem] min-w-[3.5rem] px-0.5 py-1 align-middle">
                            <div className="flex min-h-8 w-full items-center justify-center pr-7">
                              <span
                                className={timeReportSumFigureClass("week")}
                                title="Total hours this week on this row"
                              >
                                {formatReportHoursTotal(
                                  entry.hours.reduce((s, h) => s + (h ?? 0), 0),
                                  "week"
                                )}
                              </span>
                            </div>
                            <IconButton
                              aria-label="Delete entire row"
                              title="Delete entire row"
                              onClick={() => requestRemoveEntry(group.customerId, entry.id)}
                              className="time-report-icons-tight absolute top-1/2 right-0 z-[1] -translate-y-1/2 !opacity-100 text-brand-signal hover:text-brand-signal"
                            >
                              <Trash2 className="h-3.5 w-3.5 stroke-[1.5]" />
                            </IconButton>
                          </td>
                        </tr>
                      ))}
                    <tr aria-hidden>
                      <td colSpan={13} className="h-2 p-0" />
                    </tr>
                  </Fragment>
                );
              })}
                </>
              )}
            </tbody>
          </table>
          ) : (
          <table className="w-full min-w-[62rem] table-fixed border-collapse text-[12px]">
            <colgroup>
              <col style={{ width: "4.75rem" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "clamp(8rem,12vw,12rem)" }} />
              {monthCalendarDates.map((d) => (
                <col key={d} style={{ width: "clamp(1rem,1.8vw,1.28rem)" }} />
              ))}
              <col style={{ width: "3.5rem" }} />
            </colgroup>
            <thead>
              <tr className="border-b border-border-subtle bg-bg-muted/40">
                <th className="w-[4.75rem] min-w-[4.75rem] px-0 py-1.5">
                  <div className="flex items-center justify-center">
                    <IconButton
                      aria-label="Copy whole month to next month"
                      title="Copy whole month to next month"
                      onClick={() => setCopyRowDialog({ mode: "whole-month-next-month" })}
                      disabled={copyToNextMonthState === "copying"}
                    >
                      {copyToNextMonthState === "copying" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </IconButton>
                  </div>
                </th>
                <th className="min-w-0 px-1 py-1.5 text-left font-medium text-text-secondary">
                  Project
                </th>
                <th className="min-w-0 px-1 py-1.5 text-left font-medium text-text-secondary">
                  Role
                </th>
                <th className="min-w-0 px-1 py-1.5 text-left font-medium text-text-secondary">
                  Description
                </th>
                <th
                  className="w-[clamp(8rem,14vw,13rem)] min-w-[8rem] max-w-[13rem] px-1 py-1.5 text-left font-medium text-text-secondary"
                  scope="col"
                  title="Jira / DevOps / ClickUp / Work"
                >
                  <Link className="inline-block h-3 w-3 text-text-muted" aria-hidden />
                </th>
                {monthCalendarDates.map((dateStr, dateIdx) => {
                  const d = new Date(dateStr + "T12:00:00");
                  const dow = d.getDay();
                  const label = TIME_REPORT_MONTH_GRID_DOW[dow]!;
                  const longDow =
                    dow === 0
                      ? TIME_REPORT_DAY_LABELS[6]
                      : TIME_REPORT_DAY_LABELS[dow - 1]!;
                  const dom = parseInt(dateStr.slice(8, 10), 10);
                  const isTodayHeader = isMonthDateToday(dateStr);
                  return (
                    <th
                      key={dateStr}
                      data-col-index={dateIdx}
                      className={`min-w-0 border-r border-border-subtle px-0 py-1 font-medium leading-tight text-text-secondary ${dateIdx === 0 ? "border-l border-border-subtle" : ""} ${isMonthDateGrayed(dateStr) ? dayHeaderGrayClass : ""} ${isTodayHeader ? todayHeaderClass : ""}`}
                      title={
                        isTodayHeader
                          ? `Today — ${longDow} ${dom} (${dateStr})`
                          : `${longDow} ${dom} (${dateStr})`
                      }
                    >
                      <div className="flex flex-col items-center justify-center gap-0.5 px-0.5 py-0.5">
                        <span className="text-[12px] leading-tight">{label}</span>
                        <span className="text-[12px] leading-tight text-text-muted tabular-nums">{dom}</span>
                      </div>
                    </th>
                  );
                })}
                <th className="w-[3.5rem] min-w-[3.5rem] px-0.5 py-1.5">
                  <span className="sr-only">Row total</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {monthRowsByCustomer.length === 0 ? (
                <tr className="border-b border-border-subtle bg-bg-default">
                  <td
                    colSpan={monthTableColSpan}
                    className="px-4 py-6 text-center text-[10px] text-text-secondary"
                  >
                    No customers added. Click &quot;Add customer&quot; to start reporting time.
                  </td>
                </tr>
              ) : (
                <>
                  <tr
                    className={`border-b border-border-subtle bg-bg-muted/40 font-medium`}
                  >
                    <td colSpan={5} className="px-1 py-0.5 text-left text-text-primary" />
                    {monthDateDayTotals.map((h, dateIdx) => {
                      const dateStr = monthCalendarDates[dateIdx]!;
                      return (
                        <td
                          key={dateStr}
                          data-col-index={dateIdx}
                          className={`h-7 min-w-0 border-r border-border-subtle p-0 py-0.5 align-middle ${dateIdx === 0 ? "border-l border-border-subtle" : ""} ${isMonthDateGrayed(dateStr) ? (isMonthDateWeekend(dateStr) ? dayCellWeekendGrayClass : dayCellHolidayWeekdayGrayClass) : ""} ${isMonthDateToday(dateStr) ? todayColumnClass : ""}`}
                        >
                          <div className="flex h-full w-full items-center justify-center">
                            <span className={timeReportSumFigureClass("month")}>
                              {h > 0 ? String(h) : ""}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="relative w-[3.5rem] min-w-[3.5rem] px-0.5 py-0.5 align-middle">
                      <div className="flex min-h-7 w-full items-center justify-center pr-7">
                        <span className={timeReportSumFigureClass("month")}>
                          {monthGridTotalDisplay}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {monthRowsByCustomer.map(({ customerId, rows }, groupIndex) => {
                    const customer = customerById.get(customerId);
                    const name = customer?.name ?? "—";
                    const color = customer?.color ?? DEFAULT_CUSTOMER_COLOR;
                    const customerMonthDayTotals = monthCalendarDates.map((dateStr) =>
                      rows.reduce((sum, row) => sum + (row.hoursByDate[dateStr] ?? 0), 0)
                    );
                    const customerMonthTotal = customerMonthDayTotals.reduce(
                      (sum, hours) => sum + hours,
                      0
                    );
                    return (
                      <Fragment key={customerId}>
                        {groupIndex === 0 && (
                          <tr aria-hidden>
                            <td colSpan={monthTableColSpan} className="h-2 p-0" />
                          </tr>
                        )}
                        <tr
                          className={`border-b border-border-subtle bg-bg-muted/40`}
                        >
                          <td
                            className="w-[4.75rem] min-w-[4.75rem] border-l-[4px] border-solid px-0 py-0.5 align-middle"
                            style={{ borderLeftColor: color }}
                          >
                            <button
                              type="button"
                              aria-label="Add row"
                              title="Add row"
                              onClick={() => addRow(customerId)}
                              className="flex h-full w-full cursor-pointer items-center justify-center rounded-sm p-1 transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-offset-2"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </td>
                          <td colSpan={4} className="px-1 py-0.5">
                            <div className="flex w-full min-w-0 items-center font-medium text-text-primary">
                              <span className="time-report-customer-name min-w-0 truncate">{name}</span>
                            </div>
                          </td>
                          {monthCalendarDates.map((dateStr, dateIdx) => (
                            <td
                              key={dateStr}
                              data-col-index={dateIdx}
                              className={`min-w-0 border-r border-border-subtle p-0 py-0.5 align-middle ${dateIdx === 0 ? "border-l border-border-subtle" : ""} ${isMonthDateGrayed(dateStr) ? (isMonthDateWeekend(dateStr) ? dayCellWeekendGrayClass : dayCellHolidayWeekdayGrayClass) : ""} ${isMonthDateToday(dateStr) ? todayColumnClass : ""}`}
                            >
                              <div className="flex h-full w-full items-center justify-center">
                                <span className={timeReportSumFigureClass("month")}>
                                  {(customerMonthDayTotals[dateIdx] ?? 0) > 0
                                    ? String(customerMonthDayTotals[dateIdx])
                                    : ""}
                                </span>
                              </div>
                            </td>
                          ))}
                          <td className="relative w-[3.5rem] min-w-[3.5rem] px-0.5 py-0.5 align-middle">
                            <div className="flex min-h-7 w-full items-center justify-center pr-7">
                              <span className={timeReportSumFigureClass("month")}>
                                {customerMonthTotal > 0 ? String(customerMonthTotal) : ""}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {rows.map((row) => {
                          return (
                            <tr
                              key={row.rowKey}
                              className={`border-b border-border-subtle bg-bg-default`}
                            >
                              <td
                                className="w-[4.75rem] min-w-[4.75rem] border-l-[4px] border-solid px-0 py-0.5"
                                style={{ borderLeftColor: color }}
                              >
                                <div className="flex items-center justify-center gap-0.5">
                                  <IconButton
                                    aria-label="Add internal comment"
                                    title="Add internal comment"
                                    onClick={() => openCommentMonth(row.rowKey)}
                                    className={
                                      Object.values(row.commentsByDate).some((c) => (c ?? "").trim() !== "")
                                        ? "text-brand-signal time-report-icons-tight"
                                        : "time-report-icons-tight"
                                    }
                                  >
                                    <MessageSquare
                                      className={`h-3 w-3 ${Object.values(row.commentsByDate).some((c) => (c ?? "").trim() !== "") ? "fill-brand-signal stroke-brand-signal" : ""}`}
                                    />
                                  </IconButton>
                                  <IconButton
                                    aria-label="Copy this row to next month"
                                    title="Copy this row to next month"
                                    onClick={() => setCopyRowDialog({ mode: "next-month", row })}
                                    disabled={
                                      !row.projectId || !row.roleId || copyToNextMonthState === "copying"
                                    }
                                    className="time-report-icons-tight"
                                  >
                                    {copyToNextMonthState === "copying" ? (
                                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </IconButton>
                                  <IconButton
                                    aria-label="Duplicate row"
                                    title="Duplicate row (Project + Role)"
                                    onClick={() => duplicateRow(row.customerId, row.rowKey)}
                                    className="time-report-icons-tight"
                                  >
                                    <CopyPlus className="h-3 w-3" />
                                  </IconButton>
                                </div>
                              </td>
                              <td className="min-w-0 px-1 py-0.5">
                                <div
                                  className={`min-w-0 overflow-hidden rounded ${showValidationHighlights && mergedRowHasContent(row) && !row.projectId ? "ring-2 ring-danger ring-offset-1 ring-offset-bg-default" : ""}`}
                                >
                                  <Select
                                    value={row.projectId}
                                    onValueChange={(value) => {
                                      setShowValidationHighlights(false);
                                      updateEntryInGroup(row.customerId, row.rowKey, {
                                        projectId: value,
                                        jiraDevOpsValue: "",
                                        roleId: "",
                                      });
                                      loadTaskOptions(row.customerId, value);
                                    }}
                                    options={getProjectOptions(row.customerId)}
                                    size="sm"
                                    variant="filter"
                                    placeholder="—"
                                    triggerClassName="h-6 w-full min-w-0 max-w-full truncate text-[10px]"
                                    itemClassName="text-[10px] leading-tight"
                                    isLoading={Boolean(projectOptionsLoading[row.customerId])}
                                  />
                                </div>
                              </td>
                              <td className="min-w-0 px-1 py-0.5">
                                <div
                                  className={`min-w-0 overflow-hidden rounded ${showValidationHighlights && mergedRowHasContent(row) && !row.roleId ? "ring-2 ring-danger ring-offset-1 ring-offset-bg-default" : ""}`}
                                >
                                  <Select
                                    value={row.roleId}
                                    onValueChange={(value) => {
                                      setShowValidationHighlights(false);
                                      updateEntryInGroup(row.customerId, row.rowKey, { roleId: value });
                                    }}
                                    options={getTaskOptions(row.customerId, row.projectId)}
                                    size="sm"
                                    variant="filter"
                                    placeholder="—"
                                    triggerClassName="h-6 w-full min-w-0 max-w-full truncate text-[10px]"
                                    itemClassName="text-[10px] leading-tight"
                                    isLoading={Boolean(
                                      taskOptionsLoading[
                                        taskCacheKey(row.customerId, row.projectId)
                                      ]
                                    )}
                                  />
                                </div>
                              </td>
                              <td className="min-w-0 px-1 py-0.5">
                                <input
                                  type="text"
                                  value={row.task ?? ""}
                                  onChange={(e) =>
                                    updateEntryInGroup(row.customerId, row.rowKey, {
                                      task: e.target.value,
                                    })
                                  }
                                  className="h-6 w-full min-w-0 rounded border border-form bg-bg-default px-1 py-0.5 text-[10px] text-text-primary placeholder-text-muted focus:border-brand-signal focus:outline-none focus:ring-1 focus:ring-brand-signal"
                                />
                              </td>
                              <td className="w-[clamp(8rem,14vw,13rem)] min-w-[8rem] max-w-[13rem] px-0.5 py-0.5 align-middle">
                                {row.jiraDevOpsValue ? (() => {
                                  const opt = resolveLinkOption(
                                    row.projectId,
                                    row.jiraDevOpsValue
                                  );
                                  const displayLabel = jiraDevOpsDisplayLabel(
                                    row.jiraDevOpsValue,
                                    opt
                                  );
                                  const desc = opt?.description?.trim();
                                  return (
                                  <div className="flex min-w-0 items-center gap-0.5">
                                    <button
                                      type="button"
                                      onMouseEnter={() => {
                                        if (row.projectId) void loadJiraDevOpsForProject(row.projectId);
                                        void loadWorkIssuesForCustomer(row.customerId);
                                      }}
                                      onClick={() => {
                                        setJiraDevOpsModalValue(row.jiraDevOpsValue);
                                        setJiraDevOpsModal({
                                          customerId: row.customerId,
                                          entryId: row.rowKey,
                                        });
                                        void loadWorkIssuesForCustomer(row.customerId);
                                        if (row.projectId) {
                                          void loadJiraDevOpsForProject(row.projectId, { force: true });
                                        }
                                      }}
                                      className="min-w-0 max-w-full flex-1 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap rounded px-0.5 py-0.5 text-left text-[10px] leading-tight text-text-primary hover:bg-bg-muted"
                                      title={jiraDevOpsKeyTooltipTitle(displayLabel, opt?.description)}
                                    >
                                      {displayLabel}
                                    </button>
                                    {(row.jiraDevOpsValue.startsWith("jira:") ||
                                      row.jiraDevOpsValue.startsWith("clickup:") ||
                                      row.jiraDevOpsValue.startsWith("work:")) && (() => {
                                      const url = opt?.url?.trim();
                                      const sourceLabel = row.jiraDevOpsValue.startsWith("clickup:")
                                        ? "ClickUp"
                                        : row.jiraDevOpsValue.startsWith("work:")
                                          ? "Work"
                                          : "Jira";
                                      const key = row.jiraDevOpsValue.replace(
                                        /^(jira|clickup|work):/,
                                        ""
                                      );
                                      return url ? (
                                        <a
                                          href={url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="shrink-0 self-start rounded p-0.5 text-text-secondary hover:bg-bg-muted hover:text-brand-signal"
                                          aria-label={`Open in ${sourceLabel}`}
                                          title={
                                            desc
                                              ? `Open in ${sourceLabel} — ${desc}`
                                              : `Open in ${sourceLabel}`
                                          }
                                        >
                                          <ExternalLink className="h-3 w-3 stroke-[1.5]" />
                                        </a>
                                      ) : (
                                        <span
                                          className="shrink-0 self-start rounded p-0.5 text-text-muted"
                                          title={key ? `${sourceLabel} ${key} – no URL in database` : undefined}
                                          aria-hidden
                                        >
                                          <ExternalLink className="h-3 w-3 stroke-[1.5]" />
                                        </span>
                                      );
                                    })()}
                                    <IconButton
                                      aria-label="Remove Jira/DevOps/ClickUp link"
                                      title="Remove link"
                                      className="time-report-icons-tight shrink-0 self-start text-text-secondary hover:text-text-primary"
                                      onClick={() =>
                                        updateEntryInGroup(row.customerId, row.rowKey, {
                                          jiraDevOpsValue: "",
                                        })
                                      }
                                    >
                                      <Link2Off className="h-3 w-3 stroke-[1.5]" />
                                    </IconButton>
                                  </div>
                                  );
                                })() : (
                                  <IconButton
                                    aria-label="Add Jira/DevOps/ClickUp/Work"
                                    onClick={() => {
                                      setJiraDevOpsModalValue("");
                                      setJiraDevOpsModal({
                                        customerId: row.customerId,
                                        entryId: row.rowKey,
                                      });
                                      void loadWorkIssuesForCustomer(row.customerId);
                                      if (row.projectId) {
                                        void loadJiraDevOpsForProject(row.projectId, { force: true });
                                      }
                                    }}
                                    title="Add Jira/DevOps/ClickUp/Work"
                                  >
                                    <Link className="h-3 w-3" />
                                  </IconButton>
                                )}
                              </td>
                              {monthCalendarDates.map((dateStr, dateIdx) => (
                                <EditableHourTd
                                  key={dateStr}
                                  dayIndex={0}
                                  entryId={row.rowKey}
                                  value={row.hoursByDate[dateStr] ?? 0}
                                  compact
                                  showLeftBorder={dateIdx === 0}
                                  isEditing={
                                    editingCell?.scope === "month" &&
                                    editingCell.rowId === row.rowKey &&
                                    editingCell.dateStr === dateStr
                                  }
                                  isGray={isMonthDateGrayed(dateStr)}
                                  grayWeekend={isMonthDateWeekend(dateStr)}
                                  isToday={isMonthDateToday(dateStr)}
                                  onStartEdit={() =>
                                    setEditingCell({
                                      scope: "month",
                                      rowId: row.rowKey,
                                      dateStr,
                                    })
                                  }
                                  onCommit={(v) => {
                                    markDirty(
                                      weekSliceKeysForCalendarDate(
                                        dateStr,
                                        getWeeksInMonthLocal(displayMonth, displayYear)
                                      )
                                    );
                                    setMonthMergedRows((prev) => {
                                      return prev.map((r) =>
                                        r.rowKey !== row.rowKey
                                          ? r
                                          : {
                                              ...r,
                                              hoursByDate: { ...r.hoursByDate, [dateStr]: v },
                                            }
                                      );
                                    });
                                  }}
                                  onBlur={() => setEditingCell(null)}
                                  internalCommentText={
                                    (row.commentsByDate[dateStr] ?? "").trim() || undefined
                                  }
                                  colIndex={dateIdx}
                                />
                              ))}
                              <td className="relative w-[3.5rem] min-w-[3.5rem] px-0.5 py-0.5 align-middle">
                                <div className="flex min-h-7 w-full items-center justify-center pr-7">
                                  <span
                                    className={timeReportSumFigureClass("month")}
                                    title="Total hours this month on this row"
                                  >
                                    {formatReportHoursTotal(
                                      monthCalendarDates.reduce(
                                        (s, d) => s + (row.hoursByDate[d] ?? 0),
                                        0
                                      ),
                                      "month"
                                    )}
                                  </span>
                                </div>
                                <IconButton
                                  aria-label="Delete entire row"
                                  title="Delete entire row"
                                  onClick={() => requestRemoveEntry(row.customerId, row.rowKey)}
                                  className="time-report-icons-tight absolute top-1/2 right-0 z-[1] -translate-y-1/2 !opacity-100 text-brand-signal hover:text-brand-signal"
                                >
                                  <Trash2 className="h-3 w-3 stroke-[1.5]" />
                                </IconButton>
                              </td>
                            </tr>
                          );
                        })}
                        <tr aria-hidden>
                          <td colSpan={monthTableColSpan} className="h-2 p-0" />
                        </tr>
                      </Fragment>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
          )}
          </div>
          <div className="flex justify-start">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAddCustomerOpen(true)}
            >
              <Plus className="h-4 w-4 shrink-0" />
              Add customer
            </Button>
          </div>
          {addCustomerOpen && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-bg-muted/60 p-1.5 pr-1">
              <span className="text-xs text-text-secondary">Add customer:</span>
              {availableToAdd.length === 0 ? (
                <span className="text-xs text-text-muted">
                  All customers added
                </span>
              ) : (
                availableToAdd.map((c) => (
                  <Button
                    key={c.id}
                    variant="secondary"
                    size="sm"
                    onClick={() => addCustomerGroup(c.id)}
                  >
                    {c.name}
                  </Button>
                ))
              )}
              <IconButton
                aria-label="Close"
                onClick={() => setAddCustomerOpen(false)}
                className="ml-auto shrink-0"
              >
                <X className="h-4 w-4" />
              </IconButton>
            </div>
          )}
        </div>
      )}

      <Dialog
        open={revisionConflictOpen}
        onOpenChange={(open) => {
          setRevisionConflictOpen(open);
        }}
        title="Time report changed elsewhere"
      >
        <div className="flex flex-col gap-3 pt-2">
          <p className="text-sm text-text-secondary">
            This report was updated in another tab or session. Reload to load the latest version before
            you continue editing.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (viewMode === "week") reloadWeekFromServer();
                else reloadMonthFromServer();
              }}
            >
              Reload
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={commentState !== null}
        onOpenChange={(open) => {
          if (!open) setCommentState(null);
        }}
        title="Comments per day"
      >
        <div className="flex flex-col gap-3 pt-2">
          <p className="text-sm text-text-secondary">
            Add a comment for each day. Reported hours are shown for days you can comment on.
            Leave blank for no comment.
          </p>
          <div className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto">
            {commentState?.kind === "month"
              ? monthCalendarDates.map((dateStr) => {
                  const d = new Date(dateStr + "T12:00:00");
                  const dow = d.getDay();
                  const label =
                    dow === 0
                      ? TIME_REPORT_DAY_LABELS[6]
                      : TIME_REPORT_DAY_LABELS[dow - 1];
                  const dom = parseInt(dateStr.slice(8, 10), 10);
                  const reportedHours = commentDialogMonthRow?.hoursByDate[dateStr] ?? 0;
                  const canComment = reportedHours > 0;
                  const reportedDisplay = canComment
                    ? `${formatReportHoursTotal(reportedHours, "month")}h`
                    : "";
                  return (
                    <div key={dateStr} className="flex min-w-0 items-start gap-2">
                      <label
                        htmlFor={`comment-month-${dateStr}`}
                        className="flex w-[6.5rem] shrink-0 items-baseline justify-between gap-2 pt-1.5 text-xs font-medium tabular-nums text-text-secondary"
                      >
                        <span>
                          {label} {dom}
                        </span>
                        <span className="w-8 text-right text-[11px] italic font-semibold">
                          {reportedDisplay}
                        </span>
                      </label>
                      <textarea
                        id={`comment-month-${dateStr}`}
                        value={commentTextsByDate[dateStr] ?? ""}
                        onChange={(e) =>
                          setCommentTextsByDate((prev) => ({
                            ...prev,
                            [dateStr]: e.target.value,
                          }))
                        }
                        disabled={!canComment}
                        rows={1}
                        className="min-h-8 flex-1 resize-y rounded-lg border border-form bg-bg-default px-2 py-1.5 text-sm text-text-primary disabled:cursor-not-allowed disabled:bg-bg-muted/40 disabled:text-text-muted focus:border-form focus:outline-none focus:ring-2 focus:ring-[var(--color-border-form)] focus:ring-inset"
                      />
                    </div>
                  );
                })
              : TIME_REPORT_DAY_LABELS.map((label, i) => {
                  const reportedHours = commentDialogWeekEntry?.hours[i] ?? 0;
                  const canComment = reportedHours > 0;
                  const reportedDisplay = canComment
                    ? `${formatReportHoursTotal(reportedHours, "week")}h`
                    : "";
                  return (
                    <div key={i} className="flex min-w-0 items-start gap-2">
                      <label
                        htmlFor={`comment-day-${i}`}
                        className="flex w-[6.5rem] shrink-0 items-baseline justify-between gap-2 pt-1.5 text-xs font-medium tabular-nums text-text-secondary"
                      >
                        <span>
                          {label} {commentDialogWeekDayNumbers[i]}
                        </span>
                        <span className="w-8 text-right text-[11px] italic font-semibold">
                          {reportedDisplay}
                        </span>
                      </label>
                      <textarea
                        id={`comment-day-${i}`}
                        value={commentTexts[i] ?? ""}
                        onChange={(e) =>
                          setCommentTexts((prev) => ({ ...prev, [i]: e.target.value }))
                        }
                        disabled={!canComment}
                        rows={1}
                        className="min-h-8 flex-1 resize-y rounded-lg border border-form bg-bg-default px-2 py-1.5 text-sm text-text-primary disabled:cursor-not-allowed disabled:bg-bg-muted/40 disabled:text-text-muted focus:border-form focus:outline-none focus:ring-2 focus:ring-[var(--color-border-form)] focus:ring-inset"
                      />
                    </div>
                  );
                })}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCommentState(null)}
            >
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={saveComment}>
              Save
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={jiraDevOpsModal !== null}
        onOpenChange={(open) => {
          if (!open) setJiraDevOpsModal(null);
        }}
        title="Jira / DevOps / ClickUp / Work"
      >
        {jiraDevOpsModal && (() => {
          const entry = entryById.get(jiraDevOpsModal.entryId);
          if (!entry) return null;
          const jiraBusy = Boolean(
            (entry.projectId && jiraOptionsLoading[entry.projectId]) ||
              workIssueOptionsLoading[jiraDevOpsModal.customerId]
          );
          const hasSavedLink = Boolean((entry.jiraDevOpsValue ?? "").trim());
          return (
            <div className="flex flex-col gap-3 pt-2">
              {jiraBusy ? (
                <div
                  className="flex items-center gap-2 py-6 text-sm text-text-secondary"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  Laddar Jira/DevOps/ClickUp/Work…
                </div>
              ) : (
                <Combobox
                  value={jiraDevOpsModalValue}
                  onValueChange={(value) => setJiraDevOpsModalValue(value)}
                  options={getJiraDevOpsOptions(
                    jiraDevOpsModal.customerId,
                    entry.projectId
                  )}
                  placeholder="Type to search..."
                  autoFocus
                  size="sm"
                  variant="filter"
                  inputClassName="h-9 w-full"
                  emptyOptionsPlaceholder="No Jira/DevOps/ClickUp/Work"
                  renderListInPortal={false}
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 shrink">
                  {hasSavedLink && !jiraBusy ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="text-text-secondary"
                      onClick={() => {
                        updateEntryInGroup(jiraDevOpsModal.customerId, jiraDevOpsModal.entryId, {
                          jiraDevOpsValue: "",
                        });
                        setJiraDevOpsModal(null);
                      }}
                    >
                      Remove link
                    </Button>
                  ) : null}
                </div>
                <div className="ml-auto flex shrink-0 justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setJiraDevOpsModal(null)}
                  >
                    Avbryt
                  </Button>
                  <Button
                    size="sm"
                    disabled={jiraBusy}
                    onClick={() => {
                      updateEntryInGroup(jiraDevOpsModal.customerId, jiraDevOpsModal.entryId, {
                        jiraDevOpsValue: jiraDevOpsModalValue,
                      });
                      setJiraDevOpsModal(null);
                    }}
                  >
                    OK
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}
      </Dialog>

      <Dialog
        open={copyRowDialog !== null}
        onOpenChange={(open) => {
          if (!open) setCopyRowDialog(null);
        }}
        title={
          copyRowDialog?.mode === "next-month"
            ? "Copy row to next month"
            : copyRowDialog?.mode === "whole-month-next-month"
              ? "Copy whole month to next month"
              : copyRowDialog?.mode === "whole-week-next-week"
                ? "Copy whole week to next week"
                : "Copy row to current week"
        }
      >
        {copyRowDialog
          ? (() => {
              const d = copyRowDialog;
              const copyDialogBusy =
                d.mode === "current-week" || d.mode === "whole-week-next-week"
                  ? copyToWeekState === "copying"
                  : copyToNextMonthState === "copying";
              const hasHoursToCopy =
                d.mode === "current-week"
                  ? entryHasContent(d.entry)
                  : d.mode === "next-month"
                    ? mergedRowHasContent(d.row)
                    : d.mode === "whole-month-next-month"
                      ? monthMergedRowsRef.current.some(mergedRowHasContent)
                      : customerGroupsRef.current.some((g) =>
                          g.entries.some((e) => entryHasContent(e))
                        );
              const { y: nextCopyY, m: nextCopyM } = nextCalendarMonth(displayYear, displayMonth);
              const nextMonthLabel = new Date(nextCopyY, nextCopyM - 1, 1).toLocaleDateString(
                "en-US",
                { month: "long", year: "numeric" }
              );
              const nextWeek = addWeeksToYearWeekLocal(year, week, 1);
              return (
                <div className="flex flex-col gap-3 pt-2">
                  <p className="text-sm text-text-secondary">
                    {d.mode === "current-week" ? (
                      <>
                        Choose whether to include reported hours and internal comments in the
                        current calendar week (W{initialWeek} {initialYear}), or only project, role,
                        description, and Jira/DevOps with empty cells.
                      </>
                    ) : d.mode === "whole-week-next-week" ? (
                      <>
                        Choose whether to include reported hours and internal comments when copying
                        all rows in this week to the next week (W{nextWeek.week} {nextWeek.year}),
                        or only row metadata with empty cells.
                      </>
                    ) : (
                      <>
                        Choose whether to include reported hours and internal comments in{" "}
                        {d.mode === "whole-month-next-month" ? "the next calendar month for all rows" : "the next calendar month"} ({nextMonthLabel}), or only
                        project, role, description, and Jira/DevOps (&quot;Rows only&quot; — empty cells until you book time).
                      </>
                    )}
                  </p>
                  {!hasHoursToCopy && (
                    <p className="text-xs text-text-muted">
                      This row has no hours or comments, so only &quot;Rows only&quot; is available.
                    </p>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="sm:mr-auto"
                      onClick={() => setCopyRowDialog(null)}
                      disabled={copyDialogBusy}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (d.mode === "current-week") {
                          void performCopyRowToCurrentWeek(d.customerId, d.entry, false);
                        } else if (d.mode === "whole-week-next-week") {
                          void performCopyWholeWeekToNextWeek(false);
                        } else if (d.mode === "whole-month-next-month") {
                          void performCopyWholeMonthToNextMonth(false);
                        } else {
                          void performCopyMergedRowToNextMonth(d.row, false);
                        }
                      }}
                      disabled={copyDialogBusy}
                    >
                      Rows only (no hours)
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        if (d.mode === "current-week") {
                          void performCopyRowToCurrentWeek(d.customerId, d.entry, true);
                        } else if (d.mode === "whole-week-next-week") {
                          void performCopyWholeWeekToNextWeek(true);
                        } else if (d.mode === "whole-month-next-month") {
                          void performCopyWholeMonthToNextMonth(true);
                        } else {
                          void performCopyMergedRowToNextMonth(d.row, true);
                        }
                      }}
                      disabled={!hasHoursToCopy || copyDialogBusy}
                    >
                      Include hours and comments
                    </Button>
                  </div>
                </div>
              );
            })()
          : null}
      </Dialog>

      <ConfirmModal
        isOpen={pendingRowDelete !== null}
        title="Delete row"
        message="This row contains hours and/or comments. Are you sure you want to delete it?"
        confirmLabel="Delete"
        variant="danger"
        onClose={() => setPendingRowDelete(null)}
        onConfirm={() => {
          if (!pendingRowDelete) return;
          const p = pendingRowDelete;
          setPendingRowDelete(null);
          if (viewModeRef.current === "month") {
            const row = monthMergedRowsRef.current.find(
              (r) => r.customerId === p.customerId && r.rowKey === p.entryId
            );
            removeEntry(p.customerId, p.entryId, row ? mergedRowAllLineIds(row) : undefined);
          } else {
            removeEntry(p.customerId, p.entryId);
          }
        }}
      />
    </div>
  );
}
