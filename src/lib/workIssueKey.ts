export function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function normalizeWorkBoardPrefix(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidWorkBoardPrefix(prefix: string): boolean {
  return /^[A-Z][A-Z0-9]{1,7}$/.test(prefix);
}

/** Fold accents so e.g. Göhlins → GOHLINS for ASCII prefixes. */
function asciiLetters(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
}

/** Letter stem for prefix suggestions: initials if multi-word, else compact chars. */
function stemFromName(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => asciiLetters(part)[0] ?? "")
    .join("")
    .replace(/[^A-Z]/g, "");
  if (initials.length >= 2) return initials.slice(0, 3);
  const compact = asciiLetters(name);
  if (compact.length >= 1) return compact.slice(0, 3);
  return "";
}

/**
 * Suggest an issue prefix from customer name, optionally combined with project title.
 * Example: "Göhlins" + "Wholesale" → "GOWH"; "Riverstone Technologies" alone → "RT".
 */
export function suggestWorkBoardPrefix(
  customerName: string,
  projectTitle?: string
): string {
  const customer = stemFromName(customerName);
  const title = projectTitle?.trim() ? stemFromName(projectTitle) : "";

  if (customer && title) {
    const combined = (customer.slice(0, 2) + title.slice(0, 2)).slice(0, 4);
    if (combined.length >= 2) return combined;
  }
  if (customer.length >= 2) return customer.slice(0, 4);
  if (title.length >= 2) return title.slice(0, 4);
  if (customer.length === 1 && title.length === 1) return customer + title;
  if (customer.length === 1) return (customer + "X").slice(0, 2);
  if (title.length === 1) return (title + "X").slice(0, 2);
  return "WB";
}

export function workIssueKey(prefix: string, number: number): string {
  return `${prefix}-${number}`;
}

export function workPersonFromUser(row: {
  id: string;
  name: string | null;
  email: string;
}): { id: string; name: string; initials: string } {
  const name = row.name?.trim() || row.email;
  return { id: row.id, name, initials: initialsFromName(name) };
}
