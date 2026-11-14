"use client";

export type SegmentedControlOption<T extends string = string> = {
  value: T;
  label: string;
  count?: number;
};

type Props<T extends string> = {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Clicking the selected pill returns to this value (typically `"all"`). */
  allowDeselectTo?: T;
  "aria-label": string;
  className?: string;
};

/**
 * Exclusive pill group for list toolbars (Figma Segmented Control).
 * Not the same as OptionSegments (connected enum field).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  allowDeselectTo,
  "aria-label": ariaLabel,
  className = "",
}: Props<T>) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${className}`.trim()}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        const label =
          opt.count == null ? opt.label : `${opt.label} (${opt.count})`;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              if (selected) {
                if (
                  allowDeselectTo != null &&
                  opt.value !== allowDeselectTo
                ) {
                  onChange(allowDeselectTo);
                }
                return;
              }
              onChange(opt.value);
            }}
            className={
              selected
                ? "inline-flex cursor-pointer items-center rounded-full bg-accent-primary px-3.5 py-2 text-label-m text-text-inverse transition-colors hover:bg-accent-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-offset-2"
                : "inline-flex cursor-pointer items-center rounded-full bg-interactive-secondary-hover px-3.5 py-2 text-body-m text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-offset-2"
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
