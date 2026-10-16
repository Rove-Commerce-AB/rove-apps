"use client";

import { Bug, CircleDot } from "lucide-react";
import type { WorkIssueType } from "@/lib/workTypes";
import { workIssueTypeLabel } from "@/lib/workBoardView";

const TYPE_STYLE: Record<
  WorkIssueType,
  { icon: typeof Bug; iconClass: string; selectedClass: string }
> = {
  issue: {
    icon: CircleDot,
    iconClass: "text-sky-700 dark:text-sky-300",
    selectedClass: "bg-sky-500/15 ring-1 ring-sky-500/40",
  },
  bug: {
    icon: Bug,
    iconClass: "text-rose-700 dark:text-rose-300",
    selectedClass: "bg-rose-500/15 ring-1 ring-rose-500/40",
  },
};

const SIZE_CLASS = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
} as const;

const HIT_CLASS = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
  /** Match common form control height (e.g. title field). */
  field: "h-9 w-9",
} as const;

export function WorkIssueTypeIcon({
  type,
  size = "md",
  className = "",
  title,
}: {
  type: WorkIssueType;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  title?: string;
}) {
  const style = TYPE_STYLE[type];
  const Icon = style.icon;
  const label = workIssueTypeLabel(type);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`.trim()}
      title={title ?? label}
    >
      <Icon
        className={`${SIZE_CLASS[size]} ${style.iconClass}`}
        aria-hidden
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function WorkIssueTypePicker({
  value,
  onChange,
  disabled = false,
  name = "Issue type",
  size = "md",
}: {
  value: WorkIssueType;
  onChange: (value: WorkIssueType) => void;
  disabled?: boolean;
  name?: string;
  size?: keyof typeof HIT_CLASS;
}) {
  const hit = HIT_CLASS[size];
  const iconSize = size === "field" ? "sm" : size;
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className="inline-flex shrink-0 items-center gap-0.5 self-center"
    >
      {(["issue", "bug"] as const).map((type) => {
        const selected = value === type;
        const style = TYPE_STYLE[type];
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={workIssueTypeLabel(type)}
            title={workIssueTypeLabel(type)}
            disabled={disabled}
            onClick={() => onChange(type)}
            className={`inline-flex ${hit} shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
              selected
                ? style.selectedClass
                : "text-text-tertiary hover:bg-bg-muted"
            }`}
          >
            <WorkIssueTypeIcon
              type={type}
              size={iconSize}
              className={selected ? "" : "opacity-70"}
            />
          </button>
        );
      })}
    </div>
  );
}
