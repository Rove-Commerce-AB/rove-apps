/** Allowed absolute URL schemes for Markdown links. */
const ABSOLUTE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * Whether a Markdown href may be rendered as a clickable link.
 * Allows http(s), mailto, and relative Work app paths (`/work/...`).
 */
export function isAllowedWorkMarkdownHref(href: string): boolean {
  const raw = href.trim();
  if (!raw) return false;

  if (raw.startsWith("/work/") || raw === "/work") return true;

  // Block protocol-relative and sneaky schemes before URL parsing.
  if (raw.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    try {
      const url = new URL(raw);
      return ABSOLUTE_SCHEMES.has(url.protocol);
    } catch {
      return false;
    }
  }

  // Other relatives (./foo, ?q=, #hash alone, /api/...) are not allowed.
  return false;
}

/** react-markdown `urlTransform`: keep allowed hrefs, blank out the rest. */
export function workMarkdownUrlTransform(href: string): string {
  return isAllowedWorkMarkdownHref(href) ? href.trim() : "";
}
