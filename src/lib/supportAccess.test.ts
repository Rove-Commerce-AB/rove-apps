import { describe, expect, it } from "vitest";
import {
  canAccessSupportCustomer,
  canEditSupportContract,
  canManageMonitors,
  canSeeSupportApp,
  canSeeSupportCustomerInNav,
  canSeeSupportOverview,
  canUseSupportCases,
  canViewMonitors,
} from "./supportAccess";

const admin = {
  id: "a1",
  role: "admin" as const,
  appKeys: ["support", "work"],
};
const member = {
  id: "m1",
  role: "member" as const,
  appKeys: ["support"],
};
const customer = {
  id: "c1",
  role: "customer" as const,
  appKeys: ["support", "work"],
};
const noApp = { id: "x", role: "member" as const, appKeys: ["work"] };

describe("canSeeSupportApp", () => {
  it("requires support app key", () => {
    expect(canSeeSupportApp(admin)).toBe(true);
    expect(canSeeSupportApp(noApp)).toBe(false);
  });
});

describe("canSeeSupportOverview", () => {
  it("is staff only", () => {
    expect(canSeeSupportOverview(admin)).toBe(true);
    expect(canSeeSupportOverview(member)).toBe(true);
    expect(canSeeSupportOverview(customer)).toBe(false);
  });
});

describe("nav vs access", () => {
  it("tree requires link; pages allow overview staff deep-link", () => {
    expect(canSeeSupportCustomerInNav(admin, ["c1"], "c2")).toBe(false);
    expect(canAccessSupportCustomer(admin, ["c1"], "c2")).toBe(true);
    expect(canAccessSupportCustomer(customer, ["c1"], "c2")).toBe(false);
    expect(canAccessSupportCustomer(customer, ["c1"], "c1")).toBe(true);
  });
});

describe("monitors and cases", () => {
  it("gates manage to staff with access", () => {
    expect(canManageMonitors(member, ["c1"], "c1")).toBe(true);
    expect(canManageMonitors(customer, ["c1"], "c1")).toBe(false);
    expect(canViewMonitors(customer, ["c1"], "c1")).toBe(true);
  });

  it("requires active contract for cases", () => {
    expect(canUseSupportCases(customer, ["c1"], "c1", false)).toBe(false);
    expect(canUseSupportCases(customer, ["c1"], "c1", true)).toBe(true);
  });

  it("lets staff edit contracts", () => {
    expect(canEditSupportContract(admin)).toBe(true);
    expect(canEditSupportContract(customer)).toBe(false);
  });
});
