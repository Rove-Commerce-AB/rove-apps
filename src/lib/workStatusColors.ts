import { DEFAULT_CUSTOMER_COLOR } from "@/lib/constants";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isHexColor(input: string | null | undefined): boolean {
  if (!input) return false;
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(input.trim());
}

/** Normalize customer master-data color to a usable hex. */
export function resolveWorkCustomerColor(
  color: string | null | undefined
): string {
  if (!isHexColor(color)) return DEFAULT_CUSTOMER_COLOR;
  const trimmed = color!.trim();
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

export type WorkStatusTone = {
  /** Customer brand color (same for every status). */
  color: string;
  /**
   * How strongly the brand color washes the surface (0–100).
   * Left columns are near 0 (almost bg), right columns are higher.
   */
  mix: number;
};

/**
 * Left → right mix strengths for a board of `count` statuses.
 * First column is nearly the page background; last leans into the customer color.
 */
export function workStatusMixPercents(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [14];

  const minMix = 3;
  const maxMix = 28;
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    return Math.round(minMix + t * (maxMix - minMix));
  });
}

/** Map status id → tone using current left-to-right column order. */
export function workStatusToneById(
  customerColor: string | null | undefined,
  statuses: ReadonlyArray<{ id: string }>
): Record<string, WorkStatusTone> {
  const color = resolveWorkCustomerColor(customerColor);
  const mixes = workStatusMixPercents(statuses.length);
  const map: Record<string, WorkStatusTone> = {};
  statuses.forEach((status, index) => {
    map[status.id] = { color, mix: mixes[index]! };
  });
  return map;
}

/**
 * Subtle column surface via color-mix against the theme background
 * (near-white in light mode, near-black in dark mode on the left).
 */
export function workStatusColumnBackground(tone: WorkStatusTone): string {
  const mix = clamp(tone.mix, 0, 100);
  return `color-mix(in srgb, ${tone.color} ${mix}%, var(--color-bg-default))`;
}

/** Stronger wash for header accents / dots (still muted). */
export function workStatusAccent(tone: WorkStatusTone): string {
  const mix = clamp(Math.round(tone.mix * 1.8 + 18), 18, 72);
  return `color-mix(in srgb, ${tone.color} ${mix}%, var(--color-bg-default))`;
}

/**
 * Readable left-border color for issue cards (stronger than column wash so
 * early statuses stay visible without washing card text).
 */
export function workStatusBorderColor(tone: WorkStatusTone): string {
  const mix = clamp(Math.round(38 + tone.mix * 1.6), 38, 88);
  return `color-mix(in srgb, ${tone.color} ${mix}%, var(--color-bg-default))`;
}

/** Tone from 0-based status index within a project (e.g. My work). */
export function workStatusToneAtIndex(
  customerColor: string | null | undefined,
  statusIndex: number,
  statusCount: number
): WorkStatusTone {
  const color = resolveWorkCustomerColor(customerColor);
  const count = Math.max(1, statusCount);
  const index = clamp(statusIndex, 0, count - 1);
  const mixes = workStatusMixPercents(count);
  return { color, mix: mixes[index]! };
}
