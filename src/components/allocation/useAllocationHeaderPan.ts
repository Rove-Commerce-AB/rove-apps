"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";

const EMBED_WEEK_COL_PX = 10;
const DEFAULT_WEEK_COL_PX = 28; // 1.75rem

type PanRef = {
  pointerId: number;
  originX: number;
  originWeeks: number;
};

/**
 * Work-Timeline-style header pan for Planner week grids.
 * Snaps to whole weeks while dragging; commits via onShiftWeeks on release.
 *
 * Header labels should follow `panWeeks` (no CSS translate on header cells).
 * Body cells use `--allocation-pan-x` so columns stay aligned with those labels.
 *
 * After release, the body offset is held until `rangeKey` changes. On that
 * catch-up render `panWeeks` is already 0 (derived), so new data is never painted
 * still-translated — that double-shift was the release hitch.
 */
export function useAllocationHeaderPan({
  embedMode,
  onShiftWeeks,
  rangeKey,
  disabled = false,
}: {
  embedMode?: boolean;
  onShiftWeeks: (weeks: number) => void;
  /** Changes when the visible week window updates (e.g. `${year}-${weekFrom}-${weekTo}`). */
  rangeKey: string;
  disabled?: boolean;
}) {
  const [panWeeksState, setPanWeeksState] = useState(0);
  /** Range key when a pan was committed; hold visual until `rangeKey` differs. */
  const [heldForRangeKey, setHeldForRangeKey] = useState<string | null>(null);
  const [weekWidthPx, setWeekWidthPx] = useState(
    embedMode ? EMBED_WEEK_COL_PX : DEFAULT_WEEK_COL_PX
  );
  const [panning, setPanning] = useState(false);
  const panRef = useRef<PanRef | null>(null);
  const weekWidthRef = useRef(weekWidthPx);

  const dataCaughtUp =
    heldForRangeKey !== null && rangeKey !== heldForRangeKey;

  // Zero offset on the catch-up render itself (before paint) — never show new
  // week data while the old translate is still applied.
  const panWeeks = dataCaughtUp ? 0 : panWeeksState;

  if (dataCaughtUp) {
    setHeldForRangeKey(null);
    if (panWeeksState !== 0) setPanWeeksState(0);
  }

  const measureWeekWidth = useCallback(
    (target: HTMLElement) => {
      const root =
        target.closest(".allocation-tables") ?? target.closest("table");
      const bodyWeekTd = root?.querySelector<HTMLElement>(
        "tbody td.allocation-pan-cell"
      );
      const weekTh = root?.querySelector<HTMLElement>(
        "thead tr:nth-child(2) th"
      );
      const width =
        bodyWeekTd?.getBoundingClientRect().width ||
        weekTh?.getBoundingClientRect().width;
      if (width && width > 0) {
        weekWidthRef.current = width;
        setWeekWidthPx(width);
      } else {
        const fallback = embedMode ? EMBED_WEEK_COL_PX : DEFAULT_WEEK_COL_PX;
        weekWidthRef.current = fallback;
        setWeekWidthPx(fallback);
      }
    },
    [embedMode]
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (disabled || event.button !== 0) return;
      event.preventDefault();
      measureWeekWidth(event.currentTarget);
      event.currentTarget.setPointerCapture(event.pointerId);
      panRef.current = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originWeeks: panWeeks,
      };
      setPanning(true);
    },
    [disabled, measureWeekWidth, panWeeks]
  );

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const weekW = weekWidthRef.current || DEFAULT_WEEK_COL_PX;
    const deltaWeeks = Math.round((pan.originX - event.clientX) / weekW);
    const next = pan.originWeeks + deltaWeeks;
    setPanWeeksState((prev) => (prev === next ? prev : next));
  }, []);

  const endPan = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId) return;
      const weekW = weekWidthRef.current || DEFAULT_WEEK_COL_PX;
      const deltaWeeks = Math.round((pan.originX - event.clientX) / weekW);
      const weeks = pan.originWeeks + deltaWeeks;
      panRef.current = null;
      setPanning(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }

      if (weeks === 0) {
        setHeldForRangeKey(null);
        setPanWeeksState(0);
        return;
      }
      setPanWeeksState(weeks);
      setHeldForRangeKey(rangeKey);
      onShiftWeeks(weeks);
    },
    [onShiftWeeks, rangeKey]
  );

  const panOffsetPx = -panWeeks * weekWidthPx;

  const gridPanStyle = useMemo(
    () =>
      ({
        ["--allocation-pan-x" as string]: `${panOffsetPx}px`,
      }) satisfies CSSProperties,
    [panOffsetPx]
  );

  const headerPanClassName = `touch-none select-none ${
    panning ? "cursor-grabbing" : "cursor-grab"
  }`;

  const headerPanHandlers = useMemo(
    () => ({
      onPointerDown,
      onPointerMove,
      onPointerUp: endPan,
      onPointerCancel: endPan,
      title: "Drag to pan timeline" as const,
    }),
    [onPointerDown, onPointerMove, endPan]
  );

  return {
    panning,
    panWeeks,
    panOffsetPx,
    gridPanStyle,
    headerPanClassName,
    headerPanHandlers,
  };
}
