import { describe, expect, it } from "vitest";
import {
  formatVisibleWorkHours,
  formatWorkHours,
  formatWorkHoursPair,
  hasWorkTimeToShow,
  parseWorkEstimateHours,
  workTimeBarPercents,
} from "./workTime";

describe("parseWorkEstimateHours", () => {
  it("treats blank as cleared", () => {
    expect(parseWorkEstimateHours("")).toEqual({ ok: true, value: null });
    expect(parseWorkEstimateHours("  ")).toEqual({ ok: true, value: null });
  });

  it("accepts hours with comma or dot", () => {
    expect(parseWorkEstimateHours("8")).toEqual({ ok: true, value: 8 });
    expect(parseWorkEstimateHours("2,5")).toEqual({ ok: true, value: 2.5 });
    expect(parseWorkEstimateHours("2.25")).toEqual({ ok: true, value: 2.25 });
  });

  it("rejects negative and non-numeric", () => {
    expect(parseWorkEstimateHours("-1")).toEqual({ ok: false });
    expect(parseWorkEstimateHours("abc")).toEqual({ ok: false });
  });
});

describe("formatWorkHours", () => {
  it("keeps a compact hours suffix", () => {
    expect(formatWorkHours(8)).toBe("8h");
    expect(formatWorkHours(3.5)).toBe("3.5h");
  });
});

describe("formatWorkHoursPair", () => {
  it("shows logged against estimate when both exist", () => {
    expect(formatWorkHoursPair(3.5, 8)).toBe("3.5h / 8h");
    expect(formatWorkHoursPair(2, null)).toBe("2h");
  });
});

describe("formatVisibleWorkHours", () => {
  it("respects estimate and reported-time visibility flags", () => {
    expect(
      formatVisibleWorkHours(3.5, 8, {
        showEstimates: true,
        showReportedTime: true,
      })
    ).toBe("3.5h / 8h");
    expect(
      formatVisibleWorkHours(3.5, 8, {
        showEstimates: false,
        showReportedTime: true,
      })
    ).toBe("3.5h");
    expect(
      formatVisibleWorkHours(3.5, 8, {
        showEstimates: true,
        showReportedTime: false,
      })
    ).toBe("8h");
    expect(
      formatVisibleWorkHours(3.5, null, {
        showEstimates: true,
        showReportedTime: false,
      })
    ).toBeNull();
    expect(
      formatVisibleWorkHours(3.5, 8, {
        showEstimates: false,
        showReportedTime: false,
      })
    ).toBeNull();
  });
});

describe("workTimeBarPercents", () => {
  it("scales both bars to the larger of estimate and logged", () => {
    expect(workTimeBarPercents(4, 8)).toEqual({
      loggedPct: 50,
      estimatePct: 100,
      over: false,
    });
    expect(workTimeBarPercents(10, 8).over).toBe(true);
    expect(workTimeBarPercents(0, null)).toEqual({
      loggedPct: 0,
      estimatePct: 0,
      over: false,
    });
  });
});

describe("hasWorkTimeToShow", () => {
  it("hides the card graph when nothing is set", () => {
    expect(hasWorkTimeToShow(null, 0)).toBe(false);
    expect(hasWorkTimeToShow(0, 0)).toBe(false);
    expect(hasWorkTimeToShow(8, 0)).toBe(true);
    expect(hasWorkTimeToShow(null, 1)).toBe(true);
  });
});
