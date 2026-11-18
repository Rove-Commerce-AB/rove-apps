"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { compareTextSv } from "@/lib/sort";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, ExternalLink } from "lucide-react";
import { AllocationWeekNav } from "@/components/allocation/AllocationWeekNav";
import {
  Button,
  Dialog,
  Input,
  PageLoading,
  Panel,
  PanelSectionTitle,
} from "@/components/ui";
import { moveEntireBookingAction } from "@/app/(app)/projects/[id]/actions";
import { moneyLabel } from "@/lib/currency";
import { addWeeksToYearWeek } from "@/lib/dateUtils";
import type { PlannerProjectPlanningPanel } from "@/lib/plannerMultiProjectPlanningTypes";
import { projectHref } from "@/lib/routes";

const AllocationPageClient = dynamic(
  () =>
    import("./AllocationPageClient").then((m) => ({
      default: m.AllocationPageClient,
    })),
  { ssr: false }
);

/** Same metrics as ProjectDetailClient embed. */
const PLANNING_LEFT_COL_WIDTH = 180;
const PLANNING_TOT_COLS_WIDTH = 64 * 2;
const PLANNING_MIN_WEEK_WIDTH = 29;
const PLANNING_EXTRA_PADDING = 56;
const PLANNING_MIN_WEEKS = 8;
const PLANNING_MAX_WEEKS = 52;
const PLANNING_VIEWPORT_DEBOUNCE_MS = 100;

type Props = {
  header: ReactNode;
  initialPanels: PlannerProjectPlanningPanel[];
  initialError: string | null;
  year: number;
  weekFrom: number;
  weekTo: number;
  currentYear: number;
  currentWeek: number;
  emptyMessage: string;
  /** Group project panels under customer name headings (consultant planning). */
  groupByCustomer?: boolean;
  onFetchPanels: (
    year: number,
    weekFrom: number,
    weekTo: number
  ) => Promise<{
    panels: PlannerProjectPlanningPanel[];
    error: string | null;
  }>;
};

