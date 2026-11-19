import { describe, expect, it } from "vitest";
import {
  formatOrganizationNumber,
  normalizeHostname,
  normalizeOrganizationNumber,
} from "@/lib/radar/orgNumber";

describe("normalizeOrganizationNumber", () => {
  it("accepts 10 digits with punctuation", () => {
    expect(normalizeOrganizationNumber("556000-0001")).toBe("5560000001");
  });

  it("rejects wrong length", () => {
    expect(normalizeOrganizationNumber("556000001")).toBeNull();
  });
});

describe("normalizeHostname", () => {
  it("strips protocol and www", () => {
    expect(normalizeHostname("https://www.Example.com/path")).toBe(
      "example.com"
    );
  });
});

describe("formatOrganizationNumber", () => {
  it("formats with hyphen", () => {
    expect(formatOrganizationNumber("5560000001")).toBe("556000-0001");
  });
});
