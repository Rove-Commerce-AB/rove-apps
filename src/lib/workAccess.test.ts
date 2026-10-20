import { describe, expect, it } from "vitest";
import {
  canArchiveWorkProject,
  canCreateWorkProject,
  canDeleteWorkIssue,
  canLogWorkTime,
  canSeeWorkBoard,
  canSeeWorkCustomer,
  canSeeWorkTime,
  filterVisibleWorkBoards,
  isWorkActivityVisibleToActor,
} from "./workAccess";

const admin = { id: "admin-1", role: "admin" as const };
const member = { id: "member-1", role: "member" as const };
const customer = { id: "cust-user-1", role: "customer" as const };

describe("canSeeWorkCustomer", () => {
  it("lets admin see any customer", () => {
    expect(canSeeWorkCustomer(admin, [], "c1")).toBe(true);
  });

  it("lets members and customer users see only assigned customers", () => {
    expect(canSeeWorkCustomer(member, ["c1"], "c1")).toBe(true);
    expect(canSeeWorkCustomer(member, ["c1"], "c2")).toBe(false);
    expect(canSeeWorkCustomer(customer, ["c3"], "c3")).toBe(true);
    expect(canSeeWorkCustomer(customer, ["c3"], "c1")).toBe(false);
  });
});

describe("canSeeWorkBoard", () => {
  it("requires membership even for admin", () => {
    const empty = { customerIsInternal: false, memberAppUserIds: [] };
    const withAdmin = {
      customerIsInternal: false,
      memberAppUserIds: ["admin-1"],
    };
    expect(canSeeWorkBoard(admin, empty)).toBe(false);
    expect(canSeeWorkBoard(admin, withAdmin)).toBe(true);
  });

  it("lets only members see a board", () => {
    const board = {
      customerIsInternal: false,
      memberAppUserIds: ["member-1"],
    };
    expect(canSeeWorkBoard(member, board)).toBe(true);
    expect(canSeeWorkBoard(customer, board)).toBe(false);
    expect(canSeeWorkBoard({ id: "other", role: "member" }, board)).toBe(
      false
    );
  });
});

describe("canSeeWorkTime", () => {
  it("always allows non-customer roles", () => {
    expect(canSeeWorkTime(admin, false)).toBe(true);
    expect(canSeeWorkTime(member, false)).toBe(true);
  });

  it("follows the customer setting for customer users", () => {
    expect(canSeeWorkTime(customer, false)).toBe(false);
    expect(canSeeWorkTime(customer, true)).toBe(true);
  });
});

describe("isWorkActivityVisibleToActor", () => {
  it("hides estimate and time-report activity from customer users", () => {
    expect(isWorkActivityVisibleToActor(customer, "estimate")).toBe(false);
    expect(isWorkActivityVisibleToActor(customer, "time")).toBe(false);
    expect(isWorkActivityVisibleToActor(customer, "time_log")).toBe(false);
    expect(isWorkActivityVisibleToActor(customer, "time_report")).toBe(false);
  });

  it("keeps other activity visible to customer users", () => {
    expect(isWorkActivityVisibleToActor(customer, "status")).toBe(true);
    expect(isWorkActivityVisibleToActor(customer, "comment")).toBe(true);
  });

  it("shows estimate and time activity to staff", () => {
    expect(isWorkActivityVisibleToActor(admin, "estimate")).toBe(true);
    expect(isWorkActivityVisibleToActor(member, "time_report")).toBe(true);
  });
});

describe("canLogWorkTime", () => {
  it("blocks customer users and allows others", () => {
    expect(canLogWorkTime(customer)).toBe(false);
    expect(canLogWorkTime(admin)).toBe(true);
    expect(canLogWorkTime(member)).toBe(true);
  });
});

describe("canCreateWorkProject", () => {
  it("blocks customer users and allows others", () => {
    expect(canCreateWorkProject(customer)).toBe(false);
    expect(canCreateWorkProject(admin)).toBe(true);
    expect(canCreateWorkProject(member)).toBe(true);
  });
});

describe("canArchiveWorkProject", () => {
  it("blocks customer users and allows others", () => {
    expect(canArchiveWorkProject(customer)).toBe(false);
    expect(canArchiveWorkProject(admin)).toBe(true);
    expect(canArchiveWorkProject(member)).toBe(true);
  });
});

describe("canDeleteWorkIssue", () => {
  it("lets admin and member delete any issue", () => {
    expect(canDeleteWorkIssue(admin, "other")).toBe(true);
    expect(canDeleteWorkIssue(member, null)).toBe(true);
  });

  it("lets customer users delete only issues they created", () => {
    expect(canDeleteWorkIssue(customer, customer.id)).toBe(true);
    expect(canDeleteWorkIssue(customer, "other")).toBe(false);
    expect(canDeleteWorkIssue(customer, null)).toBe(false);
  });
});

describe("filterVisibleWorkBoards", () => {
  it("keeps boards the actor belongs to", () => {
    const boards = [
      { id: "a", customerIsInternal: false, memberAppUserIds: ["member-1"] },
      { id: "b", customerIsInternal: true, memberAppUserIds: ["member-1"] },
      { id: "c", customerIsInternal: false, memberAppUserIds: ["other"] },
    ];
    expect(filterVisibleWorkBoards(member, boards).map((b) => b.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("does not grant admins boards they are not members of", () => {
    const boards = [
      { id: "a", customerIsInternal: false, memberAppUserIds: ["admin-1"] },
      { id: "b", customerIsInternal: false, memberAppUserIds: ["other"] },
    ];
    expect(filterVisibleWorkBoards(admin, boards).map((b) => b.id)).toEqual([
      "a",
    ]);
  });
});
