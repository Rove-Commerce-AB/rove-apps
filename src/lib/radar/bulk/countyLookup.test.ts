import { describe, expect, it } from "vitest";
import {
  normalizePostnr,
  postnrMapSize,
  resolveCounty,
} from "@/lib/radar/bulk/countyLookup";

describe("countyLookup", () => {
  it("loads the postnummer table", () => {
    expect(postnrMapSize()).toBeGreaterThan(10000);
  });

  it("maps Blekinge postnummer", () => {
    expect(normalizePostnr("371 40")).toBe("37140");
    expect(resolveCounty({ postnr: "37140" })).toBe("Blekinge");
    expect(resolveCounty({ postnr: "29300" })).toBe("Blekinge");
  });

  it("maps major cities by postnr", () => {
    expect(resolveCounty({ postnr: "10044" })).toBe("Stockholm");
    expect(resolveCounty({ postnr: "41101", postort: "GÖTEBORG" })).toBe(
      "Västra Götaland"
    );
  });

  it("falls back to postort when postnr unknown", () => {
    expect(
      resolveCounty({ postnr: "00000", postort: "MALMÖ" })
    ).toBe("Skåne");
  });
});
