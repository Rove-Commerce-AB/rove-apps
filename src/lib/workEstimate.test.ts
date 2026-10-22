import { describe, expect, it } from "vitest";
import {
  formatWorkEstimate,
  formatWorkEstimatePair,
  formatVisibleWorkEstimate,
  parseWorkEstimateUnit,
  parseWorkEstimateValue,
  workEstimateComparesToLogged,
} from "@/lib/workEstimate";

describe("parseWorkEstimateUnit", () => {
  it("defaults to hours", () => {
    expect(parseWorkEstimateUnit(null)).toBe("hours");
    expect(parseWorkEstimateUnit("nope")).toBe("hours");
  });
  it("accepts known units", () => {
    expect(parseWorkEstimateUnit("points")).toBe("points");
    expect(parseWorkEstimateUnit("CURRENCY")).toBe("currency");
  });
});

describe("formatWorkEstimate", () => {
  it("formats hours", () => {
    expect(formatWorkEstimate(8, "hours")).toBe("8h");
    expect(formatWorkEstimate(3.5, "hours")).toBe("3.5h");
  });
  it("formats points as integers", () => {
    expect(formatWorkEstimate(5, "points")).toBe("5 pts");
  });
  it("formats currency with sv-SE and code", () => {
    expect(formatWorkEstimate(8000, "currency", "SEK")).toMatch(/8[\u00a0 ]?000 SEK/);
    expect(formatWorkEstimate(12.5, "currency", "EUR")).toMatch(/12[,.]50 EUR/);
  });
});

describe("formatWorkEstimatePair", () => {
  it("pairs hours", () => {
    expect(formatWorkEstimatePair(3.5, 8, "hours")).toBe("3.5h / 8h");
  });
  it("separates logged hours from non-hour estimates", () => {
    expect(formatWorkEstimatePair(4, 5, "points")).toBe("4h · 5 pts");
  });
});

describe("formatVisibleWorkEstimate", () => {
  it("respects visibility flags", () => {
    expect(
      formatVisibleWorkEstimate(2, 8, {
        showEstimates: false,
        showReportedTime: true,
        estimateUnit: "hours",
      })
    ).toBe("2h");
    expect(
      formatVisibleWorkEstimate(2, 8, {
        showEstimates: true,
        showReportedTime: false,
        estimateUnit: "points",
      })
    ).toBe("8 pts");
  });
});

describe("parseWorkEstimateValue", () => {
  it("parses hours and currency decimals", () => {
    expect(parseWorkEstimateValue("3,5", "hours")).toEqual({
      ok: true,
      value: 3.5,
    });
    expect(parseWorkEstimateValue("1000.5", "currency")).toEqual({
      ok: true,
      value: 1000.5,
    });
  });
  it("requires integer points", () => {
    expect(parseWorkEstimateValue("3.5", "points").ok).toBe(false);
    expect(parseWorkEstimateValue("3", "points")).toEqual({
      ok: true,
      value: 3,
    });
  });
});

describe("workEstimateComparesToLogged", () => {
  it("only hours compare to logged time", () => {
    expect(workEstimateComparesToLogged("hours")).toBe(true);
    expect(workEstimateComparesToLogged("currency")).toBe(false);
    expect(workEstimateComparesToLogged("points")).toBe(false);
  });
});
