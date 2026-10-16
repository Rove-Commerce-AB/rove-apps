"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type EntryFilterOption = { value: string; label: string };

type Props = {
  id: string;
  filterLabel: string;
  options: EntryFilterOption[];
  /** Empty array = no restriction (show all rows for this dimension). */
  selectedValues: string[];
  onSelectedValuesChange: (next: string[]) => void;
  emptySummary: string;
  className?: string;
  /** Extra classes on the trigger button (width etc.). */
  triggerClassName?: string;
};

export function EntryFilterMultiSelect({
  id,
  filterLabel,
  options,
  selectedValues,
  onSelectedValuesChange,
  emptySummary,
  className = "",
  triggerClassName = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (rootRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const summary = useMemo(() => {
    if (selectedValues.length === 0) return emptySummary;
    if (selectedValues.length === 1) {
      const o = options.find((x) => x.value === selectedValues[0]);
      const t = o?.label ?? selectedValues[0];
      return t.length > 44 ? `${t.slice(0, 41)}…` : t;
    }
    return `${selectedValues.length} selected`;
  }, [selectedValues, options, emptySummary]);

  const toggle = (value: string) => {
    if (selectedSet.has(value)) {
      onSelectedValuesChange(selectedValues.filter((v) => v !== value));
    } else {
      onSelectedValuesChange([...selectedValues, value]);
    }
  };

  const clear = () => {
    onSelectedValuesChange([]);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`flex min-w-0 flex-col gap-0.5 ${className}`.trim()}>
      <span className="text-[0.65rem] font-medium uppercase tracking-wide text-text-muted">
        {filterLabel}
      </span>
      <div className="relative min-w-0">
        <button
          id={id}
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          onClick={() => setOpen((o) => !o)}
          className={
            `flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--color-border-subtle)] bg-bg-default px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-default)] focus:border-[var(--color-border-default)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-default)] ${triggerClassName}`.trim()
          }
        >
          <span className="min-w-0 flex-1 truncate">{summary}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        {open ? (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 right-0 top-full z-[80] mt-1 max-h-64 overflow-auto rounded-lg border border-[var(--color-border-subtle)] bg-bg-default py-1 shadow-lg sm:min-w-[14rem]"
        >
          <div className="sticky top-0 z-[1] flex justify-end border-b border-border-subtle/60 bg-bg-default px-2 py-1">
            <button
              type="button"
              className="text-xs font-medium text-text-primary/80 hover:text-text-primary"
              onClick={() => {
                clear();
              }}
            >
              Clear
            </button>
          </div>
          <div className="px-1 pb-1 pt-0.5">
            {options.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-brand-blue/15"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0 rounded border-form"
                  checked={selectedSet.has(opt.value)}
                  onChange={() => toggle(opt.value)}
                />
                <span className="min-w-0 break-words text-text-primary">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
        ) : null}
      </div>
    </div>
  );
}
