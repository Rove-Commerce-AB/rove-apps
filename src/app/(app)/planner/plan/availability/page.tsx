import { Suspense } from "react";
import { AllocationViewportAdapter } from "@/components/AllocationViewportAdapter";
import { PlannerAvailabilityClient } from "@/components/PlannerAvailabilityClient";
import { redirectSubcontractorToAccessDenied } from "@/lib/accessGuards";
import { readAllocationFiltersFromRecord } from "@/lib/allocationUrl";
import {
  getCurrentYearWeek,
  getISOWeekDateRange,
} from "@/lib/dateUtils";
import { getPlannerLeavePageData } from "@/lib/plannerLeave";

export const dynamic = "force-dynamic";

/** Same default window as other Planner grids (viewport then clamps). */
const FALLBACK_WEEKS = 52;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekSpan(weekFrom: number, weekTo: number): number {
  return weekFrom <= weekTo
    ? weekTo - weekFrom + 1
    : 52 - weekFrom + 1 + weekTo;
}

export default async function PlannerAvailabilityPage({ searchParams }: Props) {
  await redirectSubcontractorToAccessDenied();

  const params = await searchParams;
  const { year: nowYear, week: nowWeek } = getCurrentYearWeek();

  const year =
    typeof params.year === "string" ? parseInt(params.year, 10) : nowYear;
  const fromParam =
    typeof params.from === "string" ? parseInt(params.from, 10) : null;
  const toParam =
    typeof params.to === "string" ? parseInt(params.to, 10) : null;

  // Match Consultant/Customer/Project default window.
  const weekFrom = fromParam ?? Math.max(1, nowWeek - 2);
  const weekTo = toParam ?? ((weekFrom + FALLBACK_WEEKS - 2) % 52) + 1;

  // One day column per week column in the other grids.
  const dayCount = weekSpan(weekFrom, weekTo);
  const weekMonday = getISOWeekDateRange(year, weekFrom).start;
  // Optional day-level pan offset (`start`); otherwise Monday of weekFrom.
  const startParam =
    typeof params.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.start)
      ? params.start
      : null;
  const fromDate = startParam ?? weekMonday;
  const toDate = addDaysYmd(fromDate, dayCount - 1);

  const initialFilters = readAllocationFiltersFromRecord(params);

  let data = null;
  let error: string | null = null;
  try {
    data = await getPlannerLeavePageData({ fromDate, toDate });
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load availability";
  }

  return (
    <Suspense fallback={null}>
      <AllocationViewportAdapter
        year={year}
        weekFrom={weekFrom}
        weekTo={weekTo}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <PlannerAvailabilityClient
            initialData={data}
            error={error}
            year={year}
            weekFrom={weekFrom}
            weekTo={weekTo}
            fromDate={fromDate}
            toDate={toDate}
            initialFilters={initialFilters}
          />
        </div>
      </AllocationViewportAdapter>
    </Suspense>
  );
}
