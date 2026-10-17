"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { allocationHrefWithWeek } from "@/lib/allocationUrl";

const LEFT_COL_WIDTH = 300;
const MIN_WEEK_WIDTH = 29;
const EXTRA_PADDING = 56;
const MIN_WEEKS = 8;
const MAX_WEEKS = 52;
const RESIZE_DEBOUNCE_MS = 100;

const AllocationViewportWeeksContext = createContext<number | null>(null);

/** Visible week count from viewport width; null until first layout measure. */
export function useAllocationViewportWeekCount(): number | null {
  return useContext(AllocationViewportWeeksContext);
}

function weekSpan(weekFrom: number, weekTo: number): number {
  return weekFrom <= weekTo
    ? weekTo - weekFrom + 1
    : 52 - weekFrom + 1 + weekTo;
}

function weeksFromWidth(width: number): number | null {
  if (width < 100) return null;
  const available = width - LEFT_COL_WIDTH - EXTRA_PADDING;
  const visibleWeeks = Math.floor(available / MIN_WEEK_WIDTH);
  if (visibleWeeks < MIN_WEEKS) return null;
  return Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, visibleWeeks));
}

type Props = {
  year: number;
  weekFrom: number;
  weekTo: number;
  children: React.ReactNode;
};

/**
 * Fits week count to viewport width. Measures in useLayoutEffect and exposes the
 * count via context so the grid can slice weeks before first paint — otherwise
 * the default ~52-week range paints crushed, then jumps after URL replace.
 */
export function AllocationViewportAdapter({
  year,
  weekFrom,
  weekTo,
  children,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleWeekCount, setVisibleWeekCount] = useState<number | null>(null);
  const yearRef = useRef(year);
  const weekFromRef = useRef(weekFrom);
  const weekToRef = useRef(weekTo);
  yearRef.current = year;
  weekFromRef.current = weekFrom;
  weekToRef.current = weekTo;

  const applyWeeksToUrl = useCallback(
    (clamped: number) => {
      const from = weekFromRef.current;
      const to = weekToRef.current;
      const y = yearRef.current;
      const current = weekSpan(from, to);
      if (clamped === current) return;

      const newTo =
        from + clamped - 1 <= 52 ? from + clamped - 1 : from + clamped - 1 - 52;

      router.replace(
        allocationHrefWithWeek(
          pathname,
          { year: y, from, to: newTo },
          searchParams
        )
      );
    },
    [pathname, router, searchParams]
  );

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let resizeTimeout: ReturnType<typeof setTimeout> | undefined;

    const measure = (updateUrl: boolean) => {
      const next = weeksFromWidth(el.clientWidth);
      if (next == null) return;
      setVisibleWeekCount(next);
      if (updateUrl) applyWeeksToUrl(next);
    };

    // Sync before paint so consumers can slice weeks on the first visible frame.
    measure(true);

    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => measure(true), RESIZE_DEBOUNCE_MS);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      clearTimeout(resizeTimeout);
    };
  }, [applyWeeksToUrl]);

  return (
    <AllocationViewportWeeksContext.Provider value={visibleWeekCount}>
      <div
        ref={containerRef}
        className={`flex min-h-0 flex-1 flex-col ${
          visibleWeekCount == null ? "opacity-0" : ""
        }`}
      >
        {children}
      </div>
    </AllocationViewportWeeksContext.Provider>
  );
}
