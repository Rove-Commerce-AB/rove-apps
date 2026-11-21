import {
  APP_KEYS,
  APP_LABELS,
  isAppKey,
  type AppKey,
} from "@/lib/peopleTypes";

export const FEATURE_REQUEST_APP_OPTIONS = [
  { value: "general", label: "General" },
  ...APP_KEYS.map((key) => ({ value: key, label: APP_LABELS[key] })),
] as const;

export type FeatureRequestAppValue =
  (typeof FEATURE_REQUEST_APP_OPTIONS)[number]["value"];

export type FeatureRequestAppOption = {
  value: string;
  label: string;
};

/** General plus only apps the user can access. */
export function featureRequestAppOptionsForKeys(
  appKeys: readonly string[]
): FeatureRequestAppOption[] {
  const allowed = new Set(appKeys.filter(isAppKey));
  return FEATURE_REQUEST_APP_OPTIONS.filter(
    (opt) => opt.value === "general" || allowed.has(opt.value as AppKey)
  ).map((opt) => ({ value: opt.value, label: opt.label }));
}

/** True when the form value is General or an app key the user has. */
export function isFeatureRequestAppAllowed(
  raw: unknown,
  appKeys: readonly string[]
): boolean {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return false;
  if (value === "general") return true;
  return isAppKey(value) && appKeys.includes(value);
}

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
