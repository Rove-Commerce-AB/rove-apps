export const THEME_STORAGE_KEY = "rove-theme";
export const THEME_CHANGE_EVENT = "rove-theme-change";

export type ThemeMode = "light" | "dark";

/** Blocking script for the root layout. Default is light; only "dark" opts in. */
export const THEME_INIT_SCRIPT = `(function(){try{if(localStorage.getItem("${THEME_STORAGE_KEY}")==="dark"){document.documentElement.classList.add("dark");}}catch(e){}})();`;

export function readTheme(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function applyTheme(theme: ThemeMode) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be blocked. The class still applies for this view.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
