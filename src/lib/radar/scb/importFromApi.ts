import "server-only";

import { listRadarAudiences } from "@/lib/radar/audiences";
import type { BulkImportProgress, BulkImportResult } from "@/lib/radar/bulk/importBulk";
import {
  listRadarOrganizationNumbers,
  upsertRadarCompany,
} from "@/lib/radar/companies";
import {
  getRadarJobConfig,
  patchRadarJobSettings,
} from "@/lib/radar/jobs";
import { audienceImportFingerprint } from "@/lib/radar/scb/importFingerprint";
import { countyForLanKod, lanKodForCounty } from "@/lib/radar/scb/lanCodes";
import {
  anstallningsklassByKod,
  anstallningsklassMatchesRange,
  formatOmsattningsklassOption,
  omsattningsklasserForCodes,
  omsattningsklasserForRevenueRange,
  type ScbOmsattningsklass,
} from "@/lib/radar/scb/omsattningsklasser";
import {
  countJeByOmsattningsklass,
  fetchJePageByOmsattningsklass,
  type ScbJePartial,
} from "@/lib/radar/scb/scbApi";
import { resolveSniDescription } from "@/lib/radar/sniSections";
import type { RadarAudience } from "@/lib/radar/types";

export { audienceImportFingerprint } from "@/lib/radar/scb/importFingerprint";

/** JurForm 49 = Aktiebolag (same as SCB bulk MVP preference). */
const AB_JUR_FORM = "49";
const ACTIVE_FTG_STAT = "1";

const SETTINGS_KEY = "scbImport";

type OmsCursorState = {
  /** Cursor to request for the current page. null = first page. */
  cursorId: number | null;
  exhausted: boolean;
};

type ScbImportCursorState = {
  fingerprint: string;
  byOmsKl: Record<string, OmsCursorState>;
};

function sniMatchesPrefixes(
  sni: string | undefined,
  prefixes: string[]
): boolean {
  if (prefixes.length === 0) return true;
  if (!sni) return false;
  return prefixes.some((p) => sni.startsWith(p));
}

function audienceMatchesJe(
  audience: RadarAudience,
  je: ScbJePartial,
  omsKl: number
): boolean {
  if (audience.status !== "active") return false;

  const sni = je.primarNaringsgren?.naringsgren;
  if (!sniMatchesPrefixes(sni, audience.sni_prefixes)) return false;

  if (audience.counties.length > 0) {
    const county = countyForLanKod(je.lanSate);
    if (!county || !audience.counties.includes(county)) return false;
  }

  const allowedOms =
    audience.oms_kl_codes.length > 0
      ? omsattningsklasserForCodes(audience.oms_kl_codes)
      : omsattningsklasserForRevenueRange(
          audience.revenue_min_sek,
          audience.revenue_max_sek
        );
  if (allowedOms.length === 0 || !allowedOms.some((k) => k.kod === omsKl)) {
    return false;
  }

  const anstKod = Number(je.anstKl);
  if (
    !Number.isNaN(anstKod) &&
    !anstallningsklassMatchesRange(
      anstKod,
      audience.employee_min,
      audience.employee_max
    )
  ) {
    return false;
  }

  return true;
}

function omsClassesForAudience(audience: RadarAudience): ScbOmsattningsklass[] {
  if (audience.oms_kl_codes.length > 0) {
    return omsattningsklasserForCodes(audience.oms_kl_codes);
  }
  if (audience.revenue_min_sek != null || audience.revenue_max_sek != null) {
    return omsattningsklasserForRevenueRange(
      audience.revenue_min_sek,
      audience.revenue_max_sek
    );
  }
  return [];
}

function collectOmsClasses(audiences: RadarAudience[]): ScbOmsattningsklass[] {
  const byKod = new Map<number, ScbOmsattningsklass>();
  for (const a of audiences) {
    const classes = omsClassesForAudience(a);
    if (classes.length === 0) {
      throw new Error(
        `Target group "${a.name}" needs at least one turnover class so Radar can query SCB.`
      );
    }
    for (const k of classes) byKod.set(k.kod, k);
  }
  return [...byKod.values()].sort((a, b) => a.kod - b.kod);
}

