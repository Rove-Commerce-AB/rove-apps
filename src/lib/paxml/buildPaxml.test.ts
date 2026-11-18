import { describe, expect, it } from "vitest";
import { buildPaxmlDocument, encodeIso88591 } from "./buildPaxml";

describe("buildPaxmlDocument", () => {
  it("builds tidtransaktioner for Fortnox PAXml 2.3 import", () => {
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

    expect(xml).not.toContain("<format>");
    expect(xml).toContain("<version>2.3</version>");
    expect(xml).toContain(
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
    );
    expect(xml).toContain(
      'xsi:noNamespaceSchemaLocation="http://www.paxml.se/2.3/paxml.xsd"'
    );
    expect(xml).toContain('<tidtrans postid="1" anstid="101">');
    expect(xml).toContain("<tidkod>SEM</tidkod>");
    expect(xml).toContain("<datum>2026-07-01</datum>");
    expect(xml).toContain("<timmar>8.00</timmar>");
    expect(xml).toContain('<tidtrans postid="2" anstid="102">');
    expect(xml).toContain("<timmar>4.50</timmar>");
  });

  it("encodes as ISO-8859-1 ASCII-safe bytes without LÖNIN", () => {
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
    expect(Buffer.from(bytes).toString("latin1")).toContain(
      "<version>2.3</version>"
    );
    expect(Buffer.from(bytes).toString("latin1")).toContain(
      '<tidtrans postid="1" anstid="011">'
    );
    expect(Buffer.from(bytes).toString("latin1")).toContain(
      "<timmar>6.00</timmar>"
    );
    expect([...bytes].every((b) => b <= 0x7f)).toBe(true);
  });
});
