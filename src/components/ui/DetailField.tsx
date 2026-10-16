"use client";

import { useRef, useEffect } from "react";
import { Check, AlertCircle, ChevronDown, Info } from "lucide-react";
import { Select, type SelectOption } from "./Select";
import {
  inlineEditTriggerClass,
  drawerEditTriggerClass,
  drawerSelectTriggerClass,
  INLINE_EDIT_VALUE_ROW_MIN_H,
  INLINE_EDIT_STATUS_ROW_MIN_H,
} from "./inlineEditStyles";

/** Inline-edit feedback: idle | saving | saved | error. Fixed height to avoid layout shift. */
export type InlineEditStatusState = "idle" | "saving" | "saved" | "error";

type InlineEditStatusProps = {
  status: InlineEditStatusState;
  /** Shown when status === "error" */
  message?: string | null;
};

const SAVED_DURATION_MS = 2000;

/**
 * Fixed-height status strip for inline-edit feedback. Renders below the input when editing.
 * - idle / saving / saved: empty (no text or spinner; saved feedback is the check next to the value).
 * - error: icon + message
 */
export function InlineEditStatus({ status, message }: InlineEditStatusProps) {
  if (status === "idle" || status === "saving" || status === "saved") {
    return <div className={`${INLINE_EDIT_STATUS_ROW_MIN_H} shrink-0`} aria-hidden />;
  }
  return (
    <div
      className={`flex ${INLINE_EDIT_STATUS_ROW_MIN_H} shrink-0 items-center gap-1.5 text-xs`}
      role="alert"
      aria-live="polite"
    >
      {message && (
        <>
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-danger" />
          <span className="text-danger">{message}</span>
        </>
      )}
    </div>
  );
}

/** Small green check shown next to the value after save; fades out. Use with showSavedIndicator or inline in list layouts. */
export function SavedCheckmark() {
  return (
    <Check
      className="h-4 w-4 shrink-0 text-success animate-[savedCheckFade_2s_ease-out]"
      aria-hidden
    />
  );
}

export { SAVED_DURATION_MS };

/**
 * Stable container for inline-edit fields. Prevents layout shift by always
 * reserving space for (1) value row and (2) status row. Use for detail pages.
 * When isEditing and onRequestClose are set, a click outside the container
 * calls onRequestClose (so Select and other editors close without needing to open dropdown first).
 */
type InlineEditFieldContainerProps = {
  isEditing: boolean;
  displayContent: React.ReactNode;
  editContent: React.ReactNode;
  statusContent: React.ReactNode;
  className?: string;
  /** When true, shows a small green check next to the value that fades out (caller clears after SAVED_DURATION_MS). */
  showSavedIndicator?: boolean;
  /** When false, the status row (min-h strip) is not rendered so the value can be vertically centered. Default true. */
  reserveStatusRow?: boolean;
  /** When true, skip the reserved checkmark column (drawer rows). */
  hideAccessory?: boolean;
  /** Called when user clicks outside the container while editing (e.g. commit or cancel). */
  onRequestClose?: () => void;
};

export function InlineEditFieldContainer({
  isEditing,
  displayContent,
  editContent,
  statusContent,
  className = "",
  showSavedIndicator = false,
  reserveStatusRow = true,
  hideAccessory = false,
  onRequestClose,
}: InlineEditFieldContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isEditing || !onRequestClose) return;
    const handleMouseDown = (ev: MouseEvent) => {
      const el = containerRef.current;
      const target = ev.target as Node;
      if (!el || el.contains(target)) return;
      // Don’t close when click is inside a dropdown (e.g. Radix Select portal). Otherwise
      // click-outside runs before onValueChange and we commit the old value and the new choice is lost.
      const inDropdown =
        target.nodeType === Node.ELEMENT_NODE &&
        (target as Element).closest?.('[role="listbox"], [role="option"]');
      if (!inDropdown) onRequestClose();
    };
    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, [isEditing, onRequestClose]);

  return (
    <div
      ref={containerRef}
      className={`flex w-full min-w-0 flex-col ${className}`.trim()}
      data-inline-edit-container
    >
      <div
        className={`flex w-full min-w-0 flex-1 items-center gap-2 ${INLINE_EDIT_VALUE_ROW_MIN_H}`}
        data-inline-edit-value-row
      >
        <span className="min-w-0 flex-1">{isEditing ? editContent : displayContent}</span>
        {!hideAccessory && (
          <span className="inline-flex w-6 shrink-0 items-center justify-end" aria-hidden>
            {!isEditing && showSavedIndicator ? <SavedCheckmark /> : null}
          </span>
        )}
      </div>
      {reserveStatusRow && (
        <div
          className={`shrink-0 ${INLINE_EDIT_STATUS_ROW_MIN_H}`}
          data-inline-edit-status-row
        >
          {isEditing ? statusContent : <div className={INLINE_EDIT_STATUS_ROW_MIN_H} aria-hidden />}
        </div>
      )}
    </div>
  );
}

