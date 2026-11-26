import { describe, expect, it } from "vitest";
import { buildWeeksArray } from "./allocationWeekParams";

describe("buildWeeksArray", () => {
  it("builds contiguous weeks in one year", () => {
    const weeks = buildWeeksArray(2026, 19, 24);
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toEqual({ year: 2026, week: 19 });
    expect(weeks[5]).toEqual({ year: 2026, week: 24 });
  });

  it("supports long spans without clipping", () => {
    const weeks = buildWeeksArray(2024, 19, 71);
    expect(weeks).toHaveLength(53);
    expect(weeks[0]).toEqual({ year: 2024, week: 19 });
    expect(weeks[52]).toEqual({ year: 2024, week: 71 });
  });

  it("includes ISO week 53 when rolling into the next year", () => {
    const weeks = buildWeeksArray(2026, 52, 2);
    expect(weeks).toEqual([
      { year: 2026, week: 52 },
      { year: 2026, week: 53 },
      { year: 2027, week: 1 },
      { year: 2027, week: 2 },
    ]);
  });

  it("allows allocating week 53 alone in a 53-week year", () => {
    expect(buildWeeksArray(2026, 53, 53)).toEqual([
      { year: 2026, week: 53 },
    ]);
  });
});
