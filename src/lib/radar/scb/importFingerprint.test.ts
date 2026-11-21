import { describe, expect, it } from "vitest";
import { audienceImportFingerprint } from "@/lib/radar/scb/importFingerprint";
import type { RadarAudience } from "@/lib/radar/types";

function audience(
  partial: Partial<RadarAudience> & Pick<RadarAudience, "id" | "name">
): RadarAudience {
  return {
    status: "active",
    priority: 50,
    sni_prefixes: ["47"],
    counties: [],
    employee_min: null,
    employee_max: null,
    oms_kl_codes: [8],
    revenue_min_sek: null,
    revenue_max_sek: null,
    estimated_company_count: null,
    notes: null,
    company_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  };
}

describe("audienceImportFingerprint", () => {
  it("is stable for the same filters", () => {
    const a = [
      audience({ id: "b", name: "B", sni_prefixes: ["47", "46"] }),
      audience({ id: "a", name: "A", counties: ["Skåne", "Stockholm"] }),
    ];
    const b = [
      audience({ id: "a", name: "A", counties: ["Stockholm", "Skåne"] }),
      audience({ id: "b", name: "B", sni_prefixes: ["46", "47"] }),
    ];
    expect(audienceImportFingerprint(a)).toBe(audienceImportFingerprint(b));
  });

  it("changes when turnover class changes", () => {
    const a = [audience({ id: "a", name: "A", oms_kl_codes: [8] })];
    const b = [audience({ id: "a", name: "A", oms_kl_codes: [7] })];
    expect(audienceImportFingerprint(a)).not.toBe(
      audienceImportFingerprint(b)
    );
  });
});
