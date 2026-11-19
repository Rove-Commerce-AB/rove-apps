/** Digits-only Swedish organization number (10 digits). Sole proprietors are out of MVP scope. */
export function normalizeOrganizationNumber(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return digits;
}

export function formatOrganizationNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

export function normalizeHostname(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const withProtocol = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    const host = new URL(withProtocol).hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    const host = trimmed
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      ?.replace(/^www\./, "")
      .trim();
    return host || null;
  }
}
