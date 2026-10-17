"use client";

type Option = { value: string; label: string };

type Props = {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Optional name for aria */
  name?: string;
  className?: string;
};

/**
 * Segmented control: all options shown side by side, selected one highlighted.
 * Only one can be selected. Use for enum-like fields (e.g. Active/Inactive, probability steps).
 */
export function OptionSegments({
  options,
  value,
  onChange,
  disabled = false,
  name,
  className = "",
}: Props) {
  return (
    <div className="flex w-full justify-end">
      <div
        className={`inline-flex rounded-lg border border-form bg-bg-muted/30 p-0.5 ${className}`.trim()}
        role="group"
        aria-label={name}
      >
        {options.map((opt) => {
          const isSelected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
                isSelected
                  ? "bg-bg-default text-text-primary shadow-sm ring-1 ring-border"
                  : "text-text-primary opacity-70 hover:opacity-100"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
