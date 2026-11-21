import { describe, expect, it } from "vitest";
import {
  formatSniDisplay,
  resolveSniDescription,
  sniDetailLabel,
  sniDivisionCode,
} from "@/lib/radar/sniSections";

describe("formatSniDisplay", () => {
  it("prefers official detaljgrupp over stored description", () => {
    expect(
      formatSniDisplay({
        sni_code: "46380",
        sni_description: "Manufacture of fabricated metal products",
      })
    ).toEqual({
      code: "46380",
      label:
        "Partihandel med andra livsmedel, bl.a. fisk samt skal- och blötdjur",
    });
  });

  it("uses stored description when official detaljgrupp is unknown", () => {
    expect(
      formatSniDisplay({
        sni_code: "46999",
        sni_description: "Custom override",
      })
    ).toEqual({
      code: "46999",
      label: "Custom override",
    });
  });

  it("falls back to SNI division label for unknown detail codes", () => {
    expect(
      formatSniDisplay({ sni_code: "46999", sni_description: null })
    ).toEqual({
      code: "46999",
      label: "Parti- och provisionshandel utom med motorfordon",
    });
  });
});

describe("sniDetailLabel", () => {
  it("resolves dotted codes", () => {
    expect(sniDetailLabel("46.380")).toBe(
      "Partihandel med andra livsmedel, bl.a. fisk samt skal- och blötdjur"
    );
  });
});

describe("resolveSniDescription", () => {
  it("keeps an existing description", () => {
    expect(resolveSniDescription("46380", "Keep me")).toBe("Keep me");
  });
});

describe("sniDivisionCode", () => {
  it("takes the first two digits", () => {
    expect(sniDivisionCode("46630")).toBe("46");
  });
});
