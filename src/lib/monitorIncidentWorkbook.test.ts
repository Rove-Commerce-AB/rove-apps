import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { IncidentPage } from "./monitorIncidents";
import { buildMonitorIncidentWorkbook } from "./monitorIncidentWorkbook";

describe("monitor incident Excel export", () => {
  it("exports the table columns, Stockholm times, and total for the selected period", async () => {
    const data: IncidentPage = {
      monitor: { id: "00000000-0000-4000-8000-000000000001", name: "Example", customerName: "Customer", url: "https://example.com" },
      incidents: [{
        id: "00000000-0000-4000-8000-000000000002",
        startedAt: "2026-10-21T13:17:00.000Z",
        confirmedAt: "2026-10-21T13:18:00.000Z",
        lastFailureAt: "2026-10-21T13:35:00.000Z",
        recoveredAt: "2026-10-21T13:35:00.000Z",
        failureCount: 14,
        downtimeMinutes: 18,
      }],
      total: 1, page: 1, pageCount: 1,
      filters: { from: "2026-09-23", to: "2026-10-22" },
      totalDowntimeMinutes: 18, uptimePercent: 99.96,
      periodStartAt: "2026-09-22T22:00:00.000Z",
      periodEndAt: "2026-10-22T12:00:00.000Z",
      today: "2026-10-22",
    };

    const bytes = await buildMonitorIncidentWorkbook(data);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet("Incidents");
    expect(sheet).toBeDefined();
    expect(sheet!.getRow(1).values).toEqual([
      , "Status", "Started", "Confirmed", "Last failure", "Recovered", "Failures", "Downtime (min)",
    ]);
    expect(sheet!.getCell("A2").value).toBe("Recovered");
    expect(sheet!.getCell("B2").value).toEqual(new Date("2026-10-21T15:17:00.000Z"));
    expect(sheet!.getCell("F2").value).toBe(14);
    expect(sheet!.getCell("G2").value).toBe(18);
    expect(sheet!.getCell("G3").value).toBe(18);
  });
});
