import { Suspense } from "react";
import { getCurrentYearWeek } from "@/lib/dateUtils";
import { getAllocationPageData } from "@/lib/allocationPage";
import { AllocationPageWrapper } from "@/components/AllocationPageWrapper";
import { AllocationViewportAdapter } from "@/components/AllocationViewportAdapter";
import { redirectSubcontractorToAccessDenied } from "@/lib/accessGuards";
import type { PlannerView } from "@/lib/routes";
import { readAllocationFiltersFromRecord } from "@/lib/allocationUrl";

const FALLBACK_WEEKS = 52;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function PlannerAllocationPage({
  view,
  searchParams,
}: {
  view: PlannerView;
  searchParams: SearchParams;
}) {
  await redirectSubcontractorToAccessDenied();

  const params = await searchParams;
  const { year: currentYear, week: currentWeek } = getCurrentYearWeek();

  const year =
    typeof params.year === "string" ? parseInt(params.year, 10) : currentYear;
  const fromParam =
    typeof params.from === "string" ? parseInt(params.from, 10) : null;
  const toParam =
    typeof params.to === "string" ? parseInt(params.to, 10) : null;

  const weekFrom = fromParam ?? Math.max(1, currentWeek - 2);
  const weekTo = toParam ?? ((weekFrom + FALLBACK_WEEKS - 2) % 52) + 1;
  const initialFilters = readAllocationFiltersFromRecord(params);

  let data = null;
  let error: string | null = null;

  try {
    data = await getAllocationPageData(year, weekFrom, weekTo);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load allocation data";
  }

  return (
    <Suspense fallback={null}>
      <AllocationViewportAdapter
        year={year}
        weekFrom={weekFrom}
        weekTo={weekTo}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <AllocationPageWrapper
            view={view}
            data={data}
            error={error}
            year={year}
            weekFrom={weekFrom}
            weekTo={weekTo}
            currentYear={currentYear}
            currentWeek={currentWeek}
            initialFilters={initialFilters}
          />
        </div>
      </AllocationViewportAdapter>
    </Suspense>
  );
}
