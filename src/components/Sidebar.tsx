"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  Suspense,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import roveIcon from "@/app/icon.png";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Bell,
  Clock,
  Inbox,
  Settings,
  LogOut,
  Briefcase,
  MessageCircle,
  Sparkles,
  Star,
  Radar,
} from "lucide-react";
import { signOut } from "next-auth/react";
import {
  ROUTES,
  workCustomerHref,
  workProjectHref,
} from "@/lib/routes";
import type { AppKey } from "@/lib/peopleTypes";
import type { WorkSelectorCustomer } from "@/lib/workTypes";
import { CustomerFavicon } from "@/components/CustomerFavicon";
import { usePresentingMode } from "@/components/PresentingModeContext";
import { useShortcuts } from "@/components/ShortcutsProvider";
import {
  buildCurrentPageHref,
  shortcutMatchKey,
} from "@/lib/shortcutHref";
import {
  APP_BRAND_BY_THEME,
  type AppThemeKey,
} from "@/lib/appTheme";

/** 10px left padding so the w-8 icon column is centered in the rail. */
const SIDEBAR_RAIL_PAD_X = "10px";
export const SIDEBAR_COLLAPSED_COOKIE = "rove-sidebar-collapsed";
const SIDEBAR_COLLAPSED_MAX_AGE = 60 * 60 * 24 * 365;

type AppBrand = AppThemeKey;

/** Native tooltip only when the label is ellipsized. */
function SidebarTruncatedLabel({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      setTruncated(el.scrollWidth > el.clientWidth + 0.5);
    };
    measure();

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [text]);

  return (
    <span
      ref={ref}
      className={className}
      title={truncated ? text : undefined}
    >
      {text}
    </span>
  );
}

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

