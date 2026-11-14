import {
  Briefcase,
  CalendarCheck,
  Clock,
  MessageCircle,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { APP_BRAND_BY_KEY } from "@/lib/appTheme";
import type { AppKey } from "@/lib/peopleTypes";

/** Shared Lucide icons for Rove Apps products. */
export const APP_ICONS: Record<AppKey, LucideIcon> = {
  planner: CalendarCheck,
  time_report: Clock,
  work: Briefcase,
  support: MessageCircle,
  insights: Sparkles,
};

/** Display name + icon + brand tile for access lists / create flows. */
export const APP_ACCESS_ITEMS: Record<
  AppKey,
  { name: string; icon: LucideIcon; tileClass: string }
> = {
  planner: {
    name: "Rove Planner",
    icon: APP_ICONS.planner,
    tileClass: APP_BRAND_BY_KEY.planner.tile,
  },
  time_report: {
    name: "Rove Time report",
    icon: APP_ICONS.time_report,
    tileClass: APP_BRAND_BY_KEY.time_report.tile,
  },
  work: {
    name: "Rove Work",
    icon: APP_ICONS.work,
    tileClass: APP_BRAND_BY_KEY.work.tile,
  },
  support: {
    name: "Rove Support",
    icon: APP_ICONS.support,
    tileClass: APP_BRAND_BY_KEY.support.tile,
  },
  insights: {
    name: "Rove Insights",
    icon: APP_ICONS.insights,
    tileClass: APP_BRAND_BY_KEY.insights.tile,
  },
};
