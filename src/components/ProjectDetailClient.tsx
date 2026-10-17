"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { moneyLabel } from "@/lib/currency";
import { getProjectAllocationData } from "@/app/(app)/allocation/actions";
import type { ProjectWithDetails } from "@/types";
import type { AllocationPageData } from "@/lib/allocationPageTypes";
import {
  Button,
  DetailPageHeader,
  Dialog,
  Input,
  Panel,
  PanelSectionTitle,
  PageLoading,
} from "@/components/ui";
import { moveEntireBookingAction } from "@/app/(app)/projects/[id]/actions";
import { ProjectSettingsDrawer } from "@/components/ProjectSettingsDrawer";

const AllocationPageClient = dynamic(
  () =>
    import("./AllocationPageClient").then((m) => ({
      default: m.AllocationPageClient,
    })),
  { ssr: false }
);

/** Same as Allocation page: week column 29px; left col 180px, two Tot cols 64px each in embed. */
const PLANNING_LEFT_COL_WIDTH = 180;
const PLANNING_TOT_COLS_WIDTH = 64 * 2;
const PLANNING_MIN_WEEK_WIDTH = 29;
const PLANNING_EXTRA_PADDING = 56;
const PLANNING_MIN_WEEKS = 8;
const PLANNING_MAX_WEEKS = 52;
const PLANNING_VIEWPORT_DEBOUNCE_MS = 100;

type Props = {
  project: ProjectWithDetails;
  allocationData: AllocationPageData | null;
  allocationError: string | null;
  allocationYear: number;
  allocationWeekFrom: number;
  allocationWeekTo: number;
  currentYear: number;
  currentWeek: number;
  /** Role ID -> rate per hour in the customer's billing currency. */
  allocationRates?: Record<string, number>;
  isAdmin?: boolean;
};

