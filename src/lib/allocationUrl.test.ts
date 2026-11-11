import { describe, expect, it } from "vitest";
import {
  buildAllocationSearch,
  readAllocationFilters,
} from "./allocationUrl";

describe("buildAllocationSearch", () => {
  it("omits default filter values", () => {
    expect(
      buildAllocationSearch(
        { year: 2026, from: 1, to: 10 },
        {
          team: null,
          role: null,
          prob: "weighted",
          projects: "all",
          unbooked: false,
        }
      )
    ).toBe("year=2026&from=1&to=10");
  });

  it("includes non-default filters and preserves extras", () => {
    expect(
      buildAllocationSearch(
        { year: 2026, from: 1, to: 10 },
        {
          team: "t1",
          role: "r1",
          prob: "none",
          projects: "hide100",
          unbooked: true,
        },
        "foo=bar"
      )
    ).toBe(
      "foo=bar&year=2026&from=1&to=10&team=t1&role=r1&prob=none&projects=hide100&unbooked=1"
    );
  });

  it("includes availability view", () => {
    expect(
      buildAllocationSearch(
        { year: 2026, from: 1, to: 10 },
        { projects: "availability" }
      )
    ).toBe("year=2026&from=1&to=10&projects=availability");
  });
});

describe("readAllocationFilters", () => {
  it("reads filter params with defaults", () => {
    const params = new URLSearchParams(
      "team=t1&prob=none&projects=hideNon100&unbooked=1"
    );
    expect(readAllocationFilters(params)).toEqual({
      team: "t1",
      role: null,
      prob: "none",
      projects: "hideNon100",
      unbooked: true,
    });
  });

  it("reads availability view", () => {
    expect(
      readAllocationFilters(new URLSearchParams("projects=availability"))
    ).toEqual({
      team: null,
      role: null,
      prob: "weighted",
      projects: "availability",
      unbooked: false,
    });
  });
});
