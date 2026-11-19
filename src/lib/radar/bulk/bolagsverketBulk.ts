import { createReadStream } from "fs";
import { createInterface } from "readline";
import { normalizeOrganizationNumber } from "@/lib/radar/orgNumber";

export type BolagsverketBulkRecord = {
  organization_number: string;
  name: string;
  legal_form_code: string | null;
  deregistered: boolean;
  deregistered_at: string | null;
  activity_description: string | null;
  postort: string | null;
  postnr: string | null;
};

function splitCsvSemicolon(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ";" && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function stripCodeSuffix(value: string, marker: string): string {
  const idx = value.indexOf(marker);
  if (idx === -1) return value.trim();
  return value.slice(0, idx).trim();
}

function parseName(raw: string): string {
  // "Name$FORETAGSNAMN-ORGNAM$1993-03-15" or with extra SARS segments
  const primary = raw.split("|")[0] ?? raw;
  return stripCodeSuffix(primary, "$");
}

function parsePostort(raw: string): { postort: string | null; postnr: string | null } {
  // Gata$$ORT$POSTNR$SE-LAND
  const parts = raw.split("$");
  const postort = (parts[2] ?? "").trim() || null;
  const postnr = (parts[3] ?? "").trim() || null;
  return { postort, postnr };
}

export function parseBolagsverketDataLine(
  line: string,
  headerIndex: Map<string, number>
): BolagsverketBulkRecord | null {
  const cols = splitCsvSemicolon(line);
  const get = (name: string) => {
    const i = headerIndex.get(name);
    if (i == null) return "";
    return (cols[i] ?? "").trim();
  };

  const idRaw = get("organisationsidentitet");
  const orgDigits = stripCodeSuffix(idRaw, "$").replace(/\D/g, "");
  const org = normalizeOrganizationNumber(orgDigits);
  if (!org) return null;

  const name = parseName(get("organisationsnamn"));
  if (!name) return null;

  const deregRaw = get("avregistreringsdatum");
  const deregistered = Boolean(deregRaw && deregRaw.trim());
  const { postort, postnr } = parsePostort(get("postadress"));

  return {
    organization_number: org,
    name,
    legal_form_code: stripCodeSuffix(get("organisationsform"), "$") || null,
    deregistered,
    deregistered_at: deregistered ? deregRaw : null,
    activity_description: get("verksamhetsbeskrivning") || null,
    postort,
    postnr,
  };
}

/**
 * Stream Bolagsverket bulk; only yields rows whose orgnr is in `wanted`
 * (keeps memory bounded when wanted is the SCB candidate set).
 */
export async function* streamBolagsverketBulkForOrgnrs(
  filePath: string,
  wanted: ReadonlySet<string>
): AsyncGenerator<BolagsverketBulkRecord> {
  if (wanted.size === 0) return;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let headerIndex: Map<string, number> | null = null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!headerIndex) {
      const headers = splitCsvSemicolon(line).map((h) =>
        h.replace(/^"|"$/g, "").trim()
      );
      headerIndex = new Map(headers.map((h, i) => [h, i]));
      if (!headerIndex.has("organisationsidentitet")) {
        throw new Error(
          "Bolagsverket bulk file missing organisationsidentitet column"
        );
      }
      continue;
    }
    const parsed = parseBolagsverketDataLine(line, headerIndex);
    if (!parsed) continue;
    if (!wanted.has(parsed.organization_number)) continue;
    yield parsed;
  }
}
