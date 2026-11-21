/**
 * SCB omsättningsklasser (momsbaserade intervall i tkr).
 * Source: AFR kodtabell / variabelbeskrivning.
 */
export type ScbOmsattningsklass = {
  kod: number;
  /** Klartext from SCB, e.g. "100 000 - 499 999 tkr" */
  label: string;
  /** Inclusive lower bound in SEK (tkr * 1000). */
  minSek: number;
  /** Inclusive upper bound in SEK; null = open-ended. */
  maxSek: number | null;
};

export const SCB_OMSATTNINGSKLASSER: readonly ScbOmsattningsklass[] = [
  { kod: 0, label: "< 1 tkr", minSek: 0, maxSek: 999 },
  { kod: 1, label: "1 - 499 tkr", minSek: 1_000, maxSek: 499_999 },
  { kod: 2, label: "500 - 999 tkr", minSek: 500_000, maxSek: 999_999 },
  { kod: 3, label: "1 000 - 4 999 tkr", minSek: 1_000_000, maxSek: 4_999_999 },
  { kod: 4, label: "5 000 - 9 999 tkr", minSek: 5_000_000, maxSek: 9_999_999 },
  { kod: 5, label: "10 000 - 19 999 tkr", minSek: 10_000_000, maxSek: 19_999_999 },
  { kod: 6, label: "20 000 - 49 999 tkr", minSek: 20_000_000, maxSek: 49_999_999 },
  { kod: 7, label: "50 000 - 99 999 tkr", minSek: 50_000_000, maxSek: 99_999_999 },
  { kod: 8, label: "100 000 - 499 999 tkr", minSek: 100_000_000, maxSek: 499_999_999 },
  { kod: 9, label: "500 000 - 999 999 tkr", minSek: 500_000_000, maxSek: 999_999_999 },
  {
    kod: 10,
    label: "1 000 000 - 4 999 999 tkr",
    minSek: 1_000_000_000,
    maxSek: 4_999_999_999,
  },
  {
    kod: 11,
    label: "5 000 000 - 9 999 999 tkr",
    minSek: 5_000_000_000,
    maxSek: 9_999_999_999,
  },
  { kod: 12, label: "> 9 999 999 tkr", minSek: 10_000_000_000, maxSek: null },
] as const;

export function omsattningsklassByKod(
  kod: number
): ScbOmsattningsklass | undefined {
  return SCB_OMSATTNINGSKLASSER.find((k) => k.kod === kod);
}

/**
 * Map an audience revenue SEK range to overlapping SCB omsättningsklasser.
 * No bounds → all classes (caller should avoid fetching all of Sweden).
 */
export function omsattningsklasserForRevenueRange(
  minSek: number | null | undefined,
  maxSek: number | null | undefined
): ScbOmsattningsklass[] {
  if (minSek == null && maxSek == null) return [...SCB_OMSATTNINGSKLASSER];
  const lo = minSek ?? 0;
  const hi = maxSek ?? Number.POSITIVE_INFINITY;
  return SCB_OMSATTNINGSKLASSER.filter((k) => {
    const kHi = k.maxSek ?? Number.POSITIVE_INFINITY;
    return k.minSek <= hi && kHi >= lo;
  });
}

export function omsattningsklasserForCodes(
  codes: readonly number[] | null | undefined
): ScbOmsattningsklass[] {
  if (!codes || codes.length === 0) return [];
  const wanted = new Set(codes);
  return SCB_OMSATTNINGSKLASSER.filter((k) => wanted.has(k.kod));
}

/** Derive SEK bounds covering the selected omsättningsklasser (for legacy filters). */
export function revenueRangeForOmsattningsklasser(
  codes: readonly number[]
): { minSek: number | null; maxSek: number | null } {
  const classes = omsattningsklasserForCodes(codes);
  if (classes.length === 0) return { minSek: null, maxSek: null };
  const minSek = Math.min(...classes.map((c) => c.minSek));
  const openEnded = classes.some((c) => c.maxSek == null);
  const maxSek = openEnded
    ? null
    : Math.max(...classes.map((c) => c.maxSek as number));
  return { minSek, maxSek };
}

