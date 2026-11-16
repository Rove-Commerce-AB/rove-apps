"use client";

import { X } from "lucide-react";

type Props = {
  label: string;
  onRemove: () => void;
  /** Optional prefix shown muted before the label (e.g. "Team"). */
  prefix?: string;
};

/**
 * Prototype dismissible filter chip for allocation (and later shared) filter bars.
 * Click × to remove that constraint; whole chip is not a toggle.
 */
export function RemovableFilterChip({ label, onRemove, prefix }: Props) {
  return (
    <span className="inline-flex h-7 max-w-[12rem] items-center gap-1 rounded-md bg-accent-primary-subtle pl-2 pr-1 text-[12px] font-medium text-accent-primary-text">
      <span className="min-w-0 truncate">
        {prefix ? (
          <>
            <span className="opacity-70">{prefix}: </span>
            {label}
          </>
        ) : (
          label
        )}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm opacity-80 transition-opacity hover:bg-bg-default/40 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-offset-1"
        aria-label={`Remove filter ${prefix ? `${prefix} ${label}` : label}`}
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}
