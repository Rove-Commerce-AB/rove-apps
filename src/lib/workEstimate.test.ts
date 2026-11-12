import { describe, expect, it } from "vitest";
import {
  formatWorkEstimate,
  formatWorkEstimatePair,
  formatVisibleWorkEstimate,
  parseWorkEstimateUnit,
  parseWorkEstimateValue,
  parseWorkEstimateSizeValue,
  resolveSizePrice,
  sumFixedSizePrices,
  workEstimateComparesToLogged,
} from "@/lib/workEstimate";

describe("parseWorkEstimateUnit", () => {
  it("defaults to hours", () => {
    expect(parseWorkEstimateUnit(null)).toBe("hours");
    expect(parseWorkEstimateUnit("nope")).toBe("hours");
  });
  it("accepts known units", () => {
    expect(parseWorkEstimateUnit("tshirt")).toBe("tshirt");
    expect(parseWorkEstimateUnit("CURRENCY")).toBe("currency");
  });
  it("maps legacy points to tshirt", () => {
    expect(parseWorkEstimateUnit("points")).toBe("tshirt");
  });
});

describe("formatWorkEstimate", () => {
  it("formats hours", () => {
    expect(formatWorkEstimate(8, "hours")).toBe("8h");
    expect(formatWorkEstimate(3.5, "hours")).toBe("3.5h");
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
    expect(formatWorkEstimatePair(4, 8000, "currency")).toMatch(
      /4h · 8[\u00a0 ]?000 SEK/
    );
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
      formatVisibleWorkEstimate(2, null, {
        showEstimates: true,
        showReportedTime: false,
        estimateUnit: "tshirt",
        estimateSize: "m",
      })
    ).toBe("M");
  });
  it("shows fixed price with t-shirt size", () => {
    expect(
      formatVisibleWorkEstimate(2, null, {
        showEstimates: true,
        showReportedTime: true,
        estimateUnit: "tshirt",
        estimateSize: "l",
        fixedPriceEnabled: true,
        sizePrice: 25000,
        currency: "SEK",
      })
    ).toMatch(/2h · L · 25[\u00a0 ]?000 SEK/);
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
  it("rejects numeric values for tshirt", () => {
    expect(parseWorkEstimateValue("3", "tshirt").ok).toBe(false);
  });
});

describe("parseWorkEstimateSizeValue", () => {
  it("parses sizes", () => {
    expect(parseWorkEstimateSizeValue("M")).toEqual({ ok: true, value: "m" });
    expect(parseWorkEstimateSizeValue("")).toEqual({ ok: true, value: null });
    expect(parseWorkEstimateSizeValue("xxl").ok).toBe(false);
  });
});

describe("size price helpers", () => {
  it("resolves and sums", () => {
    const prices = { xs: 1000, m: 5000, xl: 12000 };
    expect(resolveSizePrice("m", prices)).toBe(5000);
    expect(resolveSizePrice("s", prices)).toBeNull();
    expect(sumFixedSizePrices(["m", "xl", null], prices)).toBe(17000);
  });
});

describe("workEstimateComparesToLogged", () => {
  it("only hours compare to logged time", () => {
    expect(workEstimateComparesToLogged("hours")).toBe(true);
    expect(workEstimateComparesToLogged("currency")).toBe(false);
    expect(workEstimateComparesToLogged("tshirt")).toBe(false);
  });
});