const OMS_KL_RANGE_EN: Record<number, string> = {
  0: "< SEK 1k",
  1: "SEK 1k – 499k",
  2: "SEK 500k – 999k",
  3: "SEK 1m – 5m",
  4: "SEK 5m – 10m",
  5: "SEK 10m – 20m",
  6: "SEK 20m – 50m",
  7: "SEK 50m – 100m",
  8: "SEK 100m – 500m",
  9: "SEK 500m – 1bn",
  10: "SEK 1bn – 5bn",
  11: "SEK 5bn – 10bn",
  12: "> SEK 10bn",
};

/** Turnover range only (no SCB class number), e.g. "SEK 100m – 500m". */
export function formatOmsattningsklassRange(kod: number): string {
  return OMS_KL_RANGE_EN[kod] ?? `Class ${kod}`;
}

/** English UI label for a turnover class (SCB amounts are in tkr). */
export function formatOmsattningsklassOption(kod: number): string {
  const text = OMS_KL_RANGE_EN[kod];
  if (!text) return `Class ${kod}`;
  return `${kod} · ${text}`;
}

/** Strip leading "8 · " / "8: " from a stored label when showing in lists. */
export function stripOmsattningsklassKodPrefix(label: string): string {
  return label.replace(/^\d+\s*[·:]\s*/, "").trim() || label;
}

/** SCB anställningsklasser (anstKl). */
export type ScbAnstallningsklass = {
  kod: number;
  label: string;
  min: number | null;
  max: number | null;
};

export const SCB_ANSTALLNINGSKLASSER: readonly ScbAnstallningsklass[] = [
  { kod: 0, label: "Uppgift saknas", min: null, max: null },
  { kod: 1, label: "0 anställda", min: 0, max: 0 },
  { kod: 2, label: "1-4 anställda", min: 1, max: 4 },
  { kod: 3, label: "5-9 anställda", min: 5, max: 9 },
  { kod: 4, label: "10-19 anställda", min: 10, max: 19 },
  { kod: 5, label: "20-49 anställda", min: 20, max: 49 },
  { kod: 6, label: "50-99 anställda", min: 50, max: 99 },
  { kod: 7, label: "100-199 anställda", min: 100, max: 199 },
  { kod: 8, label: "200-499 anställda", min: 200, max: 499 },
  { kod: 9, label: "500-999 anställda", min: 500, max: 999 },
  { kod: 10, label: "1000-1499 anställda", min: 1000, max: 1499 },
  { kod: 11, label: "1500-1999 anställda", min: 1500, max: 1999 },
  { kod: 12, label: "2000-2999 anställda", min: 2000, max: 2999 },
  { kod: 13, label: "3000-3999 anställda", min: 3000, max: 3999 },
  { kod: 14, label: "4000-4999 anställda", min: 4000, max: 4999 },
  { kod: 15, label: "5000-9999 anställda", min: 5000, max: 9999 },
  { kod: 16, label: "10000- anställda", min: 10000, max: null },
] as const;

export function anstallningsklassByKod(
  kod: number
): ScbAnstallningsklass | undefined {
  return SCB_ANSTALLNINGSKLASSER.find((k) => k.kod === kod);
}

/** English UI range for an employee size class, e.g. "20–49". */
export function formatAnstallningsklassRange(kod: number): string {
  const row = anstallningsklassByKod(kod);
  if (!row || row.min == null) return "Unknown";
  if (row.max == null) return `${row.min.toLocaleString("en-US")}+`;
  if (row.min === row.max) return String(row.min);
  return `${row.min.toLocaleString("en-US")}–${row.max.toLocaleString("en-US")}`;
}

export function anstallningsklassMatchesRange(
  kod: number,
  min: number | null | undefined,
  max: number | null | undefined
): boolean {
  if (min == null && max == null) return true;
  const row = anstallningsklassByKod(kod);
  if (!row || row.min == null) return false;
  const hi = row.max ?? Number.POSITIVE_INFINITY;
  const loBound = min ?? 0;
  const hiBound = max ?? Number.POSITIVE_INFINITY;
  return row.min <= hiBound && hi >= loBound;
}
