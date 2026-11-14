"use client";

import type { MouseEvent } from "react";
import { Check } from "lucide-react";

export function WorkScopeApproveButton({
  approved,
  canApprove,
  disabled = false,
  size = "card",
  onToggle,
}: {
  approved: boolean;
  /** False when size is missing — button stays visible but inert until sized. */
  canApprove: boolean;
  disabled?: boolean;
  size?: "card" | "drawer";
  onToggle: () => void;
}) {
  const iconClass = size === "drawer" ? "h-3.5 w-3.5" : "h-3 w-3";
  const padClass = size === "drawer" ? "h-7 w-7" : "h-6 w-6";
  // Native `disabled` skips hit-testing, so the card's pointer cursor shows on the
  // icon; use aria-disabled so not-allowed covers the whole control.
  const inert = disabled || (!approved && !canApprove);

  return (
    <button
      type="button"
      aria-disabled={inert}
      title={
        approved
          ? "Scope approved — click to unlock"
          : canApprove
            ? "Approve scope for delivery"
            : "Set a size before approving"
      }
      aria-label={approved ? "Unlock scope" : "Approve scope"}
      aria-pressed={approved}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        event.preventDefault();
        if (inert) return;
        onToggle();
      }}
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-md border transition",
        padClass,
        approved
          ? "border-[var(--color-green-300)] bg-[var(--color-green-50)] text-[var(--color-green-700)] hover:bg-[var(--color-green-100)]"
          : "border-border-form bg-bg-default text-text-tertiary hover:border-border-strong hover:text-text-secondary",
        inert
          ? "cursor-not-allowed opacity-40"
          : "",
      ].join(" ")}
    >
      <Check className={iconClass} strokeWidth={approved ? 2.75 : 2} aria-hidden />
    </button>
  );
}
