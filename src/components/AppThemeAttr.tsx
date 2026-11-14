"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { appThemeFromPathname } from "@/lib/appTheme";

/** Sets html[data-app] so accent tokens follow the active Rove Apps product. */
export function AppThemeAttr() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const app = appThemeFromPathname(pathname);
    const root = document.documentElement;
    if (app) root.dataset.app = app;
    else delete root.dataset.app;
  }, [pathname]);

  return null;
}
