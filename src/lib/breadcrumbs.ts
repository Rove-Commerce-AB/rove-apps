import { ROUTES } from "@/lib/routes";

export type Breadcrumb = {
  label: string;
  href?: string;
};

export type BreadcrumbExtras = {
  workCustomerName?: string;
  workBoardTitle?: string;
  workIssueKey?: string;
};

/**
 * App chrome breadcrumbs from the current pathname.
 * The last item is the current page (no href).
 */
export function breadcrumbsForPathname(
  pathname: string,
  extras?: BreadcrumbExtras
): Breadcrumb[] {
  const root: Breadcrumb = { label: "Rove Apps", href: ROUTES.home };

  if (pathname === "/") {
    return [root, { label: "Home" }];
  }

  if (pathname.startsWith(ROUTES.planner)) {
    const planner: Breadcrumb = {
      label: "Planner",
      href: ROUTES.plannerConsultant,
    };
    if (pathname.startsWith(ROUTES.plannerCustomer)) {
      return [root, planner, { label: "Customer" }];
    }
    if (pathname.startsWith(ROUTES.plannerProject)) {
      return [root, planner, { label: "Project" }];
    }
    if (pathname.startsWith(ROUTES.plannerHistory)) {
      return [root, planner, { label: "Allocation history" }];
    }
    return [root, planner, { label: "Consultant" }];
  }

  if (pathname.startsWith(ROUTES.timeApproval)) {
    return [
      root,
      { label: "Time report", href: ROUTES.timeReportOverview },
      { label: "Time approval" },
    ];
  }

  if (
    pathname === ROUTES.timeReportHome ||
    pathname.startsWith(ROUTES.timeReportOverview)
  ) {
    return [
      root,
      { label: "Time report", href: ROUTES.timeReportOverview },
      { label: "Overview" },
    ];
  }

  if (pathname.startsWith("/time-report")) {
    return [
      root,
      { label: "Time report", href: ROUTES.timeReportOverview },
      { label: "Time report" },
    ];
  }

  if (pathname.startsWith("/settings")) {
    const settings: Breadcrumb = { label: "Settings" };
    if (pathname.startsWith(ROUTES.settings)) {
      return [root, settings, { label: "General" }];
    }
    if (pathname.startsWith(ROUTES.people)) {
      return [root, settings, { label: "People" }];
    }
    if (pathname.startsWith(ROUTES.monitors)) {
      return [
        root,
        { label: "Rove Support", href: ROUTES.supportOverview },
        { label: "Overview" },
      ];
    }
    if (pathname.startsWith(ROUTES.consultants)) {
      return [root, settings, { label: "Consultants" }];
    }
    if (pathname.startsWith(ROUTES.customers)) {
      return [root, settings, { label: "Customers" }];
    }
    return [root, { label: "Settings" }];
  }

  if (pathname.startsWith(ROUTES.notifications)) {
    return [root, { label: "Notifications" }];
  }

  if (pathname.startsWith("/projects")) {
    return [root, { label: "Projects" }];
  }

  if (pathname.startsWith(ROUTES.insights)) {
    const insights: Breadcrumb = {
      label: "Insights",
      href: ROUTES.insightsOverview,
    };
    if (
      pathname === ROUTES.insights ||
      pathname.startsWith(ROUTES.insightsOverview)
    ) {
      return [root, insights, { label: "Overview" }];
    }
    return [root, { label: "Insights" }];
  }

  if (pathname.startsWith(ROUTES.support)) {
    const support: Breadcrumb = {
      label: "Rove Support",
      href: ROUTES.supportOverview,
    };
    if (pathname.startsWith(ROUTES.supportOverview)) {
      return [root, support, { label: "Overview" }];
    }
    if (pathname === ROUTES.supportMonitors) {
      return [root, support, { label: "Monitors" }];
    }
    if (pathname === ROUTES.supportIncidents) {
      return [root, support, { label: "Incidents" }];
    }
    const remainder = pathname.slice(ROUTES.support.length).replace(/^\//, "");
    const [customerSeg, section] = remainder.split("/");
    if (
      customerSeg &&
      customerSeg !== "overview" &&
      customerSeg !== "monitors" &&
      customerSeg !== "incidents"
    ) {
      const customerCrumb: Breadcrumb = {
        label: "Customer",
        href: `${ROUTES.supportMonitors}?customer=${encodeURIComponent(customerSeg)}`,
      };
      if (section === "incidents" || section === "cases") {
        return [root, support, customerCrumb, { label: "Incidents" }];
      }
      if (section === "contact") {
        return [root, support, customerCrumb, { label: "Contact" }];
      }
      if (section === "monitors") {
        if (remainder.includes("/incidents")) {
          return [
            root,
            support,
            {
              label: "Monitors",
              href: `${ROUTES.supportMonitors}?customer=all`,
            },
            { label: "Downtime" },
          ];
        }
        return [
          root,
          support,
          {
            label: "Monitors",
            href: `${ROUTES.supportMonitors}?customer=all`,
          },
        ];
      }
      return [root, support, { label: "Customer" }];
    }
    return [root, { label: "Rove Support" }];
  }

  if (pathname.startsWith(ROUTES.work)) {
    const work: Breadcrumb = {
      label: "Rove Work",
      href: ROUTES.workOverview,
    };
    const remainder = pathname.slice(ROUTES.work.length).replace(/^\//, "");
    if (!remainder || remainder === "overview") {
      return [root, work, { label: "Overview" }];
    }
    if (remainder === "mine" || remainder.startsWith("mine/")) {
      return [root, work, { label: "My work" }];
    }
    const parts = remainder.split("/").filter(Boolean);
    const customerName = extras?.workCustomerName?.trim();
    const boardTitle = extras?.workBoardTitle?.trim();
    const issueKey = extras?.workIssueKey?.trim();
    const crumbs: Breadcrumb[] = [root, work];
    const customerHref = `${ROUTES.work}/${parts[0]}`;
    crumbs.push({
      label: customerName || "Customer",
      href: parts[1] ? customerHref : undefined,
    });
    if (parts[1]) {
      const boardHref = `${customerHref}/${parts[1]}`;
      crumbs.push({
        label: boardTitle || "Board",
        href: parts[2] ? boardHref : undefined,
      });
    }
    if (parts[2]) {
      crumbs.push({ label: issueKey || "Issue" });
    }
    return crumbs;
  }

  if (pathname.startsWith("/reports")) {
    return [root, { label: "Reports" }];
  }

  if (pathname.startsWith("/customer-status")) {
    return [root, { label: "Customer status" }];
  }

  return [root];
}