function hrefPathname(href: string) {
  return href.split("?")[0] || href;
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
  prefetch = false,
  onNavigate,
  brand,
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
  /** Prefetch RSC payload — use for app Overview landings. */
  prefetch?: boolean;
  /** Optimistic sidebar highlight before the route finishes loading. */
  onNavigate?: (href: string) => void;
  /** App brand for colored icon + active wash (top-level / collapsed rail). */
  brand?: AppBrand;
}) {
  const nest = indent || depth > 0;
  const isActive = active ?? pathMatches(pathname, href, activeMatch);
  const showBadge = typeof badgeCount === "number" && badgeCount > 0;
  const badgeLabel =
    badgeCount != null && badgeCount > 99 ? "99+" : String(badgeCount ?? "");
  const brandStyles = brand ? APP_BRAND_BY_THEME[brand] : null;

  const typeClass = nest ? "text-body-m" : "text-label-l";
  // depth 1 = customer/group (primary); depth 2 = child links (secondary).
  // plain indent (Planner etc.) stays secondary.
  const activeBg = brandStyles?.active ?? "bg-nav-active";
  const toneClass = isActive
    ? `${activeBg} text-text-primary`
    : depth >= 2
      ? "text-text-secondary transition-colors hover:bg-nav-active hover:text-text-primary"
      : depth === 1
        ? "text-text-primary transition-colors hover:bg-nav-active"
        : nest
          ? "text-text-secondary transition-colors hover:bg-nav-active hover:text-text-primary"
          : "text-text-primary transition-colors hover:bg-nav-active";

  return (
    <Link
      href={href}
      prefetch={prefetch}
      onClick={() => onNavigate?.(href)}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={`group relative flex h-8 w-full min-w-0 items-center justify-start gap-1.5 rounded-md py-0 ${typeClass} ${toneClass} ${className}`.trim()}
    >
      {!collapsed && depth >= 1 ? (
        <span className="w-8 shrink-0" aria-hidden />
      ) : null}
      {Icon ? (
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
          <Icon
            className={`h-4 w-4 ${brandStyles?.icon ?? ""}`.trim()}
          />
        </span>
      ) : leading ? (
        <span className="flex h-8 w-4 shrink-0 items-center justify-center">
          {leading}
        </span>
      ) : nest && !collapsed ? (
        <span
          className={`h-8 shrink-0 ${depth >= 2 ? "w-6" : "w-8"}`}
          aria-hidden
        />
      ) : null}
      {!collapsed ? (
        <>
          <span className="flex min-h-0 min-w-0 flex-1 items-center overflow-hidden text-left max-w-[12rem] whitespace-nowrap">
            <SidebarTruncatedLabel text={label} className="truncate" />
          </span>
          {showBadge ? (
            <span
              className="mr-1.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-signal px-1.5 text-[11px] font-semibold leading-none text-text-inverse tabular-nums"
              aria-label={`${badgeCount} unread notifications`}
            >
              {badgeLabel}
            </span>
          ) : null}
        </>
      ) : showBadge ? (
        <span
          className="absolute -right-0.5 -top-0.5 box-border inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-signal px-1 text-center text-[10px] font-semibold leading-none text-text-inverse tabular-nums shadow-sm"
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
  prefetch = true,
  onNavigate,
  brand,
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
  /** Prefetch landing href (Overview). Default on for product apps. */
  prefetch?: boolean;
  onNavigate?: (href: string) => void;
  /** Colored icon + active wash for product apps. Omit for shell (Settings). */
  brand?: AppBrand;
}) {
  const headingActive = href
    ? pathMatches(pathname, href, collapsed ? "prefix" : "exact")
    : collapsed && active;
  const groupActive = Boolean(headingActive || active);
  const brandStyles = brand ? APP_BRAND_BY_THEME[brand] : null;
  const activeBg = brandStyles?.active ?? "bg-nav-active";
  const iconClass = brandStyles?.icon ?? "";

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
          active={groupActive}
          prefetch={prefetch}
          onNavigate={onNavigate}
          brand={brand}
        />
      );
    }
  }

  return (
    <div className="flex flex-col gap-px">
      <div
        className={`flex h-8 w-full min-w-0 items-center overflow-hidden rounded-md ${
          groupActive ? activeBg : "hover:bg-nav-active"
        }`}
      >
        {href ? (
          <Link
            href={href}
            prefetch={prefetch}
            onClick={() => {
              if (!open) onToggle();
              onNavigate?.(href);
            }}
            className="flex h-8 min-w-0 flex-1 items-center justify-start gap-1.5 rounded-md py-0 text-left text-label-l text-text-primary"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
              <Icon className={`h-4 w-4 ${iconClass}`.trim()} />
            </span>
            <SidebarTruncatedLabel
              text={label}
              className="min-w-0 flex-1 truncate text-left max-w-[12rem]"
            />
          </Link>
        ) : (
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-start gap-1.5 rounded-md py-0 text-left text-label-l text-text-primary"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
              <Icon className={`h-4 w-4 ${iconClass}`.trim()} />
            </span>
            <SidebarTruncatedLabel
              text={label}
              className="min-w-0 flex-1 truncate text-left max-w-[12rem]"
            />
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
      className="flex h-8 w-full min-w-0 cursor-default items-center justify-start gap-1.5 rounded-md py-0 text-label-l text-[var(--color-zinc-500)]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">
        <Icon className="h-4 w-4" />
      </span>
      {!collapsed ? (
        <SidebarTruncatedLabel
          text={label}
          className="min-w-0 flex-1 truncate text-left max-w-[12rem]"
        />
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
          className={`flex h-8 w-full min-w-0 items-center justify-center rounded-md py-0 text-label-l transition-colors hover:bg-nav-active ${
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
                    className={`block px-3 py-1.5 text-body-m transition-colors hover:bg-nav-active hover:text-text-primary ${
                      active
                        ? "bg-nav-active text-text-primary"
                        : "text-text-secondary"
                    }`}
                  >
                    <SidebarTruncatedLabel
                      text={shortcut.name}
                      className="block truncate"
                    />
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
  onNavigate,
}: {
  customer: WorkSelectorCustomer;
  pathname: string;
  forceOpen: boolean;
  onNavigate?: (href: string) => void;
}) {
  const [open, setOpen] = useState(forceOpen);

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
            onNavigate={onNavigate}
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
              onNavigate={onNavigate}
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
  unreadNotificationCount?: number;
};

export function Sidebar({
  isAdmin = false,
  canSeeTimeReportProjectManager = false,
  isCustomerUser = false,
  appKeys = [],
  workNav = [],
  initialCollapsed = false,
  unreadNotificationCount = 0,
}: SidebarProps) {
  const presenting = usePresentingMode();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const pendingFromRef = useRef<string | null>(null);
  const [openApps, setOpenApps] = useState<{
    planner: boolean;
    timeReport: boolean;
    settings: boolean;
    work: boolean;
    support: boolean;
    insights: boolean;
    radar: boolean;
  }>({
    planner: false,
    timeReport: false,
    settings: false,
    work: false,
    support: false,
    insights: false,
    radar: false,
  });

  // Optimistic path so Overview/app highlight updates before RSC finishes.
  const activePath = pendingPath ?? pathname;

  const plannerActive = pathMatches(activePath, ROUTES.planner, "prefix");
  const timeReportChildActive = pathMatches(activePath, "/time-report", "prefix");
  const settingsChildActive = activePath.startsWith("/settings");
  const workActive = pathMatches(activePath, ROUTES.work, "prefix");
  const supportActive = pathMatches(activePath, ROUTES.support, "prefix");
  const insightsActive = pathMatches(activePath, ROUTES.insights, "prefix");
  const radarActive = pathMatches(activePath, ROUTES.radar, "prefix");
  const workSegment = activePath.startsWith(`${ROUTES.work}/`)
    ? activePath.slice(ROUTES.work.length + 1).split("/")[0] ?? null
    : null;
  const activeWorkCustomerId =
    workSegment && workSegment !== "overview" && workSegment !== "mine"
      ? workSegment
      : null;
  const showSupportOverview = !isCustomerUser && appKeys.includes("support");

  function markPending(href: string) {
    const next = hrefPathname(href);
    if (next === pathname && !pendingPath) return;
    pendingFromRef.current = pathname;
    setPendingPath(next);
  }

  useEffect(() => {
    if (!pendingPath) return;
    if (pathname === pendingPath) {
      setPendingPath(null);
      pendingFromRef.current = null;
      return;
    }
    if (
      pendingFromRef.current != null &&
      pathname !== pendingFromRef.current
    ) {
      setPendingPath(null);
      pendingFromRef.current = null;
    }
  }, [pathname, pendingPath]);

  useEffect(() => {
    setOpenApps((prev) => ({
      planner: plannerActive ? true : prev.planner,
      timeReport: timeReportChildActive ? true : prev.timeReport,
      settings: settingsChildActive ? true : prev.settings,
      work: workActive ? true : prev.work,
      support: supportActive ? true : prev.support,
      insights: insightsActive ? true : prev.insights,
      radar: radarActive ? true : prev.radar,
    }));
  }, [
    activePath,
    plannerActive,
    timeReportChildActive,
    settingsChildActive,
    workActive,
    supportActive,
    insightsActive,
    radarActive,
  ]);

  // Warm Overview RSC payloads so app-name clicks feel instant.
  useEffect(() => {
    const hrefs: string[] = [];
    if (appKeys.includes("planner")) hrefs.push(ROUTES.plannerPlanConsultant);
    if (appKeys.includes("time_report")) hrefs.push(ROUTES.timeReportOverview);
    if (appKeys.includes("work")) hrefs.push(ROUTES.workOverview);
    if (appKeys.includes("support")) {
      hrefs.push(
        showSupportOverview ? ROUTES.supportOverview : ROUTES.supportMonitors
      );
    }
    if (appKeys.includes("insights") && !isCustomerUser) {
      hrefs.push(ROUTES.insightsOverview);
    }
    if (appKeys.includes("radar") && !isCustomerUser) {
      hrefs.push(ROUTES.radarOverview);
    }
    for (const href of hrefs) {
      router.prefetch(href);
    }
  }, [appKeys, isCustomerUser, router, showSupportOverview]);

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

  if (presenting.active) {
    return null;
  }

  return (
    <aside
      className={`relative z-20 flex h-full flex-shrink-0 flex-col overflow-hidden border-r border-border-subtle bg-bg-default shadow-lg transition-[width] duration-200 ease-out ${
        collapsed ? "w-[52px]" : "w-56"
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
              <Image
                src={roveIcon}
                alt=""
                width={16}
                height={16}
                className="h-4 w-4 rounded-sm"
                priority
              />
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
                <div className="flex h-8 items-center gap-1.5 text-label-l text-text-tertiary">
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
              href={ROUTES.plannerPlanConsultant}
              pathname={activePath}
              open={openApps.planner}
              onToggle={() =>
                setOpenApps((prev) => ({ ...prev, planner: !prev.planner }))
              }
              collapsed={collapsed}
              collapsedHref={ROUTES.plannerPlanConsultant}
              active={plannerActive}
              onNavigate={markPending}
              brand="planner"
            >
              <NavLink
                href={ROUTES.plannerPlanConsultant}
                label="Consultant"
                pathname={activePath}
                indent
                active={
                  pathMatches(activePath, ROUTES.plannerPlanConsultant, "prefix") ||
                  pathMatches(activePath, ROUTES.plannerConsultants, "prefix")
                }
                prefetch
                onNavigate={markPending}
              />
              <NavLink
                href={ROUTES.plannerPlanCustomer}
                label="Customer"
                pathname={activePath}
                indent
                active={
                  pathMatches(activePath, ROUTES.plannerPlanCustomer, "prefix") ||
                  pathMatches(activePath, ROUTES.plannerCustomers, "prefix")
                }
                onNavigate={markPending}
              />
              <NavLink
                href={ROUTES.plannerPlanProject}
                label="Project"
                pathname={activePath}
                indent
                active={
                  pathMatches(activePath, ROUTES.plannerPlanProject, "prefix") ||
                  pathMatches(activePath, ROUTES.plannerProjects, "prefix")
                }
                onNavigate={markPending}
              />
              <NavLink
                href={ROUTES.plannerPlanAvailability}
                label="Availability"
                pathname={activePath}
                indent
                activeMatch="prefix"
                prefetch
                onNavigate={markPending}
              />
              <NavLink
                href={ROUTES.plannerPlanHistory}
                label="Allocation history"
                pathname={activePath}
                indent
                activeMatch="prefix"
                onNavigate={markPending}
              />
            </AppGroup>
          )}
          {appKeys.includes("time_report") && (
            <AppGroup
              label="Time report"
              icon={Clock}
              href={ROUTES.timeReportOverview}
              pathname={activePath}
              open={openApps.timeReport}
              onToggle={() =>
                setOpenApps((prev) => ({
                  ...prev,
                  timeReport: !prev.timeReport,
                }))
              }
              collapsed={collapsed}
              collapsedHref={ROUTES.timeReportOverview}
              active={timeReportChildActive}
              onNavigate={markPending}
              brand="time-report"
            >
              <NavLink
                href={ROUTES.timeReportOverview}
                label="Overview"
                pathname={activePath}
                indent
                prefetch
                onNavigate={markPending}
              />
              <NavLink
                href={ROUTES.timeReport}
                label="Time report"
                pathname={activePath}
                indent
                onNavigate={markPending}
              />
              <NavLink
                href={ROUTES.travelExpense}
                label="Travel expense"
                pathname={activePath}
                indent
                activeMatch="prefix"
                onNavigate={markPending}
              />
              {showTimeApproval && (
                <NavLink
                  href={ROUTES.timeApproval}
                  label="Time approval"
                  pathname={activePath}
                  indent
                  activeMatch="prefix"
                  onNavigate={markPending}
                />
              )}
            </AppGroup>
          )}
          {appKeys.includes("work") && (
            <AppGroup
              label="Rove Work"
              icon={Briefcase}
              href={ROUTES.workOverview}
              pathname={activePath}
              open={openApps.work}
              onToggle={() =>
                setOpenApps((prev) => ({ ...prev, work: !prev.work }))
              }
              collapsed={collapsed}
              collapsedHref={ROUTES.workOverview}
              active={workActive}
              onNavigate={markPending}
              brand="work"
            >
              <NavLink
                href={ROUTES.workOverview}
                label="Overview"
                pathname={activePath}
                indent
                prefetch
                onNavigate={markPending}
              />
              <NavLink
                href={ROUTES.workMine}
                label="My work"
                pathname={activePath}
                depth={1}
                onNavigate={markPending}
                leading={<Inbox className="h-3.5 w-3.5 text-text-tertiary" aria-hidden />}
              />
              <div className="h-1.5" aria-hidden />
              {workNav.length === 0 ? (
                <p className="px-2 py-1.5 pl-10 text-body-m text-text-tertiary">
                  No customers yet
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {workNav.map((customer) => (
                    <WorkCustomerNav
                      key={customer.id}
                      customer={customer}
                      pathname={activePath}
                      forceOpen={customer.id === activeWorkCustomerId}
                      onNavigate={markPending}
                    />
                  ))}
                </div>
              )}
            </AppGroup>
          )}
          {appKeys.includes("support") && (
            <AppGroup
              label="Rove Support"
              icon={MessageCircle}
              href={
                showSupportOverview
                  ? ROUTES.supportOverview
                  : ROUTES.supportMonitors
              }
              pathname={activePath}
              open={openApps.support}
              onToggle={() =>
                setOpenApps((prev) => ({
                  ...prev,
                  support: !prev.support,
                }))
              }
              collapsed={collapsed}
              collapsedHref={
                showSupportOverview
                  ? ROUTES.supportOverview
                  : ROUTES.supportMonitors
              }
              active={supportActive}
              onNavigate={markPending}
              brand="support"
            >
              {showSupportOverview ? (
                <NavLink
                  href={ROUTES.supportOverview}
                  label="Overview"
                  pathname={activePath}
                  indent
                  prefetch
                  onNavigate={markPending}
                />
              ) : null}
              <NavLink
                href={ROUTES.supportMonitors}
                label="Monitors"
                pathname={activePath}
                indent
                activeMatch="prefix"
                onNavigate={markPending}
              />
              <NavLink
                href={ROUTES.supportIncidents}
                label="Incidents"
                pathname={activePath}
                indent
                activeMatch="prefix"
                onNavigate={markPending}
              />
            </AppGroup>
          )}
          {appKeys.includes("insights") && !isCustomerUser && (
            <AppGroup
              label="Insights"
              icon={Sparkles}
              href={ROUTES.insightsOverview}
              pathname={activePath}
              open={openApps.insights}
              onToggle={() =>
                setOpenApps((prev) => ({
                  ...prev,
                  insights: !prev.insights,
                }))
              }
              collapsed={collapsed}
              collapsedHref={ROUTES.insightsOverview}
              active={insightsActive}
              onNavigate={markPending}
              brand="insights"
            >
              <NavLink
                href={ROUTES.insightsOverview}
                label="Overview"
                pathname={activePath}
                indent
                prefetch
                onNavigate={markPending}
              />
            </AppGroup>
          )}
          {appKeys.includes("radar") && !isCustomerUser && (
            <AppGroup
              label="Radar"
              icon={Radar}
              href={ROUTES.radarOverview}
              pathname={activePath}
              open={openApps.radar}
              onToggle={() =>
                setOpenApps((prev) => ({
                  ...prev,
                  radar: !prev.radar,
                }))
              }
              collapsed={collapsed}
              collapsedHref={ROUTES.radarOverview}
              active={radarActive}
              onNavigate={markPending}
              brand="radar"
            >
              <NavLink
                href={ROUTES.radarOverview}
                label="Overview"
                pathname={activePath}
                indent
                prefetch
                onNavigate={markPending}
              />
              <NavLink
                href={ROUTES.radarSearch}
                label="Search"
                pathname={activePath}
                indent
                activeMatch="prefix"
                onNavigate={markPending}
              />
              <NavLink
                href={ROUTES.radarAudiences}
                label="Target groups"
                pathname={activePath}
                indent
                activeMatch="prefix"
                onNavigate={markPending}
              />
              <NavLink
                href={ROUTES.radarCompanies}
                label="Companies"
                pathname={activePath}
                indent
                activeMatch="prefix"
                onNavigate={markPending}
              />
              <NavLink
                href={ROUTES.radarProspects}
                label="Prospects"
                pathname={activePath}
                indent
                activeMatch="prefix"
                onNavigate={markPending}
              />
              <NavLink
                href={ROUTES.radarVerticals}
                label="Verticals"
                pathname={activePath}
                indent
                activeMatch="prefix"
                onNavigate={markPending}
              />
              <NavLink
                href={ROUTES.radarJobs}
                label="Jobs"
                pathname={activePath}
                indent
                activeMatch="prefix"
                onNavigate={markPending}
              />
            </AppGroup>
          )}
        </div>

        <div className="flex flex-col gap-px border-t border-border-subtle pt-4">
          <NavLink
            href={ROUTES.notifications}
            label="Notifications"
            icon={Bell}
            pathname={activePath}
            activeMatch="prefix"
            collapsed={collapsed}
            badgeCount={unreadNotificationCount}
            onNavigate={markPending}
          />
          {!isCustomerUser ? (
            <AppGroup
              label="Settings"
              icon={Settings}
              href={settingsRailHref}
              pathname={activePath}
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
              onNavigate={markPending}
            >
              {isAdmin && (
                <>
                  <NavLink
                    href={ROUTES.settings}
                    label="General"
                    pathname={activePath}
                    indent
                    onNavigate={markPending}
                  />
                  <NavLink
                    href={ROUTES.people}
                    label="People"
                    pathname={activePath}
                    indent
                    activeMatch="prefix"
                    onNavigate={markPending}
                  />
                </>
              )}
              <NavLink
                href={ROUTES.customers}
                label="Customers"
                pathname={activePath}
                indent
                activeMatch="prefix"
                onNavigate={markPending}
              />
            </AppGroup>
          ) : null}
        </div>
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
