"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PointerEvent,
} from "react";
import {
  createWorkIssueAction,
  updateWorkIssueScheduleAction,
  updateWorkIssueTypeAction,
} from "../../actions";
import { getCalendarHolidays } from "@/lib/calendarHolidaysClient";
import { getCalendars } from "@/lib/calendarsClient";
import {
  collectBoardComponents,
  collectOwnerFilterPeople,
  columnIssueGroups,
  issueMatchesBoardFilters,
  type WorkBoardGroupBy,
  type WorkBoardPriorityFilterId,
} from "@/lib/workBoardView";
import type {
  WorkBoardView,
  WorkIssue,
  WorkIssueType,
  WorkSprint,
} from "@/lib/workTypes";
import { workSprintLabel } from "@/lib/workSprintLabel";
import { WorkAddIssueInline } from "./WorkAddIssueInline";
import {
  WorkCardTypeBadge,
  WorkColumnGroupHeader,
} from "./WorkBoardViewControls";
import { WorkViewToolbar } from "./WorkViewToolbar";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const ROW_H = 36;
const GROUP_HEADER_H = 28;
const LABEL_W = 220;

function timelineIssueTree(
  issues: WorkIssue[]
): { issue: WorkIssue; depth: number }[] {
  const parents = new Map<string, WorkIssue[]>();
  const roots: WorkIssue[] = [];
  for (const issue of issues) {
    const parent = issue.relations.parent;
    if (parent && issues.some((row) => row.id === parent.id)) {
      const list = parents.get(parent.id) ?? [];
      list.push(issue);
      parents.set(parent.id, list);
    } else {
      roots.push(issue);
    }
  }
  const ordered: { issue: WorkIssue; depth: number }[] = [];
  function walk(issue: WorkIssue, depth: number) {
    ordered.push({ issue, depth });
    for (const child of parents.get(issue.id) ?? []) {
      walk(child, depth + 1);
    }
  }
  for (const root of roots) walk(root, 0);
  return ordered;
}

function sortSprints(sprints: WorkSprint[]) {
  return sprints.slice().sort((a, b) => a.number - b.number);
}

