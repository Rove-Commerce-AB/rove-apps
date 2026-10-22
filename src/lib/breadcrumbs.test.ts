import { describe, expect, it } from "vitest";
import { breadcrumbsForPathname } from "./breadcrumbs";

describe("breadcrumbsForPathname", () => {
  it("redirects legacy Settings monitors crumbs to Support", () => {
    expect(breadcrumbsForPathname("/settings/monitors")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Rove Support", href: "/support" },
      { label: "Overview" },
    ]);
  });

  it("shows Support monitors and incidents", () => {
    expect(
      breadcrumbsForPathname("/support/cust/monitors/mon/incidents")
    ).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Rove Support", href: "/support" },
      { label: "Customer", href: "/support/cust" },
      { label: "Monitors", href: "/support/cust/monitors" },
      { label: "Incidents" },
    ]);
  });

  it("uses Consultant as the current planner page", () => {
    expect(breadcrumbsForPathname("/planner/consultant")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Planner" },
      { label: "Consultant" },
    ]);
  });

  it("uses Customer and Project as planner pages", () => {
    expect(breadcrumbsForPathname("/planner/customer")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Planner" },
      { label: "Customer" },
    ]);
    expect(breadcrumbsForPathname("/planner/project")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Planner" },
      { label: "Project" },
    ]);
  });

  it("uses Allocation history as a planner page", () => {
    expect(breadcrumbsForPathname("/planner/history")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Planner" },
      { label: "Allocation history" },
    ]);
  });

  it("uses Rove Work as the current page on the selector", () => {
    expect(breadcrumbsForPathname("/work")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Rove Work" },
    ]);
  });

  it("uses the customer as the current page on the customer landing", () => {
    expect(
      breadcrumbsForPathname("/work/cust-1", {
        workCustomerName: "Acme",
      })
    ).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Rove Work", href: "/work" },
      { label: "Acme" },
    ]);
  });

  it("adds customer and board on a board path", () => {
    expect(
      breadcrumbsForPathname("/work/cust-1/board-1", {
        workCustomerName: "Acme",
        workBoardTitle: "Website",
      })
    ).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Rove Work", href: "/work" },
      { label: "Acme", href: "/work/cust-1" },
      { label: "Website" },
    ]);
  });

  it("adds the issue key when an issue is open", () => {
    expect(
      breadcrumbsForPathname("/work/cust-1/board-1/issue-1", {
        workCustomerName: "Acme",
        workBoardTitle: "Website",
        workIssueKey: "RT-12",
      })
    ).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Rove Work", href: "/work" },
      { label: "Acme", href: "/work/cust-1" },
      { label: "Website", href: "/work/cust-1/board-1" },
      { label: "RT-12" },
    ]);
  });
});