function parseCursorState(raw: unknown): ScbImportCursorState | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.fingerprint !== "string") return null;
  const byOmsKl: Record<string, OmsCursorState> = {};
  const rawBy = obj.byOmsKl;
  if (rawBy && typeof rawBy === "object") {
    for (const [key, value] of Object.entries(
      rawBy as Record<string, unknown>
    )) {
      if (!value || typeof value !== "object") continue;
      const entry = value as Record<string, unknown>;
      byOmsKl[key] = {
        cursorId:
          entry.cursorId == null
            ? null
            : typeof entry.cursorId === "number"
              ? entry.cursorId
              : Number(entry.cursorId),
        exhausted: Boolean(entry.exhausted),
      };
      if (Number.isNaN(byOmsKl[key]!.cursorId as number)) {
        byOmsKl[key]!.cursorId = null;
      }
    }
  }
  return { fingerprint: obj.fingerprint, byOmsKl };
}

async function loadCursorState(): Promise<ScbImportCursorState | null> {
  const config = await getRadarJobConfig("company_import");
  return parseCursorState(config?.settings?.[SETTINGS_KEY]);
}

async function saveCursorState(state: ScbImportCursorState): Promise<void> {
  await patchRadarJobSettings("company_import", {
    [SETTINGS_KEY]: state,
  });
}

async function upsertFromJe(input: {
  je: ScbJePartial;
  omsKl: number;
  audienceIds: string[];
}): Promise<void> {
  const { je, omsKl, audienceIds } = input;
  const anstKod = Number(je.anstKl);
  const anst = Number.isNaN(anstKod)
    ? undefined
    : anstallningsklassByKod(anstKod);

  await upsertRadarCompany({
    organization_number: je.orgNr,
    name: je.namn,
    legal_form: je.jurform === AB_JUR_FORM ? "AB" : je.jurform ?? null,
    county: countyForLanKod(je.lanSate),
    municipality: je.postAdress?.postOrt ?? null,
    sni_code: je.primarNaringsgren?.naringsgren ?? null,
    sni_description: resolveSniDescription(
      je.primarNaringsgren?.naringsgren ?? null
    ),
    employee_count: null,
    revenue_sek: null,
    oms_kl: omsKl,
    oms_kl_label: formatOmsattningsklassOption(omsKl),
    oms_ar: null,
    anst_kl: anst?.kod ?? null,
    anst_kl_label: anst?.label ?? null,
    lan_kod: je.lanSate ?? null,
    financials_origin: "scb",
    source: "scb_api",
    source_ref: `omsKl=${omsKl}`,
    is_demo: false,
    audienceIds,
  });
}

/**
 * Incremental SCB import: resume from saved cursor, save only new companies
 * up to maxItems, relink audiences for companies already in Radar.
 */