function parseDay(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`).getTime();
}

function formatDay(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number) {
  return formatDay(parseDay(iso) + days * DAY_MS);
}

function explicitScheduleRange(issue: WorkIssue) {
  if (issue.startDate && issue.dueDate) {
    return { start: issue.startDate, end: issue.dueDate };
  }
  if (issue.startDate) {
    return { start: issue.startDate, end: issue.startDate };
  }
  if (issue.dueDate) {
    return { start: issue.dueDate, end: issue.dueDate };
  }
  return null;
}

function sprintHintRange(issue: WorkIssue, sprints: WorkSprint[]) {
  if (explicitScheduleRange(issue)) return null;
  const sprint = sprints.find((row) => row.id === issue.sprintId);
  if (!sprint) return null;
  return { start: sprint.startsOn, end: sprint.endsOn };
}

function orderedRange(a: string, b: string) {
  return parseDay(a) <= parseDay(b)
    ? { start: a, end: b }
    : { start: b, end: a };
}

export function WorkTimelineView({
  board,
  issues,
  sprints,
  onIssuesChange,
  onOpenIssue,
  onError,
  onChanged,
}: {
  board: WorkBoardView;
  issues: WorkIssue[];
  sprints: WorkSprint[];
  onIssuesChange: (issues: WorkIssue[]) => void;
  onOpenIssue: (issueId: string, options?: { tab?: string }) => void;
  onError: (message: string) => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [dayShift, setDayShift] = useState(0);
  const [panning, setPanning] = useState(false);
  const [focusedSprintId, setFocusedSprintId] = useState<string | null>(null);
  const [ownerFilterIds, setOwnerFilterIds] = useState<string[]>([]);
  const [typeFilterIds, setTypeFilterIds] = useState<WorkIssueType[]>([]);
  const [componentFilterIds, setComponentFilterIds] = useState<string[]>([]);
  const [priorityFilterIds, setPriorityFilterIds] = useState<
    WorkBoardPriorityFilterId[]
  >([]);
  const [groupBy, setGroupBy] = useState<WorkBoardGroupBy>("none");
  const [addingIssue, setAddingIssue] = useState(false);
  const dragRef = useRef<{
    issueId: string;
    mode: "move" | "start" | "end";
    originX: number;
    originStart: string;
    originEnd: string;
    start: string;
    end: string;
  } | null>(null);
  const createRef = useRef<{
    issueId: string;
    originDay: string;
  } | null>(null);
  const [createDraft, setCreateDraft] = useState<{
    issueId: string;
    start: string;
    end: string;
  } | null>(null);
  const [dragTip, setDragTip] = useState<{
    start: string;
    end: string;
    x: number;
    y: number;
  } | null>(null);
  const [holidayByDate, setHolidayByDate] = useState<Map<string, string>>(
    () => new Map()
  );
  const panRef = useRef<{
    pointerId: number;
    originX: number;
    originShift: number;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const calendars = await getCalendars();
        const calendar =
          calendars.find((row) => row.country_code.toUpperCase() === "SE") ??
          calendars[0];
        if (!calendar || !alive) return;
        const rows = await getCalendarHolidays(calendar.id);
        if (!alive) return;
        setHolidayByDate(
          new Map(
            rows.map((row) => [row.holiday_date.slice(0, 10), row.name] as const)
          )
        );
      } catch {
        /* Timeline still works without holiday shading */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const orderedSprints = useMemo(() => sortSprints(sprints), [sprints]);
  const current = sprints.find((sprint) => sprint.status === "current") ?? null;
  const focusedSprint =
    orderedSprints.find((sprint) => sprint.id === focusedSprintId) ??
    current ??
    orderedSprints[orderedSprints.length - 1] ??
    null;

  const boardFilters = useMemo(
    () => ({
      ownerIds: ownerFilterIds,
      typeIds: typeFilterIds,
      componentIds: componentFilterIds,
      priorityIds: priorityFilterIds,
      sprintIds: [] as const,
    }),
    [ownerFilterIds, typeFilterIds, componentFilterIds, priorityFilterIds]
  );
  const filteredIssues = useMemo(
    () => issues.filter((issue) => issueMatchesBoardFilters(issue, boardFilters)),
    [issues, boardFilters]
  );
  const issueGroups = useMemo(
    () => columnIssueGroups(filteredIssues, groupBy),
    [filteredIssues, groupBy]
  );
  const visibleRows = useMemo(() => {
    const rows: {
      key: string;
      kind: "group" | "issue";
      group?: (typeof issueGroups)[number];
      issue?: WorkIssue;
      depth?: number;
    }[] = [];
    for (const group of issueGroups) {
      if (groupBy !== "none") {
        rows.push({ key: `g-${group.key}`, kind: "group", group });
      }
      for (const { issue, depth } of timelineIssueTree(group.issues)) {
        rows.push({
          key: `${group.key}-${issue.id}`,
          kind: "issue",
          issue,
          depth,
        });
      }
    }
    return rows;
  }, [issueGroups, groupBy]);
  const ownerPeople = useMemo(
    () => collectOwnerFilterPeople(board.people, issues),
    [board.people, issues]
  );
  const filterComponents = useMemo(
    () => collectBoardComponents(board.components, issues),
    [board.components, issues]
  );

  // Anchor the visible window on the current sprint (or today). Selecting a
  // sprint in the picker only highlights — it must not jump the calendar.
  const baseRange = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const anchor = startOfWeekMondayUtc(
      parseDay(current?.startsOn ?? today)
    );
    return {
      startMs: anchor,
      endMs: anchor + 10 * WEEK_MS - DAY_MS,
    };
  }, [current?.startsOn]);

  const range = useMemo(
    () => ({
      startMs: baseRange.startMs + dayShift * DAY_MS,
      endMs: baseRange.endMs + dayShift * DAY_MS,
    }),
    [baseRange, dayShift]
  );

  function goToSprint(sprint: WorkSprint) {
    setFocusedSprintId(sprint.id);
  }

  function onHeaderPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originShift: dayShift,
    };
    setPanning(true);
  }

  function onHeaderPointerMove(event: PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const deltaDays = Math.round((pan.originX - event.clientX) / pxPerDay);
    setDayShift(pan.originShift + deltaDays);
  }

  function onHeaderPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    setPanning(false);
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }

  const dayCount = Math.max(
    1,
    Math.round((range.endMs - range.startMs) / DAY_MS) + 1
  );
  const pxPerDay = Math.max(18, Math.min(36, 900 / dayCount));
  const chartW = dayCount * pxPerDay;
  const todayMs = parseDay(new Date().toISOString().slice(0, 10));

  function xFor(iso: string) {
    return ((parseDay(iso) - range.startMs) / DAY_MS) * pxPerDay;
  }

  function widthFor(start: string, end: string) {
    return Math.max(pxPerDay, ((parseDay(end) - parseDay(start)) / DAY_MS + 1) * pxPerDay);
  }

  function persistSchedule(issueId: string, start: string, end: string) {
    onIssuesChange(
      issues.map((issue) =>
        issue.id === issueId
          ? { ...issue, startDate: start, dueDate: end }
          : issue
      )
    );
    startTransition(async () => {
      const result = await updateWorkIssueScheduleAction(
        board.id,
        issueId,
        start,
        end
      );
      if (!result.ok) {
        onError(result.error);
        return;
      }
      onChanged();
    });
  }

  function commitType(issueId: string, issueType: WorkIssueType) {
    onIssuesChange(
      issues.map((issue) =>
        issue.id === issueId ? { ...issue, issueType } : issue
      )
    );
    void updateWorkIssueTypeAction(board.id, issueId, issueType).then(
      (result) => {
        if (result.ok) return;
        onError(result.error);
        onChanged();
      }
    );
  }

  const createSprintId =
    focusedSprint?.status === "current" || focusedSprint?.status === "next"
      ? focusedSprint.id
      : null;

  async function createIssue(input: {
    title: string;
    issueType: WorkIssueType;
  }): Promise<boolean> {
    const result = await createWorkIssueAction({
      boardId: board.id,
      title: input.title,
      issueType: input.issueType,
      status: board.statuses[0]?.id,
      sprintId: createSprintId,
    });
    if (!result.ok) {
      onError(result.error);
      return false;
    }
    onChanged();
    return true;
  }

  function dayAtClientX(track: HTMLElement, clientX: number) {
    const rect = track.getBoundingClientRect();
    const x = clientX - rect.left;
    const dayIndex = Math.max(
      0,
      Math.min(dayCount - 1, Math.floor(x / pxPerDay))
    );
    return formatDay(range.startMs + dayIndex * DAY_MS);
  }

  function onCreatePointerDown(
    event: PointerEvent<HTMLDivElement>,
    issue: WorkIssue
  ) {
    if (pending || explicitScheduleRange(issue)) return;
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-timeline-bar]")) return;
    event.preventDefault();
    event.stopPropagation();
    const day = dayAtClientX(event.currentTarget, event.clientX);
    createRef.current = { issueId: issue.id, originDay: day };
    setCreateDraft({ issueId: issue.id, start: day, end: day });
    setDragTip({
      start: day,
      end: day,
      x: event.clientX,
      y: event.clientY,
    });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onCreatePointerMove(event: PointerEvent<HTMLDivElement>) {
    const create = createRef.current;
    if (!create) return;
    const day = dayAtClientX(event.currentTarget, event.clientX);
    const rangeDays = orderedRange(create.originDay, day);
    setCreateDraft({
      issueId: create.issueId,
      start: rangeDays.start,
      end: rangeDays.end,
    });
    setDragTip({
      start: rangeDays.start,
      end: rangeDays.end,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function onCreatePointerUp(event: PointerEvent<HTMLDivElement>) {
    const create = createRef.current;
    if (!create) return;
    const day = dayAtClientX(event.currentTarget, event.clientX);
    const rangeDays = orderedRange(create.originDay, day);
    createRef.current = null;
    setCreateDraft(null);
    setDragTip(null);
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    persistSchedule(create.issueId, rangeDays.start, rangeDays.end);
  }

  function applyBarDrag(clientX: number) {
    const drag = dragRef.current;
    if (!drag) return null;
    const deltaDays = Math.round((clientX - drag.originX) / pxPerDay);
    let start = drag.originStart;
    let end = drag.originEnd;
    if (drag.mode === "move") {
      start = addDaysIso(drag.originStart, deltaDays);
      end = addDaysIso(drag.originEnd, deltaDays);
    } else if (drag.mode === "start") {
      start = addDaysIso(drag.originStart, deltaDays);
      if (parseDay(start) > parseDay(end)) start = end;
    } else {
      end = addDaysIso(drag.originEnd, deltaDays);
      if (parseDay(end) < parseDay(start)) end = start;
    }
    drag.start = start;
    drag.end = end;
    return { start, end };
  }

  function onBarPointerDown(
    event: PointerEvent,
    issue: WorkIssue,
    mode: "move" | "start" | "end",
    start: string,
    end: string
  ) {
    if (pending) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = {
      issueId: issue.id,
      mode,
      originX: event.clientX,
      originStart: start,
      originEnd: end,
      start,
      end,
    };
    setDragTip({
      start,
      end,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function onBarPointerMove(event: PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const next = applyBarDrag(event.clientX);
    if (!next) return;
    onIssuesChange(
      issues.map((issue) =>
        issue.id === drag.issueId
          ? { ...issue, startDate: next.start, dueDate: next.end }
          : issue
      )
    );
    setDragTip({
      start: next.start,
      end: next.end,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function onBarPointerUp(event: PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const next = applyBarDrag(event.clientX) ?? {
      start: drag.start,
      end: drag.end,
    };
    dragRef.current = null;
    setDragTip(null);
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    if (next.start === drag.originStart && next.end === drag.originEnd) return;
    persistSchedule(drag.issueId, next.start, next.end);
  }

  const monthBands = useMemo(() => {
    const bands: { key: string; label: string; left: number; width: number }[] =
      [];
    let cursor = startOfMonthUtc(range.startMs);
    while (cursor <= range.endMs) {
      const next = addMonthsUtc(cursor, 1);
      const leftMs = Math.max(cursor, range.startMs);
      const rightMs = Math.min(next - DAY_MS, range.endMs);
      if (rightMs >= leftMs) {
        bands.push({
          key: formatDay(cursor),
          label: monthLabel(cursor),
          left: ((leftMs - range.startMs) / DAY_MS) * pxPerDay,
          width: ((rightMs - leftMs) / DAY_MS + 1) * pxPerDay,
        });
      }
      cursor = next;
    }
    return bands;
  }, [range.startMs, range.endMs, pxPerDay]);

  const weekStarts = useMemo(() => {
    const days: number[] = [];
    let cursor = startOfWeekMondayUtc(range.startMs);
    if (cursor < range.startMs) cursor += 7 * DAY_MS;
    while (cursor <= range.endMs) {
      days.push(cursor);
      cursor += 7 * DAY_MS;
    }
    return days;
  }, [range.startMs, range.endMs]);

  const monthStarts = useMemo(() => {
    const days: number[] = [];
    let cursor = startOfMonthUtc(range.startMs);
    if (cursor < range.startMs) cursor = addMonthsUtc(cursor, 1);
    while (cursor <= range.endMs) {
      days.push(cursor);
      cursor = addMonthsUtc(cursor, 1);
    }
    return days;
  }, [range.startMs, range.endMs]);

  const dayColumns = useMemo(() => {
    const columns: {
      iso: string;
      ms: number;
      left: number;
      dayOfMonth: number;
      weekday: string;
      isWeekend: boolean;
      isHoliday: boolean;
      holidayName: string | null;
      isNonWorking: boolean;
    }[] = [];
    for (let i = 0; i < dayCount; i++) {
      const ms = range.startMs + i * DAY_MS;
      const iso = formatDay(ms);
      const dow = new Date(ms).getUTCDay();
      const isWeekend = dow === 0 || dow === 6;
      const holidayName = holidayByDate.get(iso) ?? null;
      const isHoliday = holidayName != null;
      columns.push({
        iso,
        ms,
        left: i * pxPerDay,
        dayOfMonth: new Date(ms).getUTCDate(),
        weekday: weekdayShort(ms),
        isWeekend,
        isHoliday,
        holidayName,
        isNonWorking: isWeekend || isHoliday,
      });
    }
    return columns;
  }, [dayCount, range.startMs, pxPerDay, holidayByDate]);

  const headerH = 56;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {dragTip ? (
        <div
          className="pointer-events-none fixed z-[100] rounded-md bg-text-primary px-2 py-1 text-[12px] font-medium tabular-nums text-bg-default shadow-md"
          style={{
            left: dragTip.x + 14,
            top: Math.max(8, dragTip.y - 36),
          }}
        >
          {formatScheduleTip(dragTip.start, dragTip.end)}
        </div>
      ) : null}
      <div className="mb-2 shrink-0">
        <WorkViewToolbar
          sprints={orderedSprints}
          selectedSprintIds={focusedSprint?.id ? [focusedSprint.id] : []}
          onSelectedSprintIdsChange={(ids) => {
            const sprintId = ids[ids.length - 1];
            const sprint = orderedSprints.find((row) => row.id === sprintId);
            if (sprint) goToSprint(sprint);
          }}
          filters={{
            people: ownerPeople,
            components: filterComponents,
            ownerFilterIds,
            onOwnerFilterChange: setOwnerFilterIds,
            typeFilterIds,
            onTypeFilterChange: setTypeFilterIds,
            componentFilterIds,
            onComponentFilterChange: setComponentFilterIds,
            priorityFilterIds,
            onPriorityFilterChange: setPriorityFilterIds,
            groupBy,
            onGroupByChange: setGroupBy,
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border-subtle">
        <div
          className="relative"
          style={{
            minWidth: LABEL_W + chartW,
            minHeight:
              headerH +
              Math.max(
                ROW_H,
                visibleRows.reduce(
                  (sum, row) =>
                    sum + (row.kind === "group" ? GROUP_HEADER_H : ROW_H),
                  0
                )
              ),
          }}
        >
          <div
            className="sticky top-0 z-20 flex border-b border-border-subtle bg-bg-default"
            style={{ height: headerH }}
          >
            <div
              className="sticky left-0 z-30 flex shrink-0 items-end justify-between gap-1 border-r border-border-subtle bg-bg-default px-2 pb-2 text-label-s text-text-secondary"
              style={{ width: LABEL_W }}
            >
              <span>Issue</span>
              {!addingIssue ? (
                <WorkAddIssueInline
                  iconOnly
                  disabled={pending}
                  buttonClassName="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-muted hover:text-text-primary disabled:opacity-50"
                  onOpenChange={(open) => {
                    if (open) setAddingIssue(true);
                  }}
                  onCreate={createIssue}
                />
              ) : null}
            </div>
            <div
              className={`relative touch-none select-none ${
                panning ? "cursor-grabbing" : "cursor-grab"
              }`}
              style={{ width: chartW, height: headerH }}
              title="Drag to pan timeline"
              onPointerDown={onHeaderPointerDown}
              onPointerMove={onHeaderPointerMove}
              onPointerUp={onHeaderPointerUp}
              onPointerCancel={onHeaderPointerUp}
            >
              {monthBands.map((band) => (
                <div
                  key={band.key}
                  className="absolute top-0 flex h-6 items-center border-r border-[var(--color-border-default)] px-1.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary"
                  style={{ left: band.left, width: band.width }}
                >
                  <span className="truncate">{band.label}</span>
                </div>
              ))}
              {dayColumns.map((day) => (
                <div
                  key={`hd-${day.iso}`}
                  className={`absolute bottom-0 top-6 flex flex-col items-center justify-end pb-1 ${
                    day.isNonWorking ? "bg-bg-muted/70" : ""
                  }`}
                  style={{ left: day.left, width: pxPerDay }}
                  title={dayHeaderTitle(day)}
                >
                  <span
                    className={`text-[9px] leading-none ${
                      day.isNonWorking
                        ? "text-text-tertiary"
                        : "text-text-muted"
                    }`}
                  >
                    {day.weekday}
                  </span>
                  <span
                    className={`mt-0.5 text-[10px] font-medium tabular-nums leading-none ${
                      day.isHoliday
                        ? "text-text-secondary"
                        : day.isWeekend
                          ? "text-text-tertiary"
                          : "text-text-secondary"
                    }`}
                  >
                    {day.dayOfMonth}
                  </span>
                </div>
              ))}
              {weekStarts.map((ms) => (
                <div
                  key={`hw-${ms}`}
                  className="absolute bottom-0 top-6 z-[1] w-px bg-border-subtle"
                  style={{ left: ((ms - range.startMs) / DAY_MS) * pxPerDay }}
                />
              ))}
              {monthStarts.map((ms) => (
                <div
                  key={`hm-${ms}`}
                  className="absolute inset-y-0 z-[1] w-px bg-[var(--color-border-strong)]"
                  style={{ left: ((ms - range.startMs) / DAY_MS) * pxPerDay }}
                />
              ))}
            </div>
          </div>

          {addingIssue ? (
            <div className="sticky left-0 z-10 border-b border-border-subtle bg-bg-default px-2 py-1.5">
              <WorkAddIssueInline
                open
                disabled={pending}
                className="max-w-md"
                onOpenChange={setAddingIssue}
                onCreate={createIssue}
              />
            </div>
          ) : null}

          <div
            className="pointer-events-none absolute bottom-0"
            style={{ top: headerH, left: LABEL_W, width: chartW }}
          >
            {dayColumns.map((day) =>
              day.isNonWorking ? (
                <div
                  key={`off-${day.iso}`}
                  className="absolute inset-y-0 bg-bg-muted/55"
                  style={{ left: day.left, width: pxPerDay }}
                />
              ) : null
            )}
            {weekStarts.map((ms) => (
              <div
                key={`gw-${ms}`}
                className="absolute inset-y-0 w-px bg-border-subtle"
                style={{ left: ((ms - range.startMs) / DAY_MS) * pxPerDay }}
              />
            ))}
            {monthStarts.map((ms) => (
              <div
                key={`gm-${ms}`}
                className="absolute inset-y-0 w-px bg-[var(--color-border-strong)]"
                style={{ left: ((ms - range.startMs) / DAY_MS) * pxPerDay }}
              />
            ))}
            {sprints.map((sprint) => {
              const left = xFor(sprint.startsOn);
              const width = widthFor(sprint.startsOn, sprint.endsOn);
              const isFocused = focusedSprint?.id === sprint.id;
              return (
                <div
                  key={sprint.id}
                  className={`absolute inset-y-0 border-x ${
                    isFocused
                      ? "bg-interactive-primary/14 border-interactive-primary/45"
                      : sprint.status === "current"
                        ? "bg-interactive-primary/6 border-interactive-primary/20"
                        : sprint.status === "next"
                          ? "bg-bg-muted/60 border-border-subtle"
                          : "bg-transparent border-border-subtle/50"
                  }`}
                  style={{ left, width }}
                  title={workSprintLabel(sprint)}
                />
              );
            })}
            {todayMs >= range.startMs && todayMs <= range.endMs ? (
              <div
                className="absolute inset-y-0 z-[1] w-0.5 bg-danger/80"
                style={{ left: ((todayMs - range.startMs) / DAY_MS) * pxPerDay }}
              />
            ) : null}
          </div>

          {visibleRows.map((row) => {
            if (row.kind === "group" && row.group) {
              return (
                <div
                  key={row.key}
                  className="relative flex border-b border-border-subtle/70 bg-bg-muted/40"
                  style={{ height: GROUP_HEADER_H }}
                >
                  <div
                    className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border-subtle bg-bg-muted/40 px-3"
                    style={{ width: LABEL_W }}
                  >
                    <WorkColumnGroupHeader
                      groupBy={groupBy}
                      group={row.group}
                      showEstimates={board.showEstimates}
                      showReportedTime={board.showReportedTime}
                      estimateUnit={board.estimateUnit}
                      billingCurrency={board.billingCurrency}
                    />
                  </div>
                  <div style={{ width: chartW, height: GROUP_HEADER_H }} />
                </div>
              );
            }

            const issue = row.issue!;
            const depth = row.depth ?? 0;
            const explicit = explicitScheduleRange(issue);
            const draft =
              createDraft?.issueId === issue.id ? createDraft : null;
            const bar = explicit ?? draft;
            const hint = sprintHintRange(issue, sprints);
            const sprint = sprints.find((rowSprint) => rowSprint.id === issue.sprintId);
            const overflow =
              bar &&
              sprint &&
              (parseDay(bar.start) < parseDay(sprint.startsOn) ||
                parseDay(bar.end) > parseDay(sprint.endsOn));
            const canCreate = !explicit && !pending;
            return (
              <div
                key={row.key}
                className="relative flex border-b border-border-subtle/70"
                style={{ height: ROW_H }}
              >
                <div
                  className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 truncate border-r border-border-subtle bg-bg-default px-2"
                  style={{ width: LABEL_W, paddingLeft: 8 + depth * 12 }}
                >
                  <WorkCardTypeBadge
                    issueType={issue.issueType}
                    onChange={(issueType) => commitType(issue.id, issueType)}
                  />
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 truncate text-left text-xs text-text-primary hover:text-text-primary"
                    onClick={() => onOpenIssue(issue.id)}
                  >
                    <span className="shrink-0 text-label-s tabular-nums text-text-tertiary">
                      {issue.key}
                    </span>
                    <span className="min-w-0 truncate">{issue.title}</span>
                  </button>
                </div>
                <div
                  className={`relative ${canCreate ? "cursor-crosshair" : ""}`}
                  style={{ width: chartW, height: ROW_H }}
                  onPointerDown={
                    canCreate
                      ? (event) => onCreatePointerDown(event, issue)
                      : undefined
                  }
                  onPointerMove={canCreate ? onCreatePointerMove : undefined}
                  onPointerUp={canCreate ? onCreatePointerUp : undefined}
                  title={
                    canCreate
                      ? "Drag on the calendar to set start and due dates"
                      : undefined
                  }
                >
                  {hint ? (
                    <div
                      className="pointer-events-none absolute top-2 z-0 h-5 rounded-md border border-dashed border-border-strong bg-bg-muted/70"
                      style={{
                        left: xFor(hint.start),
                        width: widthFor(hint.start, hint.end),
                      }}
                      title={`Sprint ${hint.start} → ${hint.end}`}
                    />
                  ) : null}
                  {bar ? (
                    <div
                      data-timeline-bar
                      className={`absolute top-2 z-[1] h-5 rounded-md ${
                        overflow
                          ? "bg-danger/80"
                          : draft && !explicit
                            ? "bg-interactive-primary/70"
                            : "bg-interactive-primary"
                      } ${pending ? "opacity-70" : ""}`}
                      style={{
                        left: xFor(bar.start),
                        width: widthFor(bar.start, bar.end),
                      }}
                      onPointerDown={
                        explicit
                          ? (event) =>
                              onBarPointerDown(
                                event,
                                issue,
                                "move",
                                bar.start,
                                bar.end
                              )
                          : undefined
                      }
                      onPointerMove={explicit ? onBarPointerMove : undefined}
                      onPointerUp={explicit ? onBarPointerUp : undefined}
                      title={`${bar.start} → ${bar.end}${
                        overflow ? " (outside sprint)" : ""
                      }`}
                    >
                      {explicit ? (
                        <>
                          <span
                            className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l-md bg-black/20"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              onBarPointerDown(
                                event,
                                issue,
                                "start",
                                bar.start,
                                bar.end
                              );
                            }}
                          />
                          <span
                            className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r-md bg-black/20"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              onBarPointerDown(
                                event,
                                issue,
                                "end",
                                bar.start,
                                bar.end
                              );
                            }}
                          />
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function startOfWeekMondayUtc(ms: number) {
  const date = new Date(ms);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + diff
  );
}

function startOfMonthUtc(ms: number) {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function addMonthsUtc(ms: number, months: number) {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
}

function monthLabel(ms: number) {
  return new Date(ms).toLocaleString("sv-SE", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function weekdayShort(ms: number) {
  return new Date(ms).toLocaleString("sv-SE", {
    weekday: "narrow",
    timeZone: "UTC",
  });
}

function dayHeaderTitle(day: {
  iso: string;
  isWeekend: boolean;
  holidayName: string | null;
}) {
  const base = new Date(`${day.iso}T00:00:00.000Z`).toLocaleDateString("sv-SE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  if (day.holidayName) return `${base} · ${day.holidayName}`;
  if (day.isWeekend) return `${base} · Helg`;
  return base;
}

function formatTipDay(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("sv-SE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function formatScheduleTip(start: string, end: string) {
  if (start === end) return formatTipDay(start);
  return `${formatTipDay(start)} → ${formatTipDay(end)}`;
}