export function ProjectDetailClient({
  project: initial,
  allocationData,
  allocationError,
  allocationYear,
  allocationWeekFrom,
  allocationWeekTo,
  currentYear,
  currentWeek,
  allocationRates,
  isAdmin = false,
}: Props) {
  const router = useRouter();
  const [masterDataOpen, setMasterDataOpen] = useState(false);
  const [planningData, setPlanningData] = useState<AllocationPageData | null>(
    allocationData
  );
  const [planningError, setPlanningError] = useState<string | null>(
    allocationError
  );
  const [planningYear, setPlanningYear] = useState(allocationYear);
  const [planningWeekFrom, setPlanningWeekFrom] = useState(allocationWeekFrom);
  const [planningWeekTo, setPlanningWeekTo] = useState(allocationWeekTo);
  const [planningLoading, setPlanningLoading] = useState(false);
  const [showMoveBookingModal, setShowMoveBookingModal] = useState(false);
  const [moveWeeks, setMoveWeeks] = useState("1");
  const [moveForward, setMoveForward] = useState(true);
  const [moveBookingError, setMoveBookingError] = useState<string | null>(null);
  const [moveBookingSubmitting, setMoveBookingSubmitting] = useState(false);
  const planningContainerRef = useRef<HTMLDivElement>(null);
  const [planningViewportReady, setPlanningViewportReady] = useState(false);
  const planningViewportReadySetRef = useRef(false);

  const budgetHours =
    initial.budgetHours != null ? Number(initial.budgetHours) : null;
  const budgetMoney =
    initial.budgetMoney != null ? Number(initial.budgetMoney) : null;

  useEffect(() => {
    setPlanningData(allocationData);
    setPlanningError(allocationError);
    setPlanningYear(allocationYear);
    setPlanningWeekFrom(allocationWeekFrom);
    setPlanningWeekTo(allocationWeekTo);
  }, [
    allocationData,
    allocationError,
    allocationYear,
    allocationWeekFrom,
    allocationWeekTo,
  ]);

  const planningFetchGenRef = useRef(0);

  const handleWeekRangeChange = useCallback(
    async (year: number, weekFrom: number, weekTo: number) => {
      const gen = ++planningFetchGenRef.current;
      setPlanningLoading(true);
      try {
        const { data, error } = await getProjectAllocationData(
          initial.id,
          initial.customer_id ?? "",
          year,
          weekFrom,
          weekTo
        );
        if (gen !== planningFetchGenRef.current) return;
        setPlanningData(data);
        setPlanningError(error);
        setPlanningYear(year);
        setPlanningWeekFrom(weekFrom);
        setPlanningWeekTo(weekTo);
        const q = `year=${year}&from=${weekFrom}&to=${weekTo}`;
        router.replace(`/projects/${initial.id}?${q}`, { scroll: false });
      } finally {
        if (gen === planningFetchGenRef.current) {
          setPlanningLoading(false);
          setPlanningViewportReady(true);
        }
      }
    },
    [initial.id, initial.customer_id, router]
  );

  useEffect(() => {
    const el = planningContainerRef.current;
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
        planningWeekFrom <= planningWeekTo
          ? planningWeekTo - planningWeekFrom + 1
          : 52 - planningWeekFrom + 1 + planningWeekTo;

      if (clamped === currentSpan) {
        if (!planningViewportReadySetRef.current) {
          planningViewportReadySetRef.current = true;
          setPlanningViewportReady(true);
        }
        return;
      }

      const newFrom = planningWeekFrom;
      const newTo =
        planningWeekFrom + clamped - 1 <= 52
          ? planningWeekFrom + clamped - 1
          : planningWeekFrom + clamped - 1 - 52;

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        void handleWeekRangeChange(planningYear, newFrom, newTo);
      }, PLANNING_VIEWPORT_DEBOUNCE_MS);
    };

    const ro = new ResizeObserver(updateWeeks);
    ro.observe(el);
    updateWeeks();

    return () => {
      ro.disconnect();
      clearTimeout(timeoutId);
    };
  }, [planningYear, planningWeekFrom, planningWeekTo, handleWeekRangeChange]);

  const handleMoveBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const weeks = Math.max(
      1,
      Math.floor(Number(moveWeeks.replace(",", ".")) || 1)
    );
    const delta = moveForward ? weeks : -weeks;
    setMoveBookingError(null);
    setMoveBookingSubmitting(true);
    try {
      const result = await moveEntireBookingAction(initial.id, delta);
      if (result.ok) {
        setShowMoveBookingModal(false);
        setMoveWeeks("1");
        setMoveForward(true);
        router.refresh();
        if (planningData) {
          setPlanningLoading(true);
          const { data, error } = await getProjectAllocationData(
            initial.id,
            initial.customer_id ?? "",
            planningYear,
            planningWeekFrom,
            planningWeekTo
          );
          setPlanningData(data);
          setPlanningError(error);
          setPlanningLoading(false);
        }
      } else {
        setMoveBookingError(result.error ?? "Failed to move");
      }
    } finally {
      setMoveBookingSubmitting(false);
    }
  };

  const projectInitials = initial.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const budgetSummary = [
    budgetHours != null ? `${budgetHours} h` : null,
    budgetMoney != null
      ? `${String(budgetMoney).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0")} ${moneyLabel(initial.billingCurrency)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="w-full">
        <DetailPageHeader
          avatar={
            <div
              className="flex h-full w-full items-center justify-center rounded-full"
              style={{ backgroundColor: initial.color }}
              aria-hidden
            >
              <span className="text-xs font-semibold text-white">
                {projectInitials}
              </span>
            </div>
          }
          title={initial.name}
          subtitle={
            <>
              {initial.customerName}
              {budgetSummary ? (
                <span className="text-text-tertiary">
                  {" "}
                  · Budget {budgetSummary}
                </span>
              ) : null}
            </>
          }
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setMasterDataOpen(true)}
            >
              Edit in Settings
            </Button>
          }
        />

        <div ref={planningContainerRef} className="w-full">
          <Panel>
            <PanelSectionTitle
              action={
                <button
                  type="button"
                  onClick={() => {
                    setMoveBookingError(null);
                    setMoveWeeks("1");
                    setMoveForward(true);
                    setShowMoveBookingModal(true);
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-text-primary opacity-80 transition-opacity hover:bg-bg-muted/50 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-offset-1"
                  aria-label="Move entire booking"
                >
                  <ArrowRightLeft
                    className="h-3.5 w-3.5 shrink-0"
                    aria-hidden
                  />
                  <span>Move entire booking</span>
                </button>
              }
            >
              PLANNING
            </PanelSectionTitle>
            <div className="min-h-[200px] p-2">
              {planningViewportReady ? (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center py-12">
                      <PageLoading />
                    </div>
                  }
                >
                  <AllocationPageClient
                    data={planningData}
                    error={planningError}
                    year={planningYear}
                    weekFrom={planningWeekFrom}
                    weekTo={planningWeekTo}
                    currentYear={currentYear}
                    currentWeek={currentWeek}
                    embedMode={{
                      projectId: initial.id,
                      rates: allocationRates,
                      budgetHours: budgetHours ?? undefined,
                      budgetMoney: budgetMoney ?? undefined,
                    }}
                    onWeekRangeChange={handleWeekRangeChange}
                    embedWeekNavLoading={planningLoading}
                    embedShowTeamFilter
                  />
                </Suspense>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <PageLoading />
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <ProjectSettingsDrawer
        open={masterDataOpen}
        onOpenChange={setMasterDataOpen}
        project={initial}
        isAdmin={isAdmin}
      />

      <Dialog
        open={showMoveBookingModal}
        onOpenChange={(open) => {
          if (!open) setMoveBookingError(null);
          setShowMoveBookingModal(open);
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
              htmlFor="move-booking-weeks"
              className="block text-sm font-medium text-text-primary"
            >
              Number of weeks
            </label>
            <Input
              id="move-booking-weeks"
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
                  name="move-direction"
                  checked={moveForward}
                  onChange={() => setMoveForward(true)}
                  className="rounded-full border-form text-brand-signal focus:ring-brand-signal"
                />
                <span className="text-text-primary">Forward</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="move-direction"
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
              onClick={() => setShowMoveBookingModal(false)}
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
    </>
  );
}
