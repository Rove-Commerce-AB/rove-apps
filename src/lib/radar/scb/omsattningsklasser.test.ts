import { describe, expect, it } from "vitest";
import {
  formatAnstallningsklassRange,
  omsattningsklasserForRevenueRange,
  omsattningsklassByKod,
} from "@/lib/radar/scb/omsattningsklasser";

describe("omsattningsklasserForRevenueRange", () => {
  it("maps 100–500 mkr to class 8", () => {
    const classes = omsattningsklasserForRevenueRange(
      100_000_000,
      500_000_000
    );
    expect(classes.map((c) => c.kod)).toEqual([8, 9]);
  });

  it("maps tight band inside class 8", () => {
    const classes = omsattningsklasserForRevenueRange(
      150_000_000,
      400_000_000
    );
    expect(classes.map((c) => c.kod)).toEqual([8]);
  });
});

describe("omsattningsklassByKod", () => {
  it("has label for class 8", () => {
    expect(omsattningsklassByKod(8)?.label).toContain("100 000");
  });
});

describe("formatAnstallningsklassRange", () => {
  it("formats a closed band", () => {
    expect(formatAnstallningsklassRange(5)).toBe("20–49");
  });

  it("formats open-ended band", () => {
    expect(formatAnstallningsklassRange(16)).toBe("10,000+");
  });
});
