"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { Search } from "lucide-react";

/**
 * Compact toolbar that sits tight above a table/list (Planner-style).
 * Search on the left (optional), filter/actions on the right.
 */
export function ListTableToolbar({
  leading,
  trailing,
  className = "",
}: {
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mb-1.5 flex flex-wrap items-center gap-2 ${className}`.trim()}
    >
      {leading ? <div className="min-w-0">{leading}</div> : null}
      {trailing ? (
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
          {trailing}
        </div>
      ) : null}
    </div>
  );
}

/** Subtle search field matching Filter control height (h-7). */
export function ListSearchInput({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative w-full max-w-xs sm:w-64">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary"
        aria-hidden
      />
      <input
        type="search"
        className={`box-border h-7 w-full rounded-md border border-border-subtle bg-bg-default px-2.5 py-0 pl-8 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none transition-colors hover:border-border-default focus:border-border-default focus:ring-1 focus:ring-border-default ${className}`.trim()}
        {...props}
      />
    </div>
  );
}
