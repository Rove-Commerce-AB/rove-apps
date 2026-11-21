"use client";

import {
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";

type Point = { x: number; y: number };

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type Curve = {
  key: string;
  d: string;
  kind: "related" | "draft";
  start: Point;
  end: Point;
};

type Props = {
  containerRef: RefObject<HTMLElement | null>;
  fromIssueId: string | null;
  toIssueIds: string[];
  /** Client coordinates while dragging a new relation. */
  cursorClient?: { x: number; y: number } | null;
};

function cardRect(
  container: HTMLElement,
  issueId: string
): Rect | null {
  const host = container.querySelector<HTMLElement>(
    `[data-issue-id="${CSS.escape(issueId)}"] [data-issue-card]`
  );
  if (!host) return null;
  const cRect = container.getBoundingClientRect();
  const rect = host.getBoundingClientRect();
  const left = rect.left - cRect.left + container.scrollLeft;
  const top = rect.top - cRect.top + container.scrollTop;
  return {
    left,
    top,
    right: left + rect.width,
    bottom: top + rect.height,
    width: rect.width,
    height: rect.height,
  };
}

function centerOf(rect: Rect): Point {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/** Ray from rect center toward `toward`, clipped to the rect border. */
function borderPointToward(rect: Rect, toward: Point): Point {
  const c = centerOf(rect);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
    return { x: rect.right, y: c.y };
  }
  const tx =
    dx > 0
      ? (rect.right - c.x) / dx
      : dx < 0
        ? (rect.left - c.x) / dx
        : Number.POSITIVE_INFINITY;
  const ty =
    dy > 0
      ? (rect.bottom - c.y) / dy
      : dy < 0
        ? (rect.top - c.y) / dy
        : Number.POSITIVE_INFINITY;
  const t = Math.min(tx, ty);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

function exitNormal(rect: Rect, point: Point): Point {
  const eps = 2;
  if (Math.abs(point.x - rect.right) <= eps) return { x: 1, y: 0 };
  if (Math.abs(point.x - rect.left) <= eps) return { x: -1, y: 0 };
  if (Math.abs(point.y - rect.bottom) <= eps) return { x: 0, y: 1 };
  if (Math.abs(point.y - rect.top) <= eps) return { x: 0, y: -1 };
  const c = centerOf(rect);
  const dx = point.x - c.x;
  const dy = point.y - c.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: dx >= 0 ? 1 : -1, y: 0 };
  }
  return { x: 0, y: dy >= 0 ? 1 : -1 };
}

/** Shortest center-line between two cards, clipped to borders + soft bezier. */
function curveBetween(
  from: Rect,
  to: Rect,
  key: string,
  kind: Curve["kind"]
): Curve {
  const fromCenter = centerOf(from);
  const toCenter = centerOf(to);
  const start = borderPointToward(from, toCenter);
  const end = borderPointToward(to, fromCenter);
  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  const bend = Math.max(16, Math.min(56, dist * 0.4));
  const n1 = exitNormal(from, start);
  const n2 = exitNormal(to, end);
  const c1 = {
    x: start.x + n1.x * bend,
    y: start.y + n1.y * bend,
  };
  const c2 = {
    x: end.x + n2.x * bend,
    y: end.y + n2.y * bend,
  };
  return {
    key,
    kind,
    start,
    end,
    d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
  };
}

function curveToPoint(
  from: Rect,
  end: Point,
  key: string,
  kind: Curve["kind"]
): Curve {
  const start = borderPointToward(from, end);
  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  const bend = Math.max(12, Math.min(48, dist * 0.35));
  const n1 = exitNormal(from, start);
  const c1 = {
    x: start.x + n1.x * bend,
    y: start.y + n1.y * bend,
  };
  const c2 = {
    x: end.x - n1.x * bend * 0.35,
    y: end.y - n1.y * bend * 0.35,
  };
  return {
    key,
    kind,
    start,
    end,
    d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
  };
}

/**
 * SVG curves between a hovered/dragged card and relation targets.
 * Uses the shortest border-to-border path (center line clipped to edges).
 */
export function WorkBoardRelationOverlay({
  containerRef,
  fromIssueId,
  toIssueIds,
  cursorClient = null,
}: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [curves, setCurves] = useState<Curve[]>([]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !fromIssueId) {
      setCurves([]);
      return;
    }

    const measure = () => {
      setSize({
        w: Math.max(container.scrollWidth, container.clientWidth),
        h: Math.max(container.scrollHeight, container.clientHeight),
      });
      const from = cardRect(container, fromIssueId);
      if (!from) {
        setCurves([]);
        return;
      }
      const next: Curve[] = [];
      for (const toId of toIssueIds) {
        if (toId === fromIssueId) continue;
        const to = cardRect(container, toId);
        if (!to) continue;
        next.push(
          curveBetween(from, to, `${fromIssueId}-${toId}`, "related")
        );
      }
      if (cursorClient) {
        const cRect = container.getBoundingClientRect();
        next.push(
          curveToPoint(
            from,
            {
              x: cursorClient.x - cRect.left + container.scrollLeft,
              y: cursorClient.y - cRect.top + container.scrollTop,
            },
            "draft",
            "draft"
          )
        );
      }
      setCurves(next);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    container.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      container.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [containerRef, fromIssueId, toIssueIds, cursorClient]);

  if (!fromIssueId || (curves.length === 0 && size.w === 0)) return null;

  return (
    <svg
      className="pointer-events-none absolute top-0 left-0 z-30"
      width={size.w}
      height={size.h}
      aria-hidden
    >
      {curves.map((curve) => {
        const isDraft = curve.kind === "draft";
        const stroke = isDraft
          ? "var(--color-brand-signal, #2563eb)"
          : "var(--color-text-tertiary, #94a3b8)";
        return (
          <g key={curve.key}>
            <path
              d={curve.d}
              fill="none"
              stroke={stroke}
              strokeWidth={isDraft ? 2 : 1.75}
              strokeOpacity={isDraft ? 0.9 : 0.65}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx={curve.start.x}
              cy={curve.start.y}
              r={isDraft ? 2.5 : 2}
              fill={stroke}
              fillOpacity={isDraft ? 0.95 : 0.7}
            />
            <circle
              cx={curve.end.x}
              cy={curve.end.y}
              r={isDraft ? 2.5 : 2}
              fill={stroke}
              fillOpacity={isDraft ? 0.95 : 0.7}
            />
          </g>
        );
      })}
    </svg>
  );
}
