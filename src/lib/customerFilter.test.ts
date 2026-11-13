import { describe, expect, it } from "vitest";
import {
  buildPathWithCustomerFilter,
  CUSTOMER_FILTER_ALL,
  normalizeCustomerFilterValues,
  resolveCustomerFilterSelection,
  shouldHideCustomerFilter,
} from "./customerFilter";

const allowed = ["c1", "c2"];

describe("normalizeCustomerFilterValues", () => {
  it("treats empty and all as All", () => {
    expect(normalizeCustomerFilterValues("", allowed)).toEqual([]);
    expect(normalizeCustomerFilterValues(CUSTOMER_FILTER_ALL, allowed)).toEqual(
      []
    );
  });

  it("accepts allowed ids", () => {
    expect(normalizeCustomerFilterValues("c1", allowed)).toEqual(["c1"]);
  });

  it("accepts comma-separated ids", () => {
    expect(normalizeCustomerFilterValues("c1,c2", allowed)).toEqual([
      "c1",
      "c2",
    ]);
  });

  it("rejects unknown ids", () => {
    expect(normalizeCustomerFilterValues("x", allowed)).toBeUndefined();
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
    ).toEqual(["c2"]);
  });

  it("uses cookie when query is absent", () => {
    expect(
      resolveCustomerFilterSelection({
        queryValue: undefined,
        persistedValue: "c1,c2",
        allowedIds: allowed,
      })
    ).toEqual(["c1", "c2"]);
  });

  it("falls back to All when nothing valid", () => {
    expect(
      resolveCustomerFilterSelection({
        queryValue: "gone",
        persistedValue: "also-gone",
        allowedIds: allowed,
      })
    ).toEqual([]);
  });

  it("explicit all beats cookie", () => {
    expect(
      resolveCustomerFilterSelection({
        queryValue: CUSTOMER_FILTER_ALL,
        persistedValue: "c1",
        allowedIds: allowed,
      })
    ).toEqual([]);
  });
});

describe("buildPathWithCustomerFilter", () => {
  it("omits query for All", () => {
    expect(buildPathWithCustomerFilter("/support/monitors", [])).toBe(
      "/support/monitors"
    );
  });

  it("adds customer query", () => {
    expect(buildPathWithCustomerFilter("/support/monitors", ["c1", "c2"])).toBe(
      "/support/monitors?customer=c1%2Cc2"
    );
  });
});

describe("shouldHideCustomerFilter", () => {
  it("hides for single-customer actors", () => {
    expect(shouldHideCustomerFilter(1, true)).toBe(true);
    expect(shouldHideCustomerFilter(2, true)).toBe(false);
  });
});
