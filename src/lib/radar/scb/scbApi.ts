import "server-only";

export type ScbJePartial = {
  peOrgNr: string;
  orgNr: string;
  namn: string;
  postAdress?: {
    gatuAdress?: string;
    coAdress?: string;
    postNr?: string;
    postOrt?: string;
  };
  primarNaringsgren?: {
    rangordning?: number;
    naringsgren?: string;
    andelProcent?: number;
    avdelningsKod?: string;
  };
  kommunSate?: string;
  lanSate?: string;
  anstKl?: string;
  ftgStat?: string;
  jurform?: string;
  reklamSparrTyp?: number;
  telefonSparrTyp?: number;
  epostSparrTyp?: number;
};

type CollectionResponse = {
  jes: ScbJePartial[];
  pagination: {
    nextCursorId?: number;
    limit?: number;
    hasMore: boolean;
  };
};

type CountResponse = { count: number; path?: string };

const MIN_INTERVAL_MS = 220; // stay under 5 req/s

let lastRequestAt = 0;

function apiKey(): string {
  const key = process.env.RADAR_SCB_API_KEY?.trim();
  if (!key) throw new Error("RADAR_SCB_API_KEY is not set");
  return key;
}

function baseUrl(): string {
  return (
    process.env.RADAR_SCB_API_BASE_URL?.trim().replace(/\/$/, "") ||
    "https://apiafr.scb.se"
  );
}

async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = MIN_INTERVAL_MS - (now - lastRequestAt);
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastRequestAt = Date.now();
}

async function scbGet<T>(path: string): Promise<T> {
  await throttle();
  const url = `${baseUrl()}${path}`;
  const res = await fetch(url, {
    headers: {
      "X-API-Key": apiKey(),
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") || "2");
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return scbGet(path);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SCB API ${res.status} ${path}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export function isScbApiConfigured(): boolean {
  return Boolean(process.env.RADAR_SCB_API_KEY?.trim());
}

export async function countJeByOmsattningsklass(
  omsKlKod: number
): Promise<number> {
  const data = await scbGet<CountResponse>(
    `/v1/juridiskaenheter/omsattningsklass/${omsKlKod}/count`
  );
  return data.count;
}

/** peOrgNr for AB-style org numbers is 16 + 10-digit orgNr. */
export function peOrgNrFromOrganizationNumber(orgNr: string): string | null {
  const digits = orgNr.replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return `16${digits}`;
}

/** Live lookup of one juridisk enhet by 10-digit organization number. */
export async function fetchJeByOrganizationNumber(
  orgNr: string
): Promise<ScbJePartial | null> {
  const pe = peOrgNrFromOrganizationNumber(orgNr);
  if (!pe) return null;
  try {
    return await scbGet<ScbJePartial>(`/v1/juridiskaenheter/${pe}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("404")) return null;
    throw error;
  }
}

export type ScbJePage = {
  jes: ScbJePartial[];
  /** Cursor to request the next page. Null when no further pages. */
  nextCursorId: number | null;
  hasMore: boolean;
};

/** One page of juridiska enheter for an omsättningsklass (max 5000). */
export async function fetchJePageByOmsattningsklass(
  omsKlKod: number,
  options?: { pageSize?: number; cursorId?: number | null }
): Promise<ScbJePage> {
  const limit = Math.min(options?.pageSize ?? 5000, 5000);
  const qs = new URLSearchParams({ limit: String(limit) });
  if (options?.cursorId != null) qs.set("cursorId", String(options.cursorId));
  const page = await scbGet<CollectionResponse>(
    `/v1/juridiskaenheter/omsattningsklass/${omsKlKod}?${qs}`
  );
  const hasMore = Boolean(page.pagination?.hasMore);
  const nextCursorId =
    hasMore && page.pagination?.nextCursorId != null
      ? page.pagination.nextCursorId
      : null;
  return {
    jes: page.jes ?? [],
    nextCursorId,
    hasMore: hasMore && nextCursorId != null,
  };
}

/**
 * Stream all juridiska enheter in one omsättningsklass (paginated, max 5000/page).
 */
export async function* streamJeByOmsattningsklass(
  omsKlKod: number,
  options?: { pageSize?: number; startCursorId?: number | null }
): AsyncGenerator<ScbJePartial> {
  let cursorId: number | null | undefined = options?.startCursorId;
  for (;;) {
    const page = await fetchJePageByOmsattningsklass(omsKlKod, {
      pageSize: options?.pageSize,
      cursorId: cursorId ?? null,
    });
    for (const je of page.jes) yield je;
    if (!page.hasMore) break;
    cursorId = page.nextCursorId;
  }
}