export function PlannerMultiProjectPlanning({
  header,
  initialPanels,
  initialError,
  year: initialYear,
  weekFrom: initialWeekFrom,
  weekTo: initialWeekTo,
  currentYear,
  currentWeek,
  emptyMessage,
  groupByCustomer = false,
  onFetchPanels,
}: Props) {
  const router = useRouter();
  const [panels, setPanels] = useState(initialPanels);
  const [error, setError] = useState(initialError);
  const [year, setYear] = useState(initialYear);
  const [weekFrom, setWeekFrom] = useState(initialWeekFrom);
  const [weekTo, setWeekTo] = useState(initialWeekTo);
  const [loading, setLoading] = useState(false);
  const [viewportReady, setViewportReady] = useState(false);
  const viewportReadySetRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fetchGenRef = useRef(0);

  const [moveProjectId, setMoveProjectId] = useState<string | null>(null);
  const [moveWeeks, setMoveWeeks] = useState("1");
  const [moveForward, setMoveForward] = useState(true);
  const [moveBookingError, setMoveBookingError] = useState<string | null>(null);
  const [moveBookingSubmitting, setMoveBookingSubmitting] = useState(false);

  useEffect(() => {
    setPanels(initialPanels);
    setError(initialError);
    setYear(initialYear);
    setWeekFrom(initialWeekFrom);
    setWeekTo(initialWeekTo);
  }, [
    initialPanels,
    initialError,
    initialYear,
    initialWeekFrom,
    initialWeekTo,
  ]);

  const handleWeekRangeChange = useCallback(
    async (nextYear: number, nextFrom: number, nextTo: number) => {
      const gen = ++fetchGenRef.current;
      setLoading(true);
      try {
        const result = await onFetchPanels(nextYear, nextFrom, nextTo);
        if (gen !== fetchGenRef.current) return;
        setPanels(result.panels);
        setError(result.error);
        setYear(nextYear);
        setWeekFrom(nextFrom);
        setWeekTo(nextTo);
        const q = `year=${nextYear}&from=${nextFrom}&to=${nextTo}`;
        router.replace(`?${q}`, { scroll: false });
      } finally {
        if (gen === fetchGenRef.current) {
          setLoading(false);
          setViewportReady(true);
        }
      }
    },
    [onFetchPanels, router]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const updateWeeks = () => {
      const w = el.clientWidth;
      if (w < 100) return;
      const available =
        w -
        PLANNING_LEFT_COL_WIDTH -
        PLANNING_TOT_COLS_WIDTH -
        PLANNING_EXTRA_PADDING;
      const visibleWeeks = Math.floor(available / PLANNING_MIN_WEEK_WIDTH);
      if (visibleWeeks < PLANNING_MIN_WEEKS) return;

      const clamped = Math.min(PLANNING_MAX_WEEKS, visibleWeeks);
      const currentSpan =
        weekFrom <= weekTo
          ? weekTo - weekFrom + 1
          : 52 - weekFrom + 1 + weekTo;

      if (clamped === currentSpan) {
        if (!viewportReadySetRef.current) {
          viewportReadySetRef.current = true;
          setViewportReady(true);
        }
        return;
      }

      const newFrom = weekFrom;
      const newTo =
        weekFrom + clamped - 1 <= 52
          ? weekFrom + clamped - 1
          : weekFrom + clamped - 1 - 52;

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        void handleWeekRangeChange(year, newFrom, newTo);
      }, PLANNING_VIEWPORT_DEBOUNCE_MS);
    };

    const ro = new ResizeObserver(updateWeeks);
    ro.observe(el);
    updateWeeks();

    return () => {
      ro.disconnect();
      clearTimeout(timeoutId);
    };
  }, [year, weekFrom, weekTo, handleWeekRangeChange]);

  const shiftWeeks = useCallback(
    (delta: number) => {
      const first =
        weekFrom <= weekTo
          ? { year, week: weekFrom }
          : { year, week: weekFrom };
      const last =
        weekFrom <= weekTo
          ? { year, week: weekTo }
          : { year: year + 1, week: weekTo };
      const newFirst = addWeeksToYearWeek(first.year, first.week, delta);
      const newLast = addWeeksToYearWeek(last.year, last.week, delta);
      void handleWeekRangeChange(newFirst.year, newFirst.week, newLast.week);
    },
    [year, weekFrom, weekTo, handleWeekRangeChange]
  );

  const refreshCurrentRange = useCallback(async () => {
    setLoading(true);
    try {
      const result = await onFetchPanels(year, weekFrom, weekTo);
      setPanels(result.panels);
      setError(result.error);
    } finally {
      setLoading(false);
    }
  }, [onFetchPanels, year, weekFrom, weekTo]);

  const panelGroups = useMemo(() => {
    if (!groupByCustomer) {
      return [{ customerId: "", customerName: "", panels }];
    }
    const byCustomer = new Map<
      string,
      { customerId: string; customerName: string; panels: PlannerProjectPlanningPanel[] }
    >();
    for (const panel of panels) {
      const existing = byCustomer.get(panel.customerId);
      if (existing) {
        existing.panels.push(panel);
      } else {
        byCustomer.set(panel.customerId, {
          customerId: panel.customerId,
          customerName: panel.customerName,
          panels: [panel],
        });
      }
    }
    return [...byCustomer.values()].sort((a, b) =>
      compareTextSv(a.customerName, b.customerName)
    );
  }, [groupByCustomer, panels]);

  const handleMoveBookingSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!moveProjectId) return;
    const weeks = Math.max(
      1,
      Math.floor(Number(moveWeeks.replace(",", ".")) || 1)
    );
    const delta = moveForward ? weeks : -weeks;
    setMoveBookingError(null);
    setMoveBookingSubmitting(true);
    try {
      const result = await moveEntireBookingAction(moveProjectId, delta);
      if (result.ok) {
        setMoveProjectId(null);
        setMoveWeeks("1");
        setMoveForward(true);
        router.refresh();
        await refreshCurrentRange();
      } else {
        setMoveBookingError(result.error ?? "Failed to move");
      }
    } finally {
      setMoveBookingSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}

      <div ref={containerRef} className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex shrink-0 items-center justify-end gap-1 px-1">
          <AllocationWeekNav
            onShift={shiftWeeks}
            disabled={loading}
          />
        </div>

        {error ? (
          <p className="px-1 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {!viewportReady ? (
          <div className="flex items-center justify-center py-12">
            <PageLoading />
          </div>
        ) : panels.length === 0 ? (
          <Panel>
            <PanelSectionTitle>PLANNING</PanelSectionTitle>
            <p className="px-3 pb-3 text-sm text-text-tertiary">{emptyMessage}</p>
          </Panel>
        ) : (
          panelGroups.map((group) => (
            <div
              key={group.customerId || "projects"}
              className="flex flex-col gap-3"
            >
              {groupByCustomer ? (
                <h2 className="px-1 text-heading-m text-text-primary">
                  {group.customerName}
                </h2>
              ) : null}
              {group.panels.map((panel) => {
                const budgetSummary = [
                  panel.budgetHours != null ? `${panel.budgetHours} h` : null,
                  panel.budgetMoney != null
                    ? `${String(panel.budgetMoney).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0")} ${moneyLabel(panel.billingCurrency)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <Panel key={panel.projectId}>
                    <PanelSectionTitle
                      action={
                        <div className="flex items-center gap-1">
                          <Link
                            href={projectHref(panel.projectId)}
                            title="Open project"
                            aria-label={`Open ${panel.projectName}`}
                            className="inline-flex cursor-pointer items-center justify-center rounded-sm p-1.5 text-text-primary opacity-70 transition-opacity hover:bg-bg-muted/50 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-offset-1"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              setMoveBookingError(null);
                              setMoveWeeks("1");
                              setMoveForward(true);
                              setMoveProjectId(panel.projectId);
                            }}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-text-primary opacity-80 transition-opacity hover:bg-bg-muted/50 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-offset-1"
                            aria-label={`Move entire booking for ${panel.projectName}`}
                          >
                            <ArrowRightLeft
                              className="h-3.5 w-3.5 shrink-0"
                              aria-hidden
                            />
                            <span>Move entire booking</span>
                          </button>
                        </div>
                      }
                    >
                      <span className="inline-flex min-w-0 items-baseline gap-2">
                        <span className="truncate uppercase tracking-wide">
                          {panel.projectName}
                        </span>
                        {budgetSummary ? (
                          <span className="truncate font-normal normal-case opacity-70">
                            Budget {budgetSummary}
                          </span>
                        ) : null}
                      </span>
                    </PanelSectionTitle>
                    <div className="min-h-[200px] p-2">
                      <Suspense
                        fallback={
                          <div className="flex items-center justify-center py-12">
                            <PageLoading />
                          </div>
                        }
                      >
                        <AllocationPageClient
                          data={panel.allocationData}
                          error={null}
                          year={year}
                          weekFrom={weekFrom}
                          weekTo={weekTo}
                          currentYear={currentYear}
                          currentWeek={currentWeek}
                          embedMode={{
                            projectId: panel.projectId,
                            rates: panel.rates,
                            budgetHours: panel.budgetHours ?? undefined,
                            budgetMoney: panel.budgetMoney ?? undefined,
                          }}
                          onWeekRangeChange={handleWeekRangeChange}
                          embedWeekNavLoading={loading}
                          embedShowTeamFilter
                          suppressWeekNav
                        />
                      </Suspense>
                    </div>
                  </Panel>
                );
              })}
            </div>
          ))
        )}
      </div>

      <Dialog
        open={moveProjectId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMoveBookingError(null);
            setMoveProjectId(null);
          }
        }}
        title="Move entire booking"
      >
        <form onSubmit={handleMoveBookingSubmit} className="mt-4 space-y-4">
          {moveBookingError ? (
            <p className="text-sm text-danger" role="alert">
              {moveBookingError}
            </p>
          ) : null}
          <div>
            <label
              htmlFor="multi-move-booking-weeks"
              className="block text-sm font-medium text-text-primary"
            >
              Number of weeks
            </label>
            <Input
              id="multi-move-booking-weeks"
              type="number"
              min={1}
              value={moveWeeks}
              onChange={(e) => setMoveWeeks(e.target.value || "1")}
              className="mt-1 w-24"
            />
          </div>
          <div>
            <span className="mb-2 block text-sm font-medium text-text-primary">
              Direction
            </span>
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="multi-move-direction"
                  checked={moveForward}
                  onChange={() => setMoveForward(true)}
                  className="rounded-full border-form text-brand-signal focus:ring-brand-signal"
                />
                <span className="text-text-primary">Forward</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="multi-move-direction"
                  checked={!moveForward}
                  onChange={() => setMoveForward(false)}
                  className="rounded-full border-form text-brand-signal focus:ring-brand-signal"
                />
                <span className="text-text-primary">Backward</span>
              </label>
            </div>
          </div>
          <p className="text-xs text-text-primary opacity-70">
            All allocations for this project (all people) will be moved by the
            chosen number of weeks.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setMoveProjectId(null)}
              disabled={moveBookingSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={moveBookingSubmitting}>
              {moveBookingSubmitting ? "Moving…" : "Move"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
