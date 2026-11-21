/** Pure helpers: company name → hostname candidates + page validation. */

const LEGAL_SUFFIXES = [
  "aktiebolag",
  "handelsbolag",
  "kommanditbolag",
  "ekonomisk forening",
  "ekonomisk förening",
  "ab",
  "hb",
  "kb",
  "ek for",
  "ek. for.",
  "ek forening",
  "ek. förening",
  "ab publ",
  "publ",
];

const PARKING_HINTS = [
  "sedoparking",
  "godaddy.com/forsale",
  "domain is for sale",
  "buy this domain",
  "this domain may be for sale",
  "parked domain",
  "parkingcrew",
  "hugedomains",
  "dan.com/buy",
];

const TLDS = ["se", "com"] as const;

/** Strip legal form and diacritics → ascii slug tokens. */
export function companyNameTokens(name: string): string[] {
  let text = name.normalize("NFD").replace(/\p{M}/gu, "");
  text = text
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/&/g, " och ");

  for (const suffix of LEGAL_SUFFIXES) {
    const re = new RegExp(
      `(^|[\\s,.-])${suffix.replace(/\./g, "\\.")}(?=$|[\\s,.-])`,
      "gi"
    );
    text = text.replace(re, " ");
  }

  return text
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export function companyNameSlugs(name: string): string[] {
  const tokens = companyNameTokens(name);
  if (tokens.length === 0) return [];

  const slugs = new Set<string>();
  const joined = tokens.join("");
  if (joined.length >= 3) slugs.add(joined);
  if (tokens.length > 1) {
    const hyphen = tokens.join("-");
    if (hyphen.length >= 3) slugs.add(hyphen);
  }
  // First token alone if distinctive enough and multi-word
  if (tokens.length > 1 && tokens[0]!.length >= 4) {
    slugs.add(tokens[0]!);
  }
  return [...slugs].filter((s) => s.length >= 3 && s.length <= 63);
}

/** Ordered hostname candidates for a company name. */
export function hostnameCandidatesFromName(name: string): string[] {
  const slugs = companyNameSlugs(name);
  const hosts: string[] = [];
  for (const slug of slugs) {
    for (const tld of TLDS) {
      hosts.push(`${slug}.${tld}`);
    }
  }
  return hosts;
}

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** True if HTML looks like a real company page for this name/orgnr. */
export function htmlMatchesCompany(
  html: string,
  input: { name: string; organizationNumber: string }
): boolean {
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const lowerHtml = html.toLowerCase();
  if (PARKING_HINTS.some((hint) => lowerHtml.includes(hint))) return false;

  const org = input.organizationNumber.replace(/\D/g, "");
  if (org.length === 10) {
    const dashed = `${org.slice(0, 6)}-${org.slice(6)}`;
    if (plain.includes(org) || plain.includes(dashed)) return true;
  }

  const haystack = normalizeForMatch(plain);
  if (haystack.length < 20) return false;

  const tokens = companyNameTokens(input.name).filter((t) => t.length >= 3);
  if (tokens.length === 0) return false;

  // All distinctive tokens must appear (handles "Öratron" and multi-word names).
  const required = tokens.length === 1 ? tokens : tokens.slice(0, 3);
  return required.every((token) => haystack.includes(token));
}

export type DomainProbeResult = {
  hostname: string;
  ok: boolean;
  finalHostname: string | null;
  status: number | null;
};

/**
 * Fetch homepage and validate it mentions the company.
 * Follows redirects; returns final hostname if different (www stripped).
 */
export async function probeHostnameForCompany(
  hostname: string,
  company: { name: string; organizationNumber: string },
  options?: { timeoutMs?: number; userAgent?: string }
): Promise<DomainProbeResult> {
  const timeoutMs = options?.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://${hostname}`, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          options?.userAgent ??
          "RoveRadarBot/0.1 (+https://rove.se; market-research)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      return {
        hostname,
        ok: false,
        finalHostname: null,
        status: res.status,
      };
    }
    const html = await res.text();
    if (!htmlMatchesCompany(html, company)) {
      return {
        hostname,
        ok: false,
        finalHostname: null,
        status: res.status,
      };
    }
    let finalHost = hostname;
    try {
      const u = new URL(res.url);
      finalHost = u.hostname.replace(/^www\./, "");
    } catch {
      /* keep candidate */
    }
    return {
      hostname,
      ok: true,
      finalHostname: finalHost,
      status: res.status,
    };
  } catch {
    return {
      hostname,
      ok: false,
      finalHostname: null,
      status: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Try candidates in order; return first validated hostname. */
export async function resolveDomainFromName(input: {
  name: string;
  organizationNumber: string;
  timeoutMs?: number;
  delayMs?: number;
}): Promise<{ hostname: string; tried: number } | null> {
  const candidates = hostnameCandidatesFromName(input.name);
  let tried = 0;
  for (const host of candidates) {
    tried += 1;
    const result = await probeHostnameForCompany(host, {
      name: input.name,
      organizationNumber: input.organizationNumber,
    }, { timeoutMs: input.timeoutMs });
    if (result.ok && result.finalHostname) {
      return { hostname: result.finalHostname, tried };
    }
    if (input.delayMs && input.delayMs > 0) {
      await new Promise((r) => setTimeout(r, input.delayMs));
    }
  }
  return null;
}
