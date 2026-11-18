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

/** Fortnox import expects decimal hours with two fraction digits (e.g. 6.00). */
function formatHours(hours: number): string {
  return (Math.round(hours * 100) / 100).toFixed(2);
}

/**
 * Fortnox Lön import requires PAXml 2.3 (schema at
 * http://www.paxml.se/2.3/paxml.xsd), including XSI schemaLocation on the root,
 * sequential postid on each tidtrans, and two-decimal hours.
 * Omit optional `<format>LÖNIN</format>` so the file stays ASCII-safe through
 * mail/transfer (Ö is outside 7-bit ASCII).
 */
export const PAXML_VERSION = "2.3" as const;

const PAXML_SCHEMA_LOCATION = "http://www.paxml.se/2.3/paxml.xsd";

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
    .map((tx, index) => {
      const postid = index + 1;
      return [
        `    <tidtrans postid="${postid}" anstid="${escapeXml(tx.employmentNumber)}">`,
        `      <tidkod>${escapeXml(tx.tidkod)}</tidkod>`,
        `      <datum>${escapeXml(tx.date)}</datum>`,
        `      <timmar>${formatHours(tx.hours)}</timmar>`,
        `    </tidtrans>`,
      ].join("\n");
    })
    .join("\n");

  return [
    `<?xml version="1.0" encoding="ISO-8859-1"?>`,
    `<paxml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="${PAXML_SCHEMA_LOCATION}">`,
    `  <header>`,
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
