import { ROUTES } from "@/lib/routes";
import type { AppKey } from "@/lib/peopleTypes";

/** Active product theme for `html[data-app]` and chrome brand hints. */
export type AppThemeKey =
  | "planner"
  | "work"
  | "time-report"
  | "support"
  | "insights";

export type AppBrandClasses = {
  /** Colored icon (sidebar, inline glyphs). */
  icon: string;
  /** Soft wash behind active nav / selected chrome. */
  active: string;
  /** Icon tile: subtle fill + icon color (Home, App access). */
  tile: string;
  /** Small breadcrumb / badge dot. */
  dot: string;
};

/** Brand classes keyed by `AppKey` (DB / people access). */
export const APP_BRAND_BY_KEY: Record<AppKey, AppBrandClasses> = {
  planner: {
    icon: "text-app-planner",
    active: "bg-app-planner-subtle",
    tile: "bg-app-planner-subtle text-app-planner",
    dot: "bg-app-planner",
  },
  time_report: {
    icon: "text-app-time-report",
    active: "bg-app-time-report-subtle",
    tile: "bg-app-time-report-subtle text-app-time-report",
    dot: "bg-app-time-report",
  },
  work: {
    icon: "text-app-work",
    active: "bg-app-work-subtle",
    tile: "bg-app-work-subtle text-app-work",
    dot: "bg-app-work",
  },
  support: {
    icon: "text-app-support",
    active: "bg-app-support-subtle",
    tile: "bg-app-support-subtle text-app-support",
    dot: "bg-app-support",
  },
  insights: {
    icon: "text-app-insights",
    active: "bg-app-insights-subtle",
    tile: "bg-app-insights-subtle text-app-insights",
    dot: "bg-app-insights",
  },
};

/** Same brand classes keyed by `data-app` / path theme. */
export const APP_BRAND_BY_THEME: Record<AppThemeKey, AppBrandClasses> = {
  planner: APP_BRAND_BY_KEY.planner,
  "time-report": APP_BRAND_BY_KEY.time_report,
  work: APP_BRAND_BY_KEY.work,
  support: APP_BRAND_BY_KEY.support,
  insights: APP_BRAND_BY_KEY.insights,
};

export function appKeyToTheme(key: AppKey): AppThemeKey {
  return key === "time_report" ? "time-report" : key;
}

export function appThemeToKey(theme: AppThemeKey): AppKey {
  return theme === "time-report" ? "time_report" : theme;
}

/** Resolve product theme from pathname. Shell routes (Home, Settings, …) return null. */
export function appThemeFromPathname(pathname: string): AppThemeKey | null {
  if (pathname.startsWith(ROUTES.planner)) return "planner";
  if (pathname.startsWith("/time-report")) return "time-report";
  if (pathname.startsWith(ROUTES.work)) return "work";
  if (pathname.startsWith(ROUTES.support)) return "support";
  if (pathname.startsWith(ROUTES.insights)) return "insights";
  return null;
}

export function appBrandDotClass(theme: AppThemeKey | null): string | null {
  if (!theme) return null;
  return APP_BRAND_BY_THEME[theme].dot;
}
