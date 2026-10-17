"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { allocationHrefWithWeek } from "@/lib/allocationUrl";

const LEFT_COL_WIDTH = 300;
const MIN_WEEK_WIDTH = 29;
const EXTRA_PADDING = 56;
const MIN_WEEKS = 8;
const MAX_WEEKS = 52;
const DEBOUNCE_MS = 100;

type Props = {
  year: number;
  weekFrom: number;
  weekTo: number;
  children: React.ReactNode;
};

/**
 * Adjusts week count in the URL from viewport width without blocking the first paint
 * (avoids a second full server fetch behind PageLoading).
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
  const hasObservedRef = useRef(false);

  const applyWeeks = useCallback(
    (visibleWeeks: number) => {
      const clamped = Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, visibleWeeks));
      const currentSpan =
        weekFrom <= weekTo
          ? weekTo - weekFrom + 1
          : 52 - weekFrom + 1 + weekTo;
      if (clamped === currentSpan) return;

      const newFrom = weekFrom;
      const newTo =
        weekFrom + clamped - 1 <= 52
          ? weekFrom + clamped - 1
          : weekFrom + clamped - 1 - 52;

      router.replace(
        allocationHrefWithWeek(
          pathname,
          { year, from: newFrom, to: newTo },
          searchParams
        )
      );
    },
    [pathname, year, weekFrom, weekTo, router, searchParams]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const updateWeeks = () => {
      const w = el.clientWidth;
      if (w < 100) return;
      const available = w - LEFT_COL_WIDTH - EXTRA_PADDING;
      const visibleWeeks = Math.floor(available / MIN_WEEK_WIDTH);
      if (visibleWeeks < MIN_WEEKS) return;

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!hasObservedRef.current) {
          hasObservedRef.current = true;
        }
        applyWeeks(visibleWeeks);
      }, DEBOUNCE_MS);
    };

    const ro = new ResizeObserver(updateWeeks);
    ro.observe(el);
    updateWeeks();

    return () => {
      ro.disconnect();
      clearTimeout(timeoutId);
    };
  }, [applyWeeks]);

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  );
}