type Props = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Label for a field on detail pages (e.g. Company name, Account Manager).
 * Small, uppercase, muted. Use with FieldValue for consistent typography.
 */
export function FieldLabel({ children, className = "" }: Props) {
  return (
    <div
      className={`pl-1 text-xs font-medium uppercase tracking-wider text-text-primary opacity-70 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

/** Info (i) icon with hover/focus tooltip for field helper copy. */
export function FieldInfoTip({ text }: { text: string }) {
  return (
    <span className="group/infotip relative inline-flex shrink-0">
      <span
        tabIndex={0}
        role="img"
        aria-label={text}
        className="inline-flex cursor-help rounded-full text-text-tertiary transition-colors hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 w-56 rounded-md border border-border-subtle bg-bg-default px-2.5 py-1.5 text-left text-xs font-normal normal-case tracking-normal text-text-secondary opacity-0 shadow-md transition-opacity group-hover/infotip:opacity-100 group-focus-within/infotip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

/**
 * Value text for a field on detail pages. Semibold, primary color, small size to match label scale.
 */
export function FieldValue({ children, className = "" }: Props) {
  return (
    <span
      className={`truncate text-sm font-semibold text-text-primary ${className}`.trim()}
    >
      {children}
    </span>
  );
}

type InlineEditTriggerProps = {
  onClick: () => void;
  children: React.ReactNode;
  /** Extra classes (e.g. for empty-state text color) */
  className?: string;
  /** Always-visible value box (drawer). */
  boxed?: boolean;
  /** Dropdown affordance on the right of the box. */
  showChevron?: boolean;
};

/**
 * Reusable trigger for inline-editable fields. Shows value and a discrete edit icon on hover.
 * Use for text, number, date, select display states on detail pages.
 */
export function InlineEditTrigger({
  onClick,
  children,
  className = "",
  boxed = false,
  showChevron = false,
}: InlineEditTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group ${boxed ? drawerEditTriggerClass : inlineEditTriggerClass} ${className}`.trim()}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {showChevron ? (
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden />
      ) : null}
    </button>
  );
}

/**
 * Read-only row for badges/toggles on detail pages: matches {@link InlineEditFieldContainer}
 * value strip + reserved status strip so vertical rhythm aligns with editable fields.
 */
export function DetailBadgeFieldRow({
  label,
  info,
  children,
}: {
  label: React.ReactNode;
  /** Helper copy shown on hover via an (i) icon next to the label. */
  info?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <FieldLabel className="flex items-center gap-1">
        <span>{label}</span>
        {info ? <FieldInfoTip text={info} /> : null}
      </FieldLabel>
      <div className="flex w-full min-w-0 flex-col">
        <div
          className={`flex w-full min-w-0 flex-1 items-center gap-2 ${INLINE_EDIT_VALUE_ROW_MIN_H}`}
        >
          <span className="min-w-0 flex-1">{children}</span>
          <span className="inline-flex w-6 shrink-0 items-center justify-end" aria-hidden />
        </div>
        <div className={`shrink-0 ${INLINE_EDIT_STATUS_ROW_MIN_H}`} aria-hidden />
      </div>
    </div>
  );
}

/** Stacked label-above-value for full detail pages. */
export function DetailFieldStack({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

/** Figma drawer row: label left, value box in a right column. */
export function DrawerFieldRow({
  label,
  info,
  children,
  variant = "field",
}: {
  label: string;
  /** Helper copy shown on hover via an (i) icon next to the label. */
  info?: string;
  children: React.ReactNode;
  variant?: "field" | "summary";
}) {
  if (variant === "summary") {
    return (
      <div className="flex items-center justify-between gap-4 py-3.5">
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-text-primary">
          {label}
          {info ? <FieldInfoTip text={info} /> : null}
        </span>
        <div className="min-w-0 shrink-0">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="inline-flex shrink-0 items-center gap-1 text-[13px] text-text-secondary">
        {label}
        {info ? <FieldInfoTip text={info} /> : null}
      </span>
      <div className="w-[14.5rem] shrink-0">{children}</div>
    </div>
  );
}

/** Drawer dropdown: always interactive so the first click opens the menu. */
export function DrawerSelectField({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  isLoading,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      isLoading={isLoading}
      variant="inlineEdit"
      className="min-w-0 w-full flex-1"
      triggerClassName={drawerSelectTriggerClass}
    />
  );
}
