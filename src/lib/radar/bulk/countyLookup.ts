import { countyFromPostort } from "@/lib/radar/bulk/postortToCounty";
import postnrToCounty from "@/lib/radar/bulk/data/postnrToCounty.json";

const POSTNR_MAP = postnrToCounty as Record<string, string>;

export function normalizePostnr(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 5) return null;
  return digits;
}

/**
 * Resolve Swedish län for Radar target-group filters.
 * Primary: postnummer table. Fallback: known postort map.
 */
export function resolveCounty(input: {
  postnr?: string | null;
  postort?: string | null;
}): string | null {
  const postnr = normalizePostnr(input.postnr);
  if (postnr && POSTNR_MAP[postnr]) return POSTNR_MAP[postnr];
  return countyFromPostort(input.postort);
}

export function postnrMapSize(): number {
  return Object.keys(POSTNR_MAP).length;
}
