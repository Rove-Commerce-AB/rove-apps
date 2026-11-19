import "server-only";

import { listRadarAudiences } from "@/lib/radar/audiences";
import { upsertRadarCompany } from "@/lib/radar/companies";
import { normalizeOrganizationNumber } from "@/lib/radar/orgNumber";
import type { RadarAudience } from "@/lib/radar/types";

/**
 * Normalized company row from a Bolagsverket extract (or compatible adapter).
 * Financial fields are intentionally omitted for real register rows until a
 * licensed source is configured — use financials_origin = 'unknown'.
 */
export type BolagsverketCompanyRow = {
  organization_number: string;
  name: string;
  legal_form?: string | null;
  county?: string | null;
  municipality?: string | null;
  sni_code?: string | null;
  sni_description?: string | null;
  /** Only set when the feed is explicitly demo/licensed. */
  employee_count?: number | null;
  revenue_sek?: number | null;
  financials_origin?: "unknown" | "demo" | "licensed";
  source_ref?: string | null;
};

function matchesAudience(
  row: BolagsverketCompanyRow,
  audience: RadarAudience
): boolean {
  if (audience.status !== "active") return false;

  if (audience.sni_prefixes.length > 0) {
    const sni = row.sni_code ?? "";
    const ok = audience.sni_prefixes.some((prefix) => sni.startsWith(prefix));
    if (!ok) return false;
  }

  if (audience.counties.length > 0) {
    const county = row.county ?? "";
    if (!audience.counties.includes(county)) return false;
  }

  // Size filters apply only when financials exist (demo/licensed feeds).
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

/**
 * Import matching companies into Radar.
 * Pass rows from a Bolagsverket JSON extract (RADAR_BOLAGSVERKET_PATH) or an
 * in-memory adapter. Real Bolagsverket identity rows should use
 * financials_origin 'unknown' (no revenue/employees).
 */
export async function importBolagsverketRows(
  rows: BolagsverketCompanyRow[],
  options?: { maxItems?: number }
): Promise<{ processed: number; linked: number; skipped: number }> {
  const audiences = (await listRadarAudiences()).filter(
    (a) => a.status === "active"
  );
  let processed = 0;
  let linked = 0;
  let skipped = 0;
  const max = options?.maxItems ?? rows.length;

  for (const row of rows) {
    if (processed >= max) break;
    const org = normalizeOrganizationNumber(row.organization_number);
    if (!org) {
      skipped += 1;
      continue;
    }

    const matchedAudiences = audiences.filter((a) => matchesAudience(row, a));
    if (matchedAudiences.length === 0) {
      skipped += 1;
      continue;
    }

    await upsertRadarCompany({
      organization_number: org,
      name: row.name,
      legal_form: row.legal_form,
      county: row.county,
      municipality: row.municipality,
      sni_code: row.sni_code,
      sni_description: row.sni_description,
      employee_count: row.employee_count ?? null,
      revenue_sek: row.revenue_sek ?? null,
      financials_origin: row.financials_origin ?? "unknown",
      source: row.financials_origin === "demo" ? "demo" : "bolagsverket",
      source_ref: row.source_ref ?? null,
      is_demo: row.financials_origin === "demo",
      audienceIds: matchedAudiences.map((a) => a.id),
    });
    processed += 1;
    linked += matchedAudiences.length;
  }

  return { processed, linked, skipped };
}

/** Built-in sample extract used when no external file is configured. */
export function getDemoBolagsverketExtract(): BolagsverketCompanyRow[] {
  return [
    {
      organization_number: "5560000011",
      name: "Lake District Apparel AB",
      legal_form: "AB",
      county: "Stockholm",
      municipality: "Stockholm",
      sni_code: "47710",
      sni_description: "Retail sale of clothing in specialised stores",
      employee_count: 55,
      revenue_sek: 74000000,
      financials_origin: "demo",
      source_ref: "demo-extract",
    },
    {
      organization_number: "5560000012",
      name: "West Coast Components AB",
      legal_form: "AB",
      county: "Västra Götaland",
      municipality: "Göteborg",
      sni_code: "46690",
      sni_description: "Wholesale of other machinery and equipment",
      employee_count: 120,
      revenue_sek: 220000000,
      financials_origin: "demo",
      source_ref: "demo-extract",
    },
    {
      organization_number: "5560000013",
      name: "Identity Only Retail AB",
      legal_form: "AB",
      county: "Skåne",
      municipality: "Helsingborg",
      sni_code: "47710",
      sni_description: "Retail sale of clothing in specialised stores",
      financials_origin: "unknown",
      source_ref: "bolagsverket-identity-only",
    },
  ];
}
