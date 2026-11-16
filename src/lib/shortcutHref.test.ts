import { describe, expect, it } from "vitest";
import {
  buildCurrentPageHref,
  normalizeShortcutHref,
  shortcutMatchKey,
} from "./shortcutHref";

describe("normalizeShortcutHref", () => {
  it("sorts query keys and drops empties", () => {
    expect(normalizeShortcutHref("/planner/consultant?to=10&from=1&year=2026")).toBe(
      "/planner/consultant?from=1&to=10&year=2026"
    );
  });

  it("adds a leading slash", () => {
    expect(normalizeShortcutHref("settings/people")).toBe("/settings/people");
  });
});

describe("shortcutMatchKey", () => {
  it("ignores week-range params", () => {
    expect(
      shortcutMatchKey(
        "/planner/consultant?year=2026&from=1&to=10&team=abc"
      )
    ).toBe("/planner/consultant?team=abc");
    expect(
      shortcutMatchKey(
        "/planner/consultant?team=abc&year=2025&from=40&to=52"
      )
    ).toBe("/planner/consultant?team=abc");
  });

  it("keeps other filters", () => {
    expect(
      shortcutMatchKey(
        "/planner/consultant?prob=none&projects=hide100&role=r1&team=t1&bookedOnly=1"
      )
    ).toBe(
      "/planner/consultant?bookedOnly=1&prob=none&projects=hide100&role=r1&team=t1"
    );
  });
});

describe("buildCurrentPageHref", () => {
  it("combines pathname and search", () => {
    expect(buildCurrentPageHref("/planner/consultant", "team=t1&year=2026")).toBe(
      "/planner/consultant?team=t1&year=2026"
    );
  });
});
