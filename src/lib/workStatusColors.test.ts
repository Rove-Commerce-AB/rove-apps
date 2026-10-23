import { describe, expect, it } from "vitest";
import {
  resolveWorkCustomerColor,
  workStatusMixPercents,
  workStatusToneAtIndex,
  workStatusToneById,
} from "./workStatusColors";

describe("workStatusColors", () => {
  it("falls back to default customer color for invalid input", () => {
    expect(resolveWorkCustomerColor("not-a-color")).toBe("#657dd4");
    expect(resolveWorkCustomerColor(null)).toBe("#657dd4");
  });

  it("fades mix from low (left) to higher (right)", () => {
    const mixes = workStatusMixPercents(5);
    expect(mixes).toHaveLength(5);
    expect(mixes[0]).toBeLessThan(mixes[2]!);
    expect(mixes[2]).toBeLessThan(mixes[4]!);
    expect(mixes[0]).toBeLessThan(10);
    expect(mixes[4]).toBeGreaterThan(20);
  });

  it("keeps the same brand color for every status", () => {
    const map = workStatusToneById("#22c55e", [
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ]);
    expect(map.a?.color).toBe("#22c55e");
    expect(map.b?.color).toBe("#22c55e");
    expect(map.c?.color).toBe("#22c55e");
    expect(map.a!.mix).toBeLessThan(map.c!.mix);
  });

  it("builds a tone from status index", () => {
    const left = workStatusToneAtIndex("#3b82f6", 0, 4);
    const right = workStatusToneAtIndex("#3b82f6", 3, 4);
    expect(left.color).toBe("#3b82f6");
    expect(left.mix).toBeLessThan(right.mix);
  });
});
