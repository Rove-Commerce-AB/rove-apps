import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { modalInputClass } from "./inlineEditStyles";

type Props = {
  label: string;
  children: ReactNode;
  className?: string;
};

/** Compact read-only context row for Dialog / ActionPopover (below title hierarchy). */
export function ModalReadonlyField({ label, children, className = "" }: Props) {
  return (
    <div className={className.trim() || undefined}>
      <p className="text-[12px] font-medium text-text-secondary">{label}</p>
      <p className="mt-0.5 text-[13px] leading-snug text-text-primary">
        {children}
      </p>
    </div>
  );
}

/** Shared label style for editable fields inside slim modals. */
export const modalFieldLabelClass =
  "block text-[12px] font-medium text-text-secondary";

/**
 * Standard labeled control in Dialogs. Use this instead of `Input` / ad-hoc labels.
 * Pass the control as children (`input`, `Select`, `textarea`, …).
 */
export function ModalField({
  id,
  label,
  children,
  className = "",
}: {
  id?: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className.trim() || undefined}>
      <label htmlFor={id} className={modalFieldLabelClass}>
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** Text/number/email/url input with modal chrome. Prefer this over `Input` inside Dialogs. */
export function ModalTextInput({
  id,
  label,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
}) {
  return (
    <ModalField id={id} label={label}>
      <input
        id={id}
        className={`${modalInputClass} ${className}`.trim()}
        {...props}
      />
    </ModalField>
  );
}

/** Native select with modal chrome (when Radix Select is unnecessary). */
export function ModalNativeSelect({
  id,
  label,
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <ModalField id={id} label={label}>
      <select
        id={id}
        className={`${modalInputClass} ${className}`.trim()}
        {...props}
      >
        {children}
      </select>
    </ModalField>
  );
}

/** Group modal fields by priority; hairline between non-first sections. */
export function ModalFormSection({
  title,
  children,
  first = false,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  first?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`${
        first
          ? "space-y-3"
          : "mt-1 space-y-3 border-t border-border-subtle pt-3"
      } ${className}`.trim()}
    >
      {title ? (
        <p className="text-[12px] font-medium text-text-secondary">{title}</p>
      ) : null}
      {children}
    </div>
  );
}

/** Hours / % style segmented control for allocation modals. */
export function modalSegmentedButtonClass(selected: boolean) {
  return `min-w-0 flex-1 rounded-md text-[13px] font-medium transition-colors ${
    selected
      ? "bg-bg-default text-text-primary shadow-sm ring-1 ring-border-subtle"
      : "text-text-secondary hover:bg-bg-default/70 hover:text-text-primary"
  }`;
}

export const modalSegmentedGroupClass =
  "flex h-8 items-stretch gap-0.5 rounded-lg border border-border-subtle bg-bg-muted/50 p-0.5";
