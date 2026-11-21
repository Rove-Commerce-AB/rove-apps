import { describe, expect, it } from "vitest";
import {
  companyNameSlugs,
  companyNameTokens,
  hostnameCandidatesFromName,
  htmlMatchesCompany,
} from "@/lib/radar/domainGuess";

describe("companyNameTokens / slugs", () => {
  it("strips AB and maps ö→o for Öratron AB", () => {
    expect(companyNameTokens("Öratron AB")).toEqual(["oratron"]);
    expect(companyNameSlugs("Öratron AB")).toEqual(["oratron"]);
  });

  it("builds joined and hyphenated slugs for multi-word names", () => {
    const slugs = companyNameSlugs("Nordic Trade AB");
    expect(slugs).toContain("nordictrade");
    expect(slugs).toContain("nordic-trade");
    expect(slugs).toContain("nordic");
  });
});

describe("hostnameCandidatesFromName", () => {
  it("prefers .se then .com for Öratron", () => {
    expect(hostnameCandidatesFromName("Öratron AB")).toEqual([
      "oratron.se",
      "oratron.com",
    ]);
  });
});

describe("htmlMatchesCompany", () => {
  it("matches when company name appears in body", () => {
    const html = `<html><body><h1>Välkommen till Öratron</h1><p>Vi säljer grejer.</p></body></html>`;
    expect(
      htmlMatchesCompany(html, {
        name: "Öratron AB",
        organizationNumber: "5561234567",
      })
    ).toBe(true);
  });

  it("matches organization number", () => {
    const html = `<html><body>Org.nr 556123-4567 Contact us</body></html>`;
    expect(
      htmlMatchesCompany(html, {
        name: "Öratron AB",
        organizationNumber: "5561234567",
      })
    ).toBe(true);
  });

  it("rejects parking pages", () => {
    const html = `<html><body>This domain may be for sale on HugeDomains</body></html>`;
    expect(
      htmlMatchesCompany(html, {
        name: "Öratron AB",
        organizationNumber: "5561234567",
      })
    ).toBe(false);
  });
});
