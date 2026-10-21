"use client";

import { useState, useEffect, Suspense, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Inbox,
  Settings,
  LogOut,
  Briefcase,
  MessageCircle,
  Sparkles,
  Star,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { ROUTES, workCustomerHref, workProjectHref } from "@/lib/routes";
import type { AppKey } from "@/lib/peopleTypes";
import type { WorkSelectorCustomer } from "@/lib/workTypes";
import { CustomerFavicon } from "@/components/CustomerFavicon";
import { useShortcuts } from "@/components/ShortcutsProvider";
import {
  buildCurrentPageHref,
  shortcutMatchKey,
} from "@/lib/shortcutHref";

/** 10px left padding so the w-8 icon column is centered in the rail. */
const SIDEBAR_RAIL_PAD_X = "10px";
export const SIDEBAR_COLLAPSED_COOKIE = "rove-sidebar-collapsed";
const SIDEBAR_COLLAPSED_MAX_AGE = 60 * 60 * 24 * 365;

function persistSidebarCollapsed(collapsed: boolean) {
  try {
    document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${collapsed ? "1" : "0"}; Path=/; Max-Age=${SIDEBAR_COLLAPSED_MAX_AGE}; SameSite=Lax`;
  } catch {
    // private mode / blocked storage
  }
}

type IconType = React.ComponentType<{ className?: string }>;

function pathMatches(
  pathname: string,
  href: string,
  activeMatch: "exact" | "prefix"
) {
  if (href === "/") return pathname === "/";
  if (activeMatch === "prefix") {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  return pathname === href;
}

function NavLink({
  href,
  label,
  icon: Icon,
  pathname,
  badgeCount,
  activeMatch = "exact",
  indent = false,
  depth = 0,
  leading,
  className = "",
  collapsed = false,
  active,
}: {
  href: string;
  label: string;
  icon?: IconType;
  pathname: string;
  badgeCount?: number;
  activeMatch?: "exact" | "prefix";
  indent?: boolean;
  depth?: 0 | 1 | 2;
  leading?: ReactNode;
  className?: string;
  collapsed?: boolean;
  active?: boolean;
}) {
  const nest = indent || depth > 0;
  const isActive = active ?? pathMatches(pathname, href, activeMatch);
  const showBadge = typeof badgeCount === "number" && badgeCount > 0;
  const badgeLabel =
    badgeCount != null && badgeCount > 99 ? "99+" : String(badgeCount ?? "");

  const typeClass = nest ? "text-body-m" : "text-heading-xs";
  const toneClass = isActive
    ? "bg-nav-active text-text-primary"
    : nest
      ? "text-text-secondary transition-colors hover:bg-nav-active hover:text-text-primary"
      : "text-text-primary transition-colors hover:bg-nav-active";

  return (
    <Link
      href={href}
      prefetch={false}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={`group relative flex h-8 w-full min-w-0 items-center justify-start gap-1.5 rounded-md py-0 ${typeClass} ${toneClass} ${className}`.trim()}
    >
      {!collapsed && depth >= 1 ? (
        <span className="w-8 shrink-0" aria-hidden />
      ) : null}
      {Icon ? (
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
          <Icon className="h-4 w-4" />
        </span>
      ) : leading ? (
        <span className="flex h-8 w-4 shrink-0 items-center justify-center">
          {leading}
        </span>
      ) : nest && !collapsed ? (
        <span
          className={`h-8 shrink-0 ${depth >= 2 ? "w-4" : "w-8"}`}
          aria-hidden
        />
      ) : null}
      {!collapsed ? (
        <span className="flex min-h-0 min-w-0 flex-1 items-center overflow-hidden text-left max-w-[10rem] whitespace-nowrap">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className="truncate">{label}</span>
            {showBadge && (
              <span
                className="box-border inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full border border-text-primary/20 bg-bg-default/80 px-0.5 text-center text-[10px] font-semibold leading-none text-text-primary tabular-nums"
                aria-label={`${badgeCount} unread notifications`}
              >
                <span className="flex -translate-x-px items-center justify-center leading-none">
                  {badgeLabel}
                </span>
              </span>
            )}
          </span>
        </span>
      ) : showBadge ? (
        <span
          className="absolute right-0 top-0 box-border inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-text-primary/20 bg-bg-default px-0.5 text-center text-[9px] font-semibold leading-none text-text-primary tabular-nums"
          aria-label={`${badgeCount} unread notifications`}
        >
          {badgeLabel}
        </span>
      ) : null}
    </Link>
  );
}

function AppGroup({
  label,
  icon: Icon,
  open,
  onToggle,
  href,
  pathname,
  children,
  collapsed = false,
  collapsedHref,
  active = false,
}: {
  label: string;
  icon: IconType;
  open: boolean;
  onToggle: () => void;
  href?: string;
  pathname: string;
  children: React.ReactNode;
  collapsed?: boolean;
  collapsedHref?: string;
  active?: boolean;
}) {
  const headingActive = href
    ? pathMatches(pathname, href, collapsed ? "prefix" : "exact")
    : collapsed && active;

  if (collapsed) {
    const railHref = href ?? collapsedHref;
    if (railHref) {
      return (
        <NavLink
          href={railHref}
          label={label}
          icon={Icon}
          pathname={pathname}
          collapsed
          active={headingActive || active}
        />
      );
    }
  }

  return (
    <div className="flex flex-col gap-px">
      <div
        className={`flex h-8 w-full min-w-0 items-center overflow-hidden rounded-md ${
          headingActive ? "bg-nav-active" : "hover:bg-nav-active"
        }`}
      >
        {href ? (
          <Link
            href={href}
            prefetch={false}
            className="flex h-8 min-w-0 flex-1 items-center justify-start gap-1.5 rounded-md py-0 text-left text-heading-xs text-text-primary"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-left max-w-[10rem]">
              {label}
            </span>
          </Link>
        ) : (
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-start gap-1.5 rounded-md py-0 text-left text-heading-xs text-text-primary"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-left max-w-[10rem]">
              {label}
            </span>
          </button>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
          onClick={onToggle}
          className="mr-0.5 flex h-8 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-primary/50 hover:text-text-primary"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 transition-transform duration-120 ${
              open ? "rotate-90" : ""
            }`}
            aria-hidden
          />
        </button>
      </div>
      {open ? children : null}
    </div>
  );
}

