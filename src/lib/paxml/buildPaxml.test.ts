import { describe, expect, it } from "vitest";
import { buildPaxmlDocument } from "./buildPaxml";

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
    expect(xml).toContain("<version>2.3</version>");
    expect(xml).toContain('<tidtrans anstid="101">');
    expect(xml).toContain("<tidkod>SEM</tidkod>");
    expect(xml).toContain("<datum>2026-07-01</datum>");
    expect(xml).toContain("<timmar>8</timmar>");
    expect(xml).toContain('<tidtrans anstid="102">');
    expect(xml).toContain("<timmar>4.5</timmar>");
  });
});
