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
          team: [],
          role: [],
          prob: "weighted",
          projects: "all",
          bookedOnly: false,
        }
      )
    ).toBe("year=2026&from=1&to=10");
  });

  it("includes non-default filters and preserves extras", () => {
    expect(
      buildAllocationSearch(
        { year: 2026, from: 1, to: 10 },
        {
          team: ["t1", "t2"],
          role: ["r1"],
          prob: "none",
          projects: "hide100",
          bookedOnly: true,
        },
        "foo=bar"
      )
    ).toBe(
      "foo=bar&year=2026&from=1&to=10&team=t1%2Ct2&role=r1&prob=none&projects=hide100&bookedOnly=1"
    );
  });

  it("strips legacy unbooked param when applying filters", () => {
    expect(
      buildAllocationSearch(
        { year: 2026, from: 1, to: 10 },
        { bookedOnly: false },
        "unbooked=1"
      )
    ).toBe("year=2026&from=1&to=10");
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
      "team=t1,t2&prob=none&projects=hideNon100&bookedOnly=1"
    );
    expect(readAllocationFilters(params)).toEqual({
      team: ["t1", "t2"],
      role: [],
      prob: "none",
      projects: "hideNon100",
      bookedOnly: true,
    });
  });

  it("reads single team for backwards compatibility", () => {
    expect(readAllocationFilters(new URLSearchParams("team=t1"))).toEqual({
      team: ["t1"],
      role: [],
      prob: "weighted",
      projects: "all",
      bookedOnly: false,
    });
  });

  it("ignores legacy unbooked=1 (show-all is already the default)", () => {
    expect(
      readAllocationFilters(new URLSearchParams("unbooked=1"))
    ).toEqual({
      team: [],
      role: [],
      prob: "weighted",
      projects: "all",
      bookedOnly: false,
    });
  });

  it("reads availability view", () => {
    expect(
      readAllocationFilters(new URLSearchParams("projects=availability"))
    ).toEqual({
      team: [],
      role: [],
      prob: "weighted",
      projects: "availability",
      bookedOnly: false,
    });
  });
});