function NavPlaceholder({
  label,
  icon: Icon,
  collapsed = false,
}: {
  label: string;
  icon: IconType;
  collapsed?: boolean;
}) {
  return (
    <div
      aria-disabled
      title={`${label} (coming soon)`}
      className="flex h-8 w-full min-w-0 cursor-default items-center justify-start gap-1.5 rounded-md py-0 text-heading-xs text-[var(--color-zinc-500)]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">
        <Icon className="h-4 w-4" />
      </span>
      {!collapsed ? (
        <span className="min-w-0 flex-1 truncate text-left max-w-[10rem]">
          {label}
        </span>
      ) : null}
    </div>
  );
}

function ShortcutsNav({
  pathname,
  collapsed,
}: {
  pathname: string;
  collapsed: boolean;
}) {
  const { shortcuts } = useShortcuts();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(true);
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const currentKey = shortcutMatchKey(
    buildCurrentPageHref(pathname, searchParams.toString())
  );

  if (collapsed) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setFlyoutOpen(true)}
        onMouseLeave={() => setFlyoutOpen(false)}
        onFocus={() => setFlyoutOpen(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setFlyoutOpen(false);
          }
        }}
      >
        <button
          type="button"
          aria-expanded={flyoutOpen}
          aria-haspopup="true"
          aria-label="Shortcuts"
          title="Shortcuts"
          className={`flex h-8 w-full min-w-0 items-center justify-center rounded-md py-0 text-heading-xs transition-colors hover:bg-nav-active ${
            flyoutOpen ? "bg-nav-active text-text-primary" : "text-text-primary"
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
            <Star className="h-4 w-4" />
          </span>
        </button>
        {flyoutOpen ? (
          <div
            role="menu"
            className="absolute left-full top-0 z-50 ml-1 min-w-[11rem] max-w-[16rem] rounded-md border border-border-subtle bg-bg-default py-1 shadow-lg"
          >
            <p className="px-3 py-1.5 text-overline text-text-muted">Shortcuts</p>
            {shortcuts.map((shortcut) => {
                const active = shortcutMatchKey(shortcut.href) === currentKey;
                return (
                  <Link
                    key={shortcut.id}
                    href={shortcut.href}
                    prefetch={false}
                    role="menuitem"
                    title={shortcut.name}
                    className={`block truncate px-3 py-1.5 text-body-m transition-colors hover:bg-nav-active hover:text-text-primary ${
                      active
                        ? "bg-nav-active text-text-primary"
                        : "text-text-secondary"
                    }`}
                  >
                    {shortcut.name}
                  </Link>
                );
              })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <AppGroup
      label="Shortcuts"
      icon={Star}
      pathname={pathname}
      open={open}
      onToggle={() => setOpen((current) => !current)}
    >
      {shortcuts.length === 0 ? null : (
        shortcuts.map((shortcut) => (
          <NavLink
            key={shortcut.id}
            href={shortcut.href}
            label={shortcut.name}
            pathname={pathname}
            indent
            active={shortcutMatchKey(shortcut.href) === currentKey}
          />
        ))
      )}
    </AppGroup>
  );
}

function WorkCustomerNav({
  customer,
  pathname,
  forceOpen,
}: {
  customer: WorkSelectorCustomer;
  pathname: string;
  forceOpen: boolean;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  const customerHref = workCustomerHref(customer.id);
  const hasBoards = customer.boards.length > 0;

  return (
    <div className="flex flex-col gap-px">
      <div className="flex min-w-0 items-center">
        <div className="min-w-0 flex-1">
          <NavLink
            href={customerHref}
            label={customer.name}
            pathname={pathname}
            depth={1}
            leading={
              <CustomerFavicon
                name={customer.name}
                url={customer.url}
                color={customer.color}
                size="nav"
              />
            }
          />
        </div>
        {hasBoards ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${customer.name} projects`}
            onClick={() => setOpen((current) => !current)}
            className="flex h-8 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-tertiary hover:bg-nav-active hover:text-text-primary"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform duration-120 ${
                open ? "rotate-90" : ""
              }`}
              aria-hidden
            />
          </button>
        ) : null}
      </div>
      {open && hasBoards
        ? customer.boards.map((board) => (
            <NavLink
              key={board.id}
              href={workProjectHref(customer.id, board.id)}
              label={board.title}
              pathname={pathname}
              depth={2}
              activeMatch="prefix"
            />
          ))
        : null}
    </div>
  );
}

type SidebarProps = {
  isAdmin?: boolean;
  canSeeTimeReportProjectManager?: boolean;
  isCustomerUser?: boolean;
  appKeys?: AppKey[];
  workNav?: WorkSelectorCustomer[];
  initialCollapsed?: boolean;
};

export function Sidebar({
  isAdmin = false,
  canSeeTimeReportProjectManager = false,
  isCustomerUser = false,
  appKeys = [],
  workNav = [],
  initialCollapsed = false,
}: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [openApps, setOpenApps] = useState<{
    planner: boolean;
    timeReport: boolean;
    settings: boolean;
    work: boolean;
  }>({ planner: false, timeReport: false, settings: false, work: false });

  const plannerActive = pathMatches(pathname, ROUTES.planner, "prefix");
  const timeReportChildActive = pathMatches(pathname, "/time-report", "prefix");
  const settingsChildActive = pathname.startsWith("/settings");
  const workActive = pathMatches(pathname, ROUTES.work, "prefix");
  const activeWorkCustomerId = pathname.startsWith(`${ROUTES.work}/`)
    ? pathname.slice(ROUTES.work.length + 1).split("/")[0] ?? null
    : null;

  useEffect(() => {
    setOpenApps((prev) => ({
      planner: plannerActive ? true : prev.planner,
      timeReport: timeReportChildActive ? true : prev.timeReport,
      settings: settingsChildActive ? true : prev.settings,
      work: workActive ? true : prev.work,
    }));
  }, [
    pathname,
    plannerActive,
    timeReportChildActive,
    settingsChildActive,
    workActive,
  ]);

  async function handleSignOut() {
    await signOut({ callbackUrl: "/login" });
  }

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      persistSidebarCollapsed(next);
      return next;
    });
  }

  const showTimeApproval = isAdmin || canSeeTimeReportProjectManager;
  const settingsRailHref = isAdmin ? ROUTES.settings : ROUTES.customers;

  const headerPad = {
    paddingLeft: SIDEBAR_RAIL_PAD_X,
    paddingRight: collapsed ? SIDEBAR_RAIL_PAD_X : "0.375rem",
    paddingTop: "0.5rem",
  };

  const navPadX = {
    paddingLeft: SIDEBAR_RAIL_PAD_X,
    paddingRight: collapsed ? SIDEBAR_RAIL_PAD_X : "0.375rem",
  };

  const footerPad = {
    paddingLeft: SIDEBAR_RAIL_PAD_X,
    paddingRight: collapsed ? SIDEBAR_RAIL_PAD_X : "0.375rem",
    paddingTop: "0.375rem",
    paddingBottom: "0.375rem",
  };

  return (
    <aside
      className={`relative z-20 flex h-full flex-shrink-0 flex-col overflow-hidden border-r border-border-subtle bg-bg-default shadow-lg transition-[width] duration-200 ease-out ${
        collapsed ? "w-[52px]" : "w-52"
      }`}
    >
      <div
        className="flex w-full min-w-0 shrink-0 items-center gap-1.5"
        style={headerPad}
      >
        {!collapsed ? (
          <Link
            href={ROUTES.home}
            prefetch={false}
            title="Rove Apps"
            aria-label="Rove Apps home"
            className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md transition-colors hover:bg-nav-active"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center">
              <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-text-primary text-[12px] font-semibold leading-none text-bg-default">
                R
              </span>
            </span>
            <span className="min-w-0 flex-1 truncate text-left text-heading-m text-text-primary">
              Rove Apps
            </span>
          </Link>
        ) : null}
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={toggleCollapsed}
          className={`flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-primary/50 transition-colors hover:bg-nav-active hover:text-text-primary ${
            collapsed ? "w-8" : "w-7"
          }`}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      </div>

      <nav
        className={`flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden pb-1.5 pt-4 ${
          collapsed ? "" : "[scrollbar-gutter:stable]"
        }`}
        style={navPadX}
      >
        <div className="flex flex-col gap-3">
          <Suspense
            fallback={
              collapsed ? (
                <div className="flex h-8 w-full items-center justify-center">
                  <Star className="h-4 w-4 text-text-tertiary" aria-hidden />
                </div>
              ) : (
                <div className="flex h-8 items-center gap-1.5 text-heading-xs text-text-tertiary">
                  <span className="flex h-8 w-8 items-center justify-center">
                    <Star className="h-4 w-4" aria-hidden />
                  </span>
                  Shortcuts
                </div>
              )
            }
          >
            <ShortcutsNav pathname={pathname} collapsed={collapsed} />
          </Suspense>
          {appKeys.includes("planner") && (
            <AppGroup
              label="Planner"
              icon={CalendarCheck}
              href={ROUTES.plannerConsultant}
              pathname={pathname}
              open={openApps.planner}
              onToggle={() =>
                setOpenApps((prev) => ({ ...prev, planner: !prev.planner }))
              }
              collapsed={collapsed}
              collapsedHref={ROUTES.plannerConsultant}
              active={plannerActive}
            >
              <NavLink
                href={ROUTES.plannerConsultant}
                label="Consultant"
                pathname={pathname}
                indent
                activeMatch="prefix"
              />
              <NavLink
                href={ROUTES.plannerCustomer}
                label="Customer"
                pathname={pathname}
                indent
                activeMatch="prefix"
              />
              <NavLink
                href={ROUTES.plannerProject}
                label="Project"
                pathname={pathname}
                indent
                activeMatch="prefix"
              />
              <NavLink
                href={ROUTES.plannerHistory}
                label="Allocation history"
                pathname={pathname}
                indent
                activeMatch="prefix"
              />
            </AppGroup>
          )}
          {appKeys.includes("time_report") && (
            <AppGroup
              label="Time report"
              icon={Clock}
              href={ROUTES.timeReportHome}
              pathname={pathname}
              open={openApps.timeReport}
              onToggle={() =>
                setOpenApps((prev) => ({
                  ...prev,
                  timeReport: !prev.timeReport,
                }))
              }
              collapsed={collapsed}
              collapsedHref={ROUTES.timeReportHome}
              active={timeReportChildActive}
            >
              <NavLink
                href={ROUTES.timeReport}
                label="Time report"
                pathname={pathname}
                indent
              />
              {showTimeApproval && (
                <NavLink
                  href={ROUTES.timeApproval}
                  label="Time approval"
                  pathname={pathname}
                  indent
                  activeMatch="prefix"
                />
              )}
            </AppGroup>
          )}
          {appKeys.includes("work") && (
            <AppGroup
              label="Rove Work"
              icon={Briefcase}
              href={ROUTES.work}
              pathname={pathname}
              open={openApps.work}
              onToggle={() =>
                setOpenApps((prev) => ({ ...prev, work: !prev.work }))
              }
              collapsed={collapsed}
              active={workActive}
            >
              <NavLink
                href={ROUTES.workMine}
                label="My work"
                pathname={pathname}
                depth={1}
                leading={<Inbox className="h-3.5 w-3.5 text-text-tertiary" aria-hidden />}
              />
              {workNav.length === 0 ? (
                <p className="px-2 py-1.5 pl-10 text-body-m text-text-tertiary">
                  No customers yet
                </p>
              ) : (
                workNav.map((customer) => (
                  <WorkCustomerNav
                    key={customer.id}
                    customer={customer}
                    pathname={pathname}
                    forceOpen={customer.id === activeWorkCustomerId}
                  />
                ))
              )}
            </AppGroup>
          )}
          {!isCustomerUser && (
            <>
              {appKeys.includes("insights") && (
                <NavLink
                  href={ROUTES.insights}
                  label="Insights"
                  icon={Sparkles}
                  pathname={pathname}
                  activeMatch="prefix"
                  collapsed={collapsed}
                />
              )}
              <NavPlaceholder
                label="Rove Support"
                icon={MessageCircle}
                collapsed={collapsed}
              />
            </>
          )}
        </div>

        {!isCustomerUser && (
          <div className="border-t border-border-subtle pt-4">
            <AppGroup
              label="Settings"
              icon={Settings}
              href={settingsRailHref}
              pathname={pathname}
              open={openApps.settings}
              onToggle={() =>
                setOpenApps((prev) => ({
                  ...prev,
                  settings: !prev.settings,
                }))
              }
              collapsed={collapsed}
              collapsedHref={settingsRailHref}
              active={settingsChildActive}
            >
              {isAdmin && (
                <>
                  <NavLink
                    href={ROUTES.settings}
                    label="General"
                    pathname={pathname}
                    indent
                  />
                  <NavLink
                    href={ROUTES.people}
                    label="People"
                    pathname={pathname}
                    indent
                    activeMatch="prefix"
                  />
                  <NavLink
                    href={ROUTES.monitors}
                    label="Monitors"
                    pathname={pathname}
                    indent
                    activeMatch="prefix"
                  />
                </>
              )}
              <NavLink
                href={ROUTES.customers}
                label="Customers"
                pathname={pathname}
                indent
                activeMatch="prefix"
              />
            </AppGroup>
          </div>
        )}
      </nav>

      <div className="flex flex-shrink-0 flex-col border-t border-border-subtle bg-bg-default">
        <div className="space-y-px" style={footerPad}>
          <button
            type="button"
            onClick={handleSignOut}
            title={collapsed ? "Log out" : undefined}
            aria-label={collapsed ? "Log out" : undefined}
            className="group flex h-8 w-full min-w-0 cursor-pointer items-center justify-start gap-1.5 rounded-md py-0 text-left text-body-l text-text-secondary transition-colors hover:bg-nav-active hover:text-text-primary"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center">
              <LogOut className="h-4 w-4" />
            </span>
            {!collapsed ? (
              <span className="min-w-0 flex-1 truncate text-left">Log out</span>
            ) : null}
          </button>
        </div>
      </div>
    </aside>
  );
}
