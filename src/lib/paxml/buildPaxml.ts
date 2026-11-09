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

/** Build a PAXml 1.0 document with tidtransaktioner for Fortnox calendar import. */
export function buildPaxmlDocument(
  transactions: PaxmlTidtrans[],
  options?: { generatedAt?: Date; programName?: string }
): string {
  const generatedAt = options?.generatedAt ?? new Date();
  const programName = options?.programName ?? "RovePlanner";
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
    `    <version>1.0</version>`,
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
