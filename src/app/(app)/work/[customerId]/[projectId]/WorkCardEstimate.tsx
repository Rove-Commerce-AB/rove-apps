"use client";

import { useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Clock } from "lucide-react";
import type { BillingCurrency } from "@/lib/currency";
import {
  formatWorkEstimate,
  parseWorkEstimateValue,
  workEstimateSuffix,
  type WorkEstimateUnit,
} from "@/lib/workEstimate";

export function WorkCardEstimate({
  estimateHours,
  estimateUnit = "hours",
  billingCurrency = "SEK",
  disabled = false,
  onChange,
  onError,
}: {
  estimateHours: number | null;
  estimateUnit?: WorkEstimateUnit;
  billingCurrency?: BillingCurrency;
  disabled?: boolean;
  onChange: (value: number | null) => void;
  onError?: (message: string) => void;
}) {
  const [draft, setDraft] = useState(
    estimateHours == null ? "" : String(estimateHours)
  );
  const [editing, setEditing] = useState(false);
  const suffix = workEstimateSuffix(estimateUnit, billingCurrency);
  const formatted =
    estimateHours == null
      ? null
      : formatWorkEstimate(estimateHours, estimateUnit, billingCurrency);

  useEffect(() => {
    if (editing) return;
    setDraft(estimateHours == null ? "" : String(estimateHours));
  }, [estimateHours, editing]);

  function stopCard(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();
  }

  function commit() {
    const parsed = parseWorkEstimateValue(draft, estimateUnit);
    if (!parsed.ok) {
      setDraft(estimateHours == null ? "" : String(estimateHours));
      setEditing(false);
      onError?.(parsed.message);
      return;
    }
    setDraft(parsed.value == null ? "" : String(parsed.value));
    setEditing(false);
    if (parsed.value === estimateHours) return;
    onChange(parsed.value);
  }

  if (editing) {
    return (
      <label
        className="inline-flex items-center gap-0.5 rounded-md bg-bg-muted px-1.5 py-0.5"
        onClick={stopCard}
        onPointerDown={stopCard}
        onKeyDown={stopCard}
      >
        <Clock className="h-3 w-3 shrink-0 text-text-tertiary" aria-hidden />
        <input
          type="text"
          inputMode={estimateUnit === "points" ? "numeric" : "decimal"}
          autoFocus
          disabled={disabled}
          aria-label={`Estimate in ${suffix}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            stopCard(event);
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(estimateHours == null ? "" : String(estimateHours));
              setEditing(false);
            }
          }}
          className="w-10 border-0 bg-transparent p-0 text-right text-caption tabular-nums text-text-primary focus:outline-none disabled:opacity-50"
        />
        <span className="text-caption text-text-tertiary">{suffix}</span>
      </label>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      title={
        formatted == null
          ? "Set estimate"
          : `Estimate ${formatted} · click to edit`
      }
      aria-label={
        formatted == null ? "Set estimate" : `Estimate ${formatted}`
      }
      onClick={(event) => {
        stopCard(event);
        if (disabled) return;
        setEditing(true);
      }}
      onPointerDown={stopCard}
      onKeyDown={stopCard}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-caption tabular-nums transition-colors disabled:opacity-50 ${
        estimateHours == null
          ? "text-text-tertiary hover:bg-bg-muted hover:text-text-secondary"
          : "bg-bg-muted text-text-secondary hover:bg-border-subtle hover:text-text-primary"
      }`}
    >
      {formatted == null ? (
        <Clock className="h-3 w-3 shrink-0" aria-hidden />
      ) : (
        formatted
      )}
    </button>
  );
}
