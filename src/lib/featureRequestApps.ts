import { APP_KEYS, APP_LABELS, isAppKey } from "@/lib/peopleTypes";

export const FEATURE_REQUEST_APP_OPTIONS = [
  { value: "general", label: "General" },
  ...APP_KEYS.map((key) => ({ value: key, label: APP_LABELS[key] })),
] as const;

export type FeatureRequestAppValue =
  (typeof FEATURE_REQUEST_APP_OPTIONS)[number]["value"];

/** Returns the Work component display name, or null if missing/invalid. */
export function featureRequestAppLabel(
  raw: unknown
): string | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value === "general") return "General";
  if (isAppKey(value)) return APP_LABELS[value];
  return null;
}