export async function importFromScbApi(options: {
  maxItems: number;
  onProgress?: (progress: BulkImportProgress) => void | Promise<void>;
}): Promise<BulkImportResult> {
  const report = async (progress: BulkImportProgress) => {
    await options.onProgress?.(progress);
  };

  const audiences = (await listRadarAudiences()).filter(
    (a) => a.status === "active"
  );
  if (audiences.length === 0) {
    return {
      processed: 0,
      linked: 0,
      skipped: 0,
      scbScanned: 0,
      scbMatched: 0,
      bvEnriched: 0,
      bvDeregisteredSkipped: 0,
      source: "scb_api",
      message: "No active target groups — nothing to import",
    };
  }

  for (const a of audiences) {
    for (const county of a.counties) {
      if (!lanKodForCounty(county)) {
        throw new Error(
          `Unknown county "${county}" in target group "${a.name}" (no SCB länskod).`
        );
      }
    }
  }

  let omsClasses: ScbOmsattningsklass[];
  try {
    omsClasses = collectOmsClasses(audiences);
  } catch (error) {
    return {
      processed: 0,
      linked: 0,
      skipped: 0,
      scbScanned: 0,
      scbMatched: 0,
      bvEnriched: 0,
      bvDeregisteredSkipped: 0,
      source: "scb_api",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const fingerprint = audienceImportFingerprint(audiences);
  const previous = await loadCursorState();
  let state: ScbImportCursorState =
    previous?.fingerprint === fingerprint
      ? previous
      : { fingerprint, byOmsKl: {} };

  // After a full pass, reset so the next run can pick up newly matching
  // companies (or ones removed from Radar) without waiting for filter changes.
  const allExhaustedAtStart =
    previous?.fingerprint === fingerprint &&
    omsClasses.length > 0 &&
    omsClasses.every(
      (oms) => state.byOmsKl[String(oms.kod)]?.exhausted === true
    );
  if (allExhaustedAtStart) {
    state = { fingerprint, byOmsKl: {} };
  }

  if (previous?.fingerprint !== fingerprint || allExhaustedAtStart) {
    await saveCursorState(state);
  }

  const existingOrgs = await listRadarOrganizationNumbers();
  const maxItems = Math.max(1, options.maxItems);

  let scbScanned = 0;
  let scbMatched = 0;
  let processed = 0;
  let linked = 0;
  let skippedExisting = 0;
  let hitCap = false;

  await report({
    phase: "scanning",
    message: `Step 1/1 · Importing new companies (up to ${maxItems}) from turnover class ${omsClasses
      .map((k) => k.kod)
      .join(", ")}`,
    scanned: 0,
    matched: 0,
    processed: 0,
  });

  for (const oms of omsClasses) {
    if (hitCap) break;

    const omsKey = String(oms.kod);
    let cursor = state.byOmsKl[omsKey] ?? {
      cursorId: null,
      exhausted: false,
    };
    if (cursor.exhausted) continue;

    const classCount = await countJeByOmsattningsklass(oms.kod);
    await report({
      phase: "importing",
      message: `Turnover class ${oms.kod} (${formatOmsattningsklassOption(oms.kod)}) — ${classCount.toLocaleString("en-US")} at SCB · resume ${cursor.cursorId == null ? "from start" : `cursor ${cursor.cursorId}`}`,
      scanned: scbScanned,
      matched: scbMatched,
      processed,
    });

    while (!hitCap && !cursor.exhausted) {
      const page = await fetchJePageByOmsattningsklass(oms.kod, {
        cursorId: cursor.cursorId,
      });

      let stopMidPage = false;
      for (const je of page.jes) {
        scbScanned += 1;

        if (je.ftgStat !== ACTIVE_FTG_STAT) continue;
        if (je.jurform !== AB_JUR_FORM) continue;
        if (je.orgNr && !je.orgNr.startsWith("55")) continue;

        const matchedAudiences = audiences.filter((a) =>
          audienceMatchesJe(a, je, oms.kod)
        );
        if (matchedAudiences.length === 0) continue;

        scbMatched += 1;
        const org = je.orgNr;
        if (!org) continue;

        const audienceIds = matchedAudiences.map((a) => a.id);
        const alreadyHave = existingOrgs.has(org);

        if (alreadyHave) {
          await upsertFromJe({ je, omsKl: oms.kod, audienceIds });
          linked += audienceIds.length;
          skippedExisting += 1;
          continue;
        }

        if (processed >= maxItems) {
          // Keep cursor on this page so the next run can save remaining matches.
          stopMidPage = true;
          hitCap = true;
          break;
        }

        await upsertFromJe({ je, omsKl: oms.kod, audienceIds });
        existingOrgs.add(org);
        processed += 1;
        linked += audienceIds.length;

        if (processed % 10 === 0 || processed === maxItems) {
          await report({
            phase: "importing",
            message: `Saving new companies (${processed}/${maxItems}) · class ${oms.kod}`,
            scanned: scbScanned,
            matched: scbMatched,
            processed,
          });
        }
      }

      if (stopMidPage) {
        state.byOmsKl[omsKey] = {
          cursorId: cursor.cursorId,
          exhausted: false,
        };
        await saveCursorState(state);
        break;
      }

      if (!page.hasMore) {
        cursor = { cursorId: null, exhausted: true };
        state.byOmsKl[omsKey] = cursor;
        await saveCursorState(state);
        break;
      }

      cursor = { cursorId: page.nextCursorId, exhausted: false };
      state.byOmsKl[omsKey] = cursor;
      await saveCursorState(state);

      if (processed >= maxItems) {
        hitCap = true;
        break;
      }
    }
  }

  const allExhausted = omsClasses.every(
    (oms) => state.byOmsKl[String(oms.kod)]?.exhausted === true
  );

  let message: string;
  if (hitCap) {
    message = `SCB API: imported ${processed} new (cap ${maxItems}). Run again to continue. Scanned ${scbScanned}, matched ${scbMatched}, already in Radar ${skippedExisting}.`;
  } else if (allExhausted && processed === 0) {
    message = `Import caught up — 0 new companies. Scanned ${scbScanned}, matched ${scbMatched}, already in Radar ${skippedExisting}.`;
  } else if (allExhausted) {
    message = `Import caught up — imported ${processed} new. Scanned ${scbScanned}, matched ${scbMatched}, already in Radar ${skippedExisting}.`;
  } else {
    message = `SCB API: imported ${processed} new. Scanned ${scbScanned}, matched ${scbMatched}, already in Radar ${skippedExisting}.`;
  }

  await report({
    phase: "done",
    message,
    scanned: scbScanned,
    matched: scbMatched,
    processed,
  });

  return {
    processed,
    linked,
    skipped: skippedExisting,
    scbScanned,
    scbMatched,
    bvEnriched: 0,
    bvDeregisteredSkipped: 0,
    source: "scb_api",
    message,
  };
}
