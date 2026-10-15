import Link from "next/link";
import { Briefcase, Clock } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import type { HomeDashboardData } from "@/lib/homeDashboardTypes";
import { HomeAppSurface } from "./HomeAppSurface";
import { HomePlannerPanel } from "./HomePlannerPanel";

function formatHours(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function occupancyPct(booked: number, available: number): number {
  if (available <= 0) return booked > 0 ? 100 : 0;
  return Math.round((booked / available) * 100);
}

type Props = {
  data: HomeDashboardData;
};

export function HomeDashboard({ data }: Props) {
  const {
    greetingName,
    year,
    week,
    unreadCount,
    isCustomerUser,
    planner,
    timeReport,
    work,
  } = data;

  const greeting = greetingName ? `Hi, ${greetingName}` : "Home";

  return (
    <div className="w-full max-w-5xl">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
          Week {week} · {year}
        </p>
        <h1 className="mt-1 text-heading-xl text-text-primary">{greeting}</h1>
        <p className="mt-1.5 max-w-xl text-[13px] text-text-secondary">
          {isCustomerUser
            ? "Your workspace across the apps you can access."
            : "A quick look at what matters in each app."}
          {unreadCount > 0 ? (
            <>
              {" "}
              <Link
                href={ROUTES.notifications}
                prefetch={false}
                className="font-medium text-brand-signal underline underline-offset-2 hover:opacity-90"
              >
                {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
              </Link>
            </>
          ) : null}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {planner ? <HomePlannerPanel planner={planner} /> : null}

        {timeReport ? (
          <HomeAppSurface
            title="Time report"
            href={ROUTES.timeReportHome}
            icon={Clock}
            description={`ISO week ${timeReport.week}`}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md bg-bg-muted/60 px-3 py-2.5">
                  <p className="text-xs text-text-tertiary">Reported</p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums text-text-primary">
                    {formatHours(timeReport.reportedHours)}h
                  </p>
                </div>
                <div className="rounded-md bg-bg-muted/60 px-3 py-2.5">
                  <p className="text-xs text-text-tertiary">Planned</p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums text-text-primary">
                    {formatHours(timeReport.plannedHours)}h
                  </p>
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-text-secondary">
                  <span>Progress vs planned</span>
                  <span className="tabular-nums">
                    {timeReport.plannedHours > 0
                      ? `${occupancyPct(
                          timeReport.reportedHours,
                          timeReport.plannedHours
                        )}%`
                      : "—"}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
                  <div
                    className="h-full rounded-full bg-status-success transition-[width]"
                    style={{
                      width: `${Math.min(
                        100,
                        occupancyPct(
                          timeReport.reportedHours,
                          timeReport.plannedHours > 0
                            ? timeReport.plannedHours
                            : timeReport.availableHours || 1
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
              <p className="text-sm text-text-secondary">
                {timeReport.reportedHours === 0
                  ? "No hours reported yet this week."
                  : timeReport.plannedHours > 0 &&
                      timeReport.reportedHours >= timeReport.plannedHours
                    ? "You're caught up with planned hours."
                    : "Keep logging as you go."}
              </p>
            </div>
          </HomeAppSurface>
        ) : null}

        {work ? (
          <HomeAppSurface
            title="Rove Work"
            href={ROUTES.work}
            icon={Briefcase}
            description={
              work.issues.length > 0
                ? `${work.issues.length} open issue${work.issues.length === 1 ? "" : "s"} assigned to you`
                : "Issues you own or are assigned to"
            }
          >
            {work.issues.length === 0 ? (
              <p className="text-sm text-text-secondary">
                {isCustomerUser
                  ? "Open Rove Work to browse customers and boards you can access."
                  : "No open Work issues where you are owner or assignee."}
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {work.issues.map((issue) => (
                  <li key={issue.id} className="py-2 first:pt-0">
                    <Link
                      href={issue.href}
                      prefetch={false}
                      className="group block min-w-0"
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="shrink-0 text-xs font-medium tabular-nums text-text-tertiary">
                          {issue.key}
                        </span>
                        <span className="truncate text-sm font-medium text-text-primary group-hover:text-brand-signal">
                          {issue.title}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-text-secondary">
                        {issue.customerName} · {issue.boardTitle}
                        <span className="text-text-tertiary">
                          {" "}
                          · {issue.statusName}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </HomeAppSurface>
        ) : null}
      </div>

      {!planner && !timeReport && !work ? (
        <p className="mt-6 text-sm text-text-secondary">
          No apps are enabled for your account yet. Ask an admin to grant access.
        </p>
      ) : null}
    </div>
  );
}
