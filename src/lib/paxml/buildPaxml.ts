export type PaxmlTidtrans = {
  employmentNumber: string;
  tidkod: string;
  date: string; // YYYY-MM-DD
  hours: number;
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatHours(hours: number): string {
  if (Number.isInteger(hours)) return String(hours);
  return String(Math.round(hours * 100) / 100);
}

/**
 * Fortnox Lön validates against PAXml 2.0 (enumeration in
 * http://www.paxml.se/2.0/paxml.xsd). paxml.se may accept 2.3, but Fortnox rejects it.
 */
export const PAXML_VERSION = "2.0" as const;

/** Encode a Latin-1 string as ISO-8859-1 bytes (Blob defaults to UTF-8). */
export function encodeIso88591(text: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(text.length));
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code > 0xff) {
      throw new Error(
        `Character at index ${i} (U+${code.toString(16).toUpperCase()}) is outside ISO-8859-1`
      );
    }
    out[i] = code;
  }
  return out;
}

/** Build a PAXml document with tidtransaktioner for Fortnox calendar import. */
export function buildPaxmlDocument(
  transactions: PaxmlTidtrans[],
  options?: { generatedAt?: Date; programName?: string }
): string {
  const generatedAt = options?.generatedAt ?? new Date();
  const programName = options?.programName ?? "RovePlanner";
  // xs:dateTime without fractional seconds / Z (schema accepts local dateTime).
  const iso = generatedAt.toISOString().replace(/\.\d{3}Z$/, "");

  const rows = transactions
    .map((tx) => {
      return [
        `    <tidtrans anstid="${escapeXml(tx.employmentNumber)}">`,
        `      <tidkod>${escapeXml(tx.tidkod)}</tidkod>`,
        `      <datum>${escapeXml(tx.date)}</datum>`,
        `      <timmar>${formatHours(tx.hours)}</timmar>`,
        `    </tidtrans>`,
      ].join("\n");
    })
    .join("\n");

  return [
    `<?xml version="1.0" encoding="ISO-8859-1"?>`,
    `<paxml>`,
    `  <header>`,
    `    <format>LÖNIN</format>`,
    `    <version>${PAXML_VERSION}</version>`,
    `    <datum>${iso}</datum>`,
    `    <programnamn>${escapeXml(programName)}</programnamn>`,
    `  </header>`,
    `  <tidtransaktioner>`,
    rows,
    `  </tidtransaktioner>`,
    `</paxml>`,
    ``,
  ].join("\n");
}
