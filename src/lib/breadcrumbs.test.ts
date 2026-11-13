import { describe, expect, it } from "vitest";
import { breadcrumbsForPathname } from "./breadcrumbs";

describe("breadcrumbsForPathname", () => {
  it("redirects legacy Settings monitors crumbs to Support", () => {
    expect(breadcrumbsForPathname("/settings/monitors")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Rove Support", href: "/support/overview" },
      { label: "Overview" },
    ]);
  });

  it("shows flat Support Monitors and Incidents", () => {
    expect(breadcrumbsForPathname("/support/monitors")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Rove Support", href: "/support/overview" },
      { label: "Monitors" },
    ]);
    expect(breadcrumbsForPathname("/support/incidents")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Rove Support", href: "/support/overview" },
      { label: "Incidents" },
    ]);
  });

  it("shows Support monitor downtime history", () => {
    expect(
      breadcrumbsForPathname("/support/cust/monitors/mon/incidents")
    ).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Rove Support", href: "/support/overview" },
      { label: "Monitors", href: "/support/monitors?customer=all" },
      { label: "Downtime" },
    ]);
  });

  it("uses Consultant as the current planner page", () => {
    expect(breadcrumbsForPathname("/planner/consultant")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Planner", href: "/planner/consultant" },
      { label: "Consultant" },
    ]);
  });

  it("uses Customer and Project as planner pages", () => {
    expect(breadcrumbsForPathname("/planner/customer")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Planner", href: "/planner/consultant" },
      { label: "Customer" },
    ]);
    expect(breadcrumbsForPathname("/planner/project")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Planner", href: "/planner/consultant" },
      { label: "Project" },
    ]);
  });

  it("uses Allocation history as a planner page", () => {
    expect(breadcrumbsForPathname("/planner/history")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Planner", href: "/planner/consultant" },
      { label: "Allocation history" },
    ]);
  });

  it("uses Overview as the Rove Work landing page", () => {
    expect(breadcrumbsForPathname("/work/overview")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Rove Work", href: "/work/overview" },
      { label: "Overview" },
    ]);
  });

  it("uses My work as the current page on /work/mine", () => {
    expect(breadcrumbsForPathname("/work/mine")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Rove Work", href: "/work/overview" },
      { label: "My work" },
    ]);
  });

  it("uses the customer as the current page on the customer landing", () => {
    expect(
      breadcrumbsForPathname("/work/cust-1", {
        workCustomerName: "Acme",
      })
    ).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Rove Work", href: "/work/overview" },
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
      { label: "Rove Work", href: "/work/overview" },
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
      { label: "Rove Work", href: "/work/overview" },
      { label: "Acme", href: "/work/cust-1" },
      { label: "Website", href: "/work/cust-1/board-1" },
      { label: "RT-12" },
    ]);
  });

  it("uses Overview as the Insights landing page", () => {
    expect(breadcrumbsForPathname("/insights/overview")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Insights", href: "/insights/overview" },
      { label: "Overview" },
    ]);
  });

  it("uses Overview as the Time report landing page", () => {
    expect(breadcrumbsForPathname("/time-report/overview")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Time report", href: "/time-report/overview" },
      { label: "Overview" },
    ]);
  });

  it("shows Travel expense under Time report", () => {
    expect(breadcrumbsForPathname("/time-report/travel-expense")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Time report", href: "/time-report/overview" },
      { label: "Travel expense" },
    ]);
    expect(breadcrumbsForPathname("/time-report/travel-expense/new")).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Time report", href: "/time-report/overview" },
      { label: "Travel expense", href: "/time-report/travel-expense" },
      { label: "New" },
    ]);
    expect(
      breadcrumbsForPathname("/time-report/travel-expense/abc")
    ).toEqual([
      { label: "Rove Apps", href: "/" },
      { label: "Time report", href: "/time-report/overview" },
      { label: "Travel expense", href: "/time-report/travel-expense" },
      { label: "Edit" },
    ]);
  });
});
