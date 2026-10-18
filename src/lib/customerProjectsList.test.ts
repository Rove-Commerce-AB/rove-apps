import { describe, expect, it } from "vitest";
import {
  compareProjectNamesSv,
  effectiveProjectProbability,
  groupCustomerProjectsForList,
} from "./customerProjectsList";
import type { CustomerProjectSummary } from "@/types";

function project(
  partial: Partial<CustomerProjectSummary> & Pick<CustomerProjectSummary, "id" | "name">
): CustomerProjectSummary {
  return {
    isActive: true,
    type: "customer",
    probability: 100,
    hasWorkProject: false,
    ...partial,
  };
}

describe("effectiveProjectProbability", () => {
  it("treats null as 100", () => {
    expect(effectiveProjectProbability(null)).toBe(100);
  });

  it("returns the given value", () => {
    expect(effectiveProjectProbability(40)).toBe(40);
  });
});

describe("compareProjectNamesSv", () => {
  it("sorts å after z (Swedish collation)", () => {
    const names = ["Ärlig", "Zorro", "Apple"].sort(compareProjectNamesSv);
    expect(names).toEqual(["Apple", "Zorro", "Ärlig"]);
  });
});

describe("groupCustomerProjectsForList", () => {
  it("splits active into confirmed and pipeline, sorts A–Ö, inactive separate", () => {
    const grouped = groupCustomerProjectsForList([
      project({ id: "1", name: "Zebra", probability: 100 }),
      project({ id: "2", name: "Alpha", probability: 50 }),
      project({ id: "3", name: "Beta", probability: null }),
      project({ id: "4", name: "Old", isActive: false, probability: 100 }),
      project({ id: "5", name: "Gamma", probability: 80 }),
      project({ id: "6", name: "Closed", isActive: false, probability: 20 }),
    ]);

    expect(grouped.confirmed.map((p) => p.name)).toEqual(["Beta", "Zebra"]);
    expect(grouped.pipeline.map((p) => p.name)).toEqual(["Alpha", "Gamma"]);
    expect(grouped.inactive.map((p) => p.name)).toEqual(["Closed", "Old"]);
  });

  it("does not sort pipeline by probability", () => {
    const grouped = groupCustomerProjectsForList([
      project({ id: "1", name: "High", probability: 90 }),
      project({ id: "2", name: "Low", probability: 10 }),
    ]);
    expect(grouped.pipeline.map((p) => p.name)).toEqual(["High", "Low"]);
  });
});
