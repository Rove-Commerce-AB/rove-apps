import { describe, expect, it } from "vitest";
import { parseIncidentDate, parseIncidentPage } from "./monitorIncidentFilters";

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
});
