/**
 * Build a Content-Disposition value that stays within Latin-1 header bytes.
 * Non-ASCII names use RFC 5987 `filename*` so downloads keep the real name.
 */
export function buildContentDisposition(
  disposition: "inline" | "attachment",
  fileName: string
): string {
  const cleaned = fileName.replace(/[\r\n"]/g, "_").trim() || "file";
  const asciiFallback =
    cleaned
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") || "file";
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(cleaned)}`;
}
