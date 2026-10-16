"use client";

import { useLayoutEffect } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Re-applies the stored theme after hydration. React resets the html class
 * to the server markup, which would otherwise drop the class the blocking
 * script set before paint.
 */
export function ThemeClass() {
  useLayoutEffect(() => {
    let dark = false;
    try {
      dark = localStorage.getItem(THEME_STORAGE_KEY) === "dark";
    } catch {
      dark = false;
    }
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  return null;
}
