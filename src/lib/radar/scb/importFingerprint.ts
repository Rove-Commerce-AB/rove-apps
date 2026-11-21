import { createHash } from "crypto";
import type { RadarAudience } from "@/lib/radar/types";

/** Stable hash of active target-group filters — cursor resets when this changes. */
export function audienceImportFingerprint(audiences: RadarAudience[]): string {
  const payload = audiences
    .map((a) => ({
      id: a.id,
      sni: [...a.sni_prefixes].sort(),
      counties: [...a.counties].sort(),
      oms: [...a.oms_kl_codes].sort((x, y) => x - y),
      empMin: a.employee_min,
      empMax: a.employee_max,
      revMin: a.revenue_min_sek,
      revMax: a.revenue_max_sek,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 24);
}
