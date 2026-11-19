import "server-only";

import { access } from "fs/promises";
import { listRadarAudiences } from "@/lib/radar/audiences";
import { streamBolagsverketBulkForOrgnrs } from "@/lib/radar/bulk/bolagsverketBulk";
import { resolveCounty } from "@/lib/radar/bulk/countyLookup";
import { streamScbBulkCompanies } from "@/lib/radar/bulk/scbBulk";
import {
  getDemoBolagsverketExtract,
  importBolagsverketRows,
  type BolagsverketCompanyRow,
} from "@/lib/radar/bolagsverket";
import { upsertRadarCompany } from "@/lib/radar/companies";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import type { RadarAudience } from "@/lib/radar/types";

export type BulkImportResult = {
  processed: number;
  linked: number;
  skipped: number;
  scbScanned: number;
  scbMatched: number;
  bvEnriched: number;
  bvDeregisteredSkipped: number;
  source: "scb_bolagsverket_bulk" | "demo_fallback" | "json_path";
  message: string;
};

function rowMatchesAudience(
  row: BolagsverketCompanyRow,
  audience: RadarAudience
): boolean {
  if (audience.status !== "active") return false;

  if (audience.sni_prefixes.length > 0) {
    const codes = [
      row.sni_code ?? "",
      ...((row as { sni_codes?: string[] }).sni_codes ?? []),
    ];
    const ok = audience.sni_prefixes.some((prefix) =>
      codes.some((sni) => sni.startsWith(prefix))
    );
    if (!ok) return false;
  }

  if (audience.counties.length > 0) {
    const county = row.county ?? "";
    if (!audience.counties.includes(county)) return false;
  }

  // Size filters only apply when financials are present (demo/licensed).
  // Real SCB/BV bulk rows have unknown financials — do not skip them.
  const hasFinancials =
    row.financials_origin === "demo" ||
    row.financials_origin === "licensed" ||
    row.employee_count != null ||
    row.revenue_sek != null;

  if (hasFinancials) {
    const employees = row.employee_count;
    if (audience.employee_min != null) {
      if (employees == null || employees < audience.employee_min) return false;
    }
    if (audience.employee_max != null) {
      if (employees == null || employees > audience.employee_max) return false;
    }
    const revenue = row.revenue_sek;
    if (audience.revenue_min_sek != null) {
      if (revenue == null || revenue < audience.revenue_min_sek) return false;
    }
    if (audience.revenue_max_sek != null) {
      if (revenue == null || revenue > audience.revenue_max_sek) return false;
    }
  }

  return true;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function updateAudienceEstimates(
  audiences: RadarAudience[],
  matchCounts: Map<string, number>
): Promise<void> {
  for (const audience of audiences) {
    const count = matchCounts.get(audience.id);
    if (count == null) continue;
    await cloudSqlPool.query(
      `UPDATE radar_audiences
       SET estimated_company_count = $2
       WHERE id = $1`,
      [audience.id, count]
    );
  }
}

export type BulkImportProgress = {
  phase: "scanning" | "enriching" | "importing" | "done";
  message: string;
  scanned?: number;
  matched?: number;
  processed?: number;
};

/**
 * Import from SCB (+ optional Bolagsverket) bulk files when paths are set.
 * Falls back to JSON path or built-in demo extract.
 */
export async function runCompanyBulkImport(options?: {
  maxItems?: number;
  onProgress?: (progress: BulkImportProgress) => void | Promise<void>;
}): Promise<BulkImportResult> {
  const maxItems = options?.maxItems ?? 100;
  const onProgress = options?.onProgress;
  const scbPath = process.env.RADAR_SCB_BULK_PATH?.trim();
  const bvPath = process.env.RADAR_BOLAGSVERKET_PATH?.trim();

  if (scbPath && (await fileExists(scbPath))) {
    return importFromScbAndBolagsverket({
      scbPath,
      bvPath: bvPath && (await fileExists(bvPath)) ? bvPath : null,
      maxItems,
      onProgress,
    });
  }

  // Legacy: JSON array at RADAR_BOLAGSVERKET_PATH
  if (bvPath && (await fileExists(bvPath)) && bvPath.toLowerCase().endsWith(".json")) {
    const { readFile } = await import("fs/promises");
    const raw = await readFile(bvPath, "utf8");
    const parsed = JSON.parse(raw) as BolagsverketCompanyRow[];
    if (!Array.isArray(parsed)) {
      throw new Error("Bolagsverket JSON extract must be an array");
    }
    const result = await importBolagsverketRows(parsed, { maxItems });
    return {
      ...result,
      scbScanned: 0,
      scbMatched: 0,
      bvEnriched: 0,
      bvDeregisteredSkipped: 0,
      source: "json_path",
      message: `JSON import: imported ${result.processed}, skipped ${result.skipped}`,
    };
  }

  const demo = getDemoBolagsverketExtract();
  const result = await importBolagsverketRows(demo, { maxItems });
  return {
    ...result,
    scbScanned: 0,
    scbMatched: 0,
    bvEnriched: 0,
    bvDeregisteredSkipped: 0,
    source: "demo_fallback",
    message: `Demo fallback: imported ${result.processed}, skipped ${result.skipped}`,
  };
}

async function importFromScbAndBolagsverket(input: {
  scbPath: string;
  bvPath: string | null;
  maxItems: number;
  onProgress?: (progress: BulkImportProgress) => void | Promise<void>;
}): Promise<BulkImportResult> {
  const report = async (progress: BulkImportProgress) => {
    await input.onProgress?.(progress);
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
      source: "scb_bolagsverket_bulk",
      message: "No active target groups — nothing to import",
    };
  }

  type Candidate = BolagsverketCompanyRow & {
    sni_codes: string[];
    audienceIds: string[];
  };

  const candidates = new Map<string, Candidate>();
  const audienceMatchCounts = new Map<string, number>();
  let scbScanned = 0;
  let scbMatched = 0;
  let lastProgressAt = 0;

  await report({
    phase: "scanning",
    message: "Step 1/3 · Scanning SCB register for target-group matches",
    scanned: 0,
    matched: 0,
  });

  for await (const company of streamScbBulkCompanies(input.scbPath)) {
    scbScanned += 1;
    const row: BolagsverketCompanyRow & { sni_codes: string[] } = {
      organization_number: company.organization_number,
      name: company.name,
      legal_form: company.legal_form,
      county: company.county,
      municipality: company.municipality,
      sni_code: company.primary_sni,
      sni_codes: company.sni_codes,
      financials_origin: "unknown",
      source_ref: "scb-bulk",
    };

    const matched = audiences.filter((a) => rowMatchesAudience(row, a));
    if (matched.length === 0) {
      if (scbScanned - lastProgressAt >= 25000) {
        lastProgressAt = scbScanned;
        await report({
          phase: "scanning",
          message: `Step 1/3 · Scanning SCB — ${scbScanned.toLocaleString("sv-SE")} rows read, ${scbMatched.toLocaleString("sv-SE")} matches`,
          scanned: scbScanned,
          matched: scbMatched,
        });
      }
      continue;
    }

    scbMatched += 1;
    for (const a of matched) {
      audienceMatchCounts.set(
        a.id,
        (audienceMatchCounts.get(a.id) ?? 0) + 1
      );
    }

    // Keep collecting matches for estimates; only first maxItems are imported
    // after BV enrichment. Prefer higher-priority audiences already sorted.
    // Keep a buffer larger than maxItems so Bolagsverket deregistration
    // still leaves enough companies to import.
    if (candidates.size < Math.max(input.maxItems * 20, 500)) {
      candidates.set(company.organization_number, {
        ...row,
        audienceIds: matched.map((a) => a.id),
      });
    }

    if (scbScanned - lastProgressAt >= 25000) {
      lastProgressAt = scbScanned;
      await report({
        phase: "scanning",
        message: `Step 1/3 · Scanning SCB — ${scbScanned.toLocaleString("sv-SE")} rows read, ${scbMatched.toLocaleString("sv-SE")} matches`,
        scanned: scbScanned,
        matched: scbMatched,
      });
    }
  }

  await updateAudienceEstimates(audiences, audienceMatchCounts);

  let bvEnriched = 0;
  let bvDeregisteredSkipped = 0;
  const deregistered = new Set<string>();

  if (input.bvPath) {
    await report({
      phase: "enriching",
      message: `Step 2/3 · Enriching ${candidates.size.toLocaleString("sv-SE")} matches via Bolagsverket`,
      scanned: scbScanned,
      matched: scbMatched,
    });
    const wanted = new Set(candidates.keys());
    for await (const bv of streamBolagsverketBulkForOrgnrs(
      input.bvPath,
      wanted
    )) {
      if (bv.deregistered) {
        deregistered.add(bv.organization_number);
        candidates.delete(bv.organization_number);
        bvDeregisteredSkipped += 1;
        continue;
      }
      const existing = candidates.get(bv.organization_number);
      if (!existing) continue;
      const municipality = bv.postort || existing.municipality;
      const county =
        existing.county ||
        resolveCounty({ postnr: bv.postnr, postort: municipality });
      candidates.set(bv.organization_number, {
        ...existing,
        name: bv.name || existing.name,
        municipality,
        county,
        sni_description: bv.activity_description || existing.sni_description,
        source_ref: "scb+bolagsverket-bulk",
      });
      bvEnriched += 1;
    }
  }

  let processed = 0;
  let linked = 0;
  let skipped = Math.max(0, scbMatched - candidates.size);

  await report({
    phase: "importing",
    message: `Step 3/3 · Saving companies (0/${input.maxItems}, ${scbMatched.toLocaleString("sv-SE")} matched)`,
    scanned: scbScanned,
    matched: scbMatched,
    processed: 0,
  });

  for (const candidate of candidates.values()) {
    if (processed >= input.maxItems) break;
    await upsertRadarCompany({
      organization_number: candidate.organization_number,
      name: candidate.name,
      legal_form: candidate.legal_form,
      county: candidate.county,
      municipality: candidate.municipality,
      sni_code: candidate.sni_code,
      sni_description: candidate.sni_description,
      employee_count: null,
      revenue_sek: null,
      financials_origin: "unknown",
      source: "bolagsverket",
      source_ref: candidate.source_ref ?? "scb-bulk",
      is_demo: false,
      audienceIds: candidate.audienceIds,
    });
    processed += 1;
    linked += candidate.audienceIds.length;
    if (processed % 10 === 0 || processed === input.maxItems) {
      await report({
        phase: "importing",
        message: `Step 3/3 · Saving companies (${processed}/${input.maxItems})`,
        scanned: scbScanned,
        matched: scbMatched,
        processed,
      });
    }
  }

  const message = `SCB bulk: scanned ${scbScanned}, matched ${scbMatched}, imported ${processed}, BV enriched ${bvEnriched}, deregistered skipped ${bvDeregisteredSkipped}`;
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
    skipped: skipped + bvDeregisteredSkipped,
    scbScanned,
    scbMatched,
    bvEnriched,
    bvDeregisteredSkipped,
    source: "scb_bolagsverket_bulk",
    message,
  };
}
