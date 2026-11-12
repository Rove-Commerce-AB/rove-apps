import { describe, expect, it } from "vitest";
import { buildPaxmlDocument, encodeIso88591 } from "./buildPaxml";

describe("buildPaxmlDocument", () => {
  it("builds tidtransaktioner for Fortnox import", () => {
    const xml = buildPaxmlDocument(
      [
        {
          employmentNumber: "101",
          tidkod: "SEM",
          date: "2026-07-01",
          hours: 8,
        },
        {
          employmentNumber: "102",
          tidkod: "SJK",
          date: "2026-07-02",
          hours: 4.5,
        },
      ],
      { generatedAt: new Date("2026-11-09T10:00:00.000Z"), programName: "RovePlanner" }
    );

    expect(xml).toContain("<format>LÖNIN</format>");
    expect(xml).toContain("<version>2.0</version>");
    expect(xml).toContain('<tidtrans anstid="101">');
    expect(xml).toContain("<tidkod>SEM</tidkod>");
    expect(xml).toContain("<datum>2026-07-01</datum>");
    expect(xml).toContain("<timmar>8</timmar>");
    expect(xml).toContain('<tidtrans anstid="102">');
    expect(xml).toContain("<timmar>4.5</timmar>");
  });

  it("encodes LÖNIN as ISO-8859-1 single-byte Ö", () => {
    const xml = buildPaxmlDocument(
      [
        {
          employmentNumber: "011",
          tidkod: "SJK",
          date: "2026-10-12",
          hours: 6,
        },
      ],
      { generatedAt: new Date("2026-11-11T13:18:48.000Z") }
    );
    const bytes = encodeIso88591(xml);
    const asLatin1 = Buffer.from(bytes).toString("latin1");
    expect(asLatin1).toContain("<version>2.0</version>");
    const formatIdx = asLatin1.indexOf("<format>");
    const slice = bytes.subarray(formatIdx, formatIdx + 16);
    // <format>L + Ö(0xD6) + NIN
    expect([...slice]).toEqual([
      0x3c, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x3e, 0x4c, 0xd6, 0x4e, 0x49, 0x4e, 0x3c, 0x2f, 0x66,
    ]);
  });
});
