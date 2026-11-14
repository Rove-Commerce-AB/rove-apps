"use client";

import { Plus } from "lucide-react";

type Props = {
  /** Specific label, e.g. "Add project", "Add consultant". */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Inline list-append control for drawer / panel group headers.
 * Lucide Plus + specific label. Page primary CTAs stay solid Buttons.
 */
export function ListAddAction({
  label,
  onClick,
  disabled = false,
  className = "",
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-label-s font-medium text-text-secondary hover:bg-text-primary/[0.06] hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
    >
      <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
    </button>
  );
}
