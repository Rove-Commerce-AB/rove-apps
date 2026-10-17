"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getAllocationData } from "@/app/(app)/allocation/actions";
import type { AllocationPageData } from "@/lib/allocationPageTypes";
import { AllocationPageClient } from "./AllocationPageClient";
import type { PlannerView } from "@/lib/routes";
import {
  allocationHrefWithWeek,
  type AllocationFiltersState,
} from "@/lib/allocationUrl";

type Props = {
  view: PlannerView;
  data: AllocationPageData | null;
  error: string | null;
  year: number;
  weekFrom: number;
  weekTo: number;
  currentYear: number;
  currentWeek: number;
  initialFilters: AllocationFiltersState;
};

export function AllocationPageWrapper({
  view,
  data: initialData,
  error: initialError,
  year: initialYear,
  weekFrom: initialWeekFrom,
  weekTo: initialWeekTo,
  currentYear,
  currentWeek,
  initialFilters,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<AllocationPageData | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [year, setYear] = useState(initialYear);
  const [weekFrom, setWeekFrom] = useState(initialWeekFrom);
  const [weekTo, setWeekTo] = useState(initialWeekTo);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setData(initialData);
    setError(initialError);
    setYear(initialYear);
    setWeekFrom(initialWeekFrom);
    setWeekTo(initialWeekTo);
  }, [initialData, initialError, initialYear, initialWeekFrom, initialWeekTo]);

  const weekRangeFetchGenRef = useRef(0);

  const handleWeekRangeChange = useCallback(
    async (newYear: number, newWeekFrom: number, newWeekTo: number) => {
      const gen = ++weekRangeFetchGenRef.current;
      setLoading(true);
      try {
        const { data: nextData, error: nextError } = await getAllocationData(
          newYear,
          newWeekFrom,
          newWeekTo
        );
        if (gen !== weekRangeFetchGenRef.current) return;
        // Single update so pan offset clears in the same render as new weeks.
        setData(nextData);
        setError(nextError);
        setYear(newYear);
        setWeekFrom(newWeekFrom);
        setWeekTo(newWeekTo);
        router.replace(
          allocationHrefWithWeek(
            pathname,
            { year: newYear, from: newWeekFrom, to: newWeekTo },
            searchParams
          ),
          { scroll: false }
        );
      } finally {
        if (gen === weekRangeFetchGenRef.current) setLoading(false);
      }
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AllocationPageClient
        view={view}
        data={data}
        error={error}
        year={year}
        weekFrom={weekFrom}
        weekTo={weekTo}
        currentYear={currentYear}
        currentWeek={currentWeek}
        onWeekRangeChange={handleWeekRangeChange}
        embedWeekNavLoading={loading}
        initialFilters={initialFilters}
      />
    </div>
  );
}
