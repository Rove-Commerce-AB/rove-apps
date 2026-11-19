import { createReadStream } from "fs";
import { createInterface } from "readline";
import { resolveCounty } from "@/lib/radar/bulk/countyLookup";
import { normalizeOrganizationNumber } from "@/lib/radar/orgNumber";

/** SCB JurForm codes we treat as company-like for Radar MVP. */
export const SCB_ALLOWED_JUR_FORMS = new Set([
  "49", // Aktiebolag
  "51", // Handelsbolag
  "53", // Kommanditbolag
  "42", // Ekonomisk förening
]);

export type ScbBulkCompany = {
  organization_number: string;
  name: string;
  legal_form: string;
  jur_form_code: string;
  sni_codes: string[];
  primary_sni: string | null;
  postort: string | null;
  postnr: string | null;
  county: string | null;
  municipality: string | null;
};

function splitTsv(line: string): string[] {
  return line.split("\t");
}

/**
 * SCB PeOrgNr is 12 digits; legal entities commonly use prefix 16 + 10-digit orgnr.
 */
export function organizationNumberFromPeOrgNr(
  peOrgNr: string
): string | null {
  const digits = peOrgNr.replace(/\D/g, "");
  if (digits.length === 10) return normalizeOrganizationNumber(digits);
  if (digits.length === 12 && digits.startsWith("16")) {
    return normalizeOrganizationNumber(digits.slice(2));
  }
  return null;
}

export function parseScbDataLine(
  line: string,
  headerIndex: Map<string, number>
): ScbBulkCompany | null {
  const cols = splitTsv(line);
  const get = (name: string) => {
    const i = headerIndex.get(name);
    if (i == null) return "";
    return (cols[i] ?? "").trim();
  };

  const peOrgNr = get("PeOrgNr");
  const org = organizationNumberFromPeOrgNr(peOrgNr);
  if (!org) return null;

  const jurForm = get("JurForm");
  // Prefer AB-range org numbers (55…) or allowed jur forms.
  const isAbOrgnr = org.startsWith("55");
  if (!isAbOrgnr && !SCB_ALLOWED_JUR_FORMS.has(jurForm)) return null;

  const sni_codes = ["Ng1", "Ng2", "Ng3", "Ng4", "Ng5"]
    .map((k) => get(k))
    .filter((s) => s && s !== "00000");
  if (sni_codes.length === 0) return null;

  const name = get("Namn") || get("Foretagsnamn");
  if (!name) return null;

  const postort = get("PostOrt") || null;
  const postnr = get("PostNr") || null;

  return {
    organization_number: org,
    name,
    legal_form: jurForm === "49" ? "AB" : jurForm || "unknown",
    jur_form_code: jurForm,
    sni_codes,
    primary_sni: sni_codes[0] ?? null,
    postort,
    postnr,
    county: resolveCounty({ postnr, postort }),
    municipality: postort,
  };
}

export async function* streamScbBulkCompanies(
  filePath: string
): AsyncGenerator<ScbBulkCompany> {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let headerIndex: Map<string, number> | null = null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!headerIndex) {
      const headers = splitTsv(line).map((h) => h.trim());
      headerIndex = new Map(headers.map((h, i) => [h, i]));
      if (!headerIndex.has("PeOrgNr") || !headerIndex.has("Ng1")) {
        throw new Error(
          "SCB bulk file missing required columns PeOrgNr / Ng1"
        );
      }
      continue;
    }
    const parsed = parseScbDataLine(line, headerIndex);
    if (parsed) yield parsed;
  }
}
