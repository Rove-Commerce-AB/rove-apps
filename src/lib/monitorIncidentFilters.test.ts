import { describe, expect, it } from "vitest";
import { incidentUptimePercent, parseIncidentDate, parseIncidentPage, resolveIncidentPeriod } from "./monitorIncidentFilters";

describe("monitor incident filters", () => {
  it("accepts real ISO calendar dates and rejects invalid dates", () => {
    expect(parseIncidentDate("2026-10-21")).toBe("2026-10-21");
    expect(parseIncidentDate(undefined)).toBeUndefined();
    expect(() => parseIncidentDate("2026-02-30")).toThrow();
    expect(() => parseIncidentDate("2026-2-3")).toThrow();
  });

  it("keeps page numbers bounded", () => {
    expect(parseIncidentPage("2")).toBe(2);
    expect(parseIncidentPage("0")).toBe(1);
    expect(parseIncidentPage("oops")).toBe(1);
    expect(parseIncidentPage("999999")).toBe(10000);
  });

  it("shows the last 30 calendar days when no dates are selected", () => {
    expect(resolveIncidentPeriod({}, "2026-10-21")).toEqual({
      from: "2026-09-22", to: "2026-10-21",
    });
    expect(resolveIncidentPeriod({ to: "2026-03-01" }, "2026-10-21")).toEqual({
      from: "2026-01-31", to: "2026-03-01",
    });
  });

  it("rejects reversed and future periods", () => {
    expect(() => resolveIncidentPeriod({ from: "2026-10-22" }, "2026-10-21")).toThrow();
    expect(() => resolveIncidentPeriod({ from: "2026-10-10", to: "2026-10-09" }, "2026-10-21")).toThrow();
  });

  it("calculates uptime from recorded downtime", () => {
    expect(incidentUptimePercent(60, 15)).toBe(75);
    expect(incidentUptimePercent(60, 0)).toBe(100);
    expect(incidentUptimePercent(0, 0)).toBeNull();
    expect(incidentUptimePercent(60, 90)).toBe(0);
    expect(incidentUptimePercent(30 * 24 * 60, 18)).toBeCloseTo(99.9583, 3);
  });
});
