import { describe, expect, it } from "vitest";
import {
  buildPathWithCustomerFilter,
  CUSTOMER_FILTER_ALL,
  normalizeCustomerFilterValue,
  resolveCustomerFilterSelection,
  shouldHideCustomerFilter,
} from "./customerFilter";

const allowed = ["c1", "c2"];

describe("normalizeCustomerFilterValue", () => {
  it("treats empty and all as All", () => {
    expect(normalizeCustomerFilterValue("", allowed)).toBe(null);
    expect(normalizeCustomerFilterValue(CUSTOMER_FILTER_ALL, allowed)).toBe(
      null
    );
  });

  it("accepts allowed ids", () => {
    expect(normalizeCustomerFilterValue("c1", allowed)).toBe("c1");
  });

  it("rejects unknown ids", () => {
    expect(normalizeCustomerFilterValue("x", allowed)).toBeUndefined();
  });
});

describe("resolveCustomerFilterSelection", () => {
  it("prefers explicit query over cookie", () => {
    expect(
      resolveCustomerFilterSelection({
        queryValue: "c2",
        persistedValue: "c1",
        allowedIds: allowed,
      })
    ).toBe("c2");
  });

  it("uses cookie when query is absent", () => {
    expect(
      resolveCustomerFilterSelection({
        queryValue: undefined,
        persistedValue: "c1",
        allowedIds: allowed,
      })
    ).toBe("c1");
  });

  it("falls back to All when nothing valid", () => {
    expect(
      resolveCustomerFilterSelection({
        queryValue: "gone",
        persistedValue: "also-gone",
        allowedIds: allowed,
      })
    ).toBe(null);
  });

  it("explicit all beats cookie", () => {
    expect(
      resolveCustomerFilterSelection({
        queryValue: CUSTOMER_FILTER_ALL,
        persistedValue: "c1",
        allowedIds: allowed,
      })
    ).toBe(null);
  });
});

describe("buildPathWithCustomerFilter", () => {
  it("omits query for All", () => {
    expect(buildPathWithCustomerFilter("/support/monitors", null)).toBe(
      "/support/monitors"
    );
  });

  it("adds customer query", () => {
    expect(buildPathWithCustomerFilter("/support/monitors", "c1")).toBe(
      "/support/monitors?customer=c1"
    );
  });
});

describe("shouldHideCustomerFilter", () => {
  it("hides only when single and requested", () => {
    expect(shouldHideCustomerFilter(1, true)).toBe(true);
    expect(shouldHideCustomerFilter(2, true)).toBe(false);
    expect(shouldHideCustomerFilter(1, false)).toBe(false);
  });
});
