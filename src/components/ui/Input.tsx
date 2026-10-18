import { forwardRef } from "react";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label?: string;
  error?: string;
  /** "compact" for toolbar/dashboard use: reduced vertical padding. */
  size?: "default" | "compact";
  /** Softer focus ring (e.g. in modals, matches rates/tasks form). */
  modalStyle?: boolean;
};

const inputBase =
  "box-border w-full rounded-lg border border-form bg-bg-default text-sm text-text-primary placeholder-text-muted focus:border-brand-signal focus:outline-none focus:ring-1 focus:ring-inset focus:ring-brand-signal/30 disabled:opacity-50";
const inputBaseModal =
  "box-border w-full rounded-lg border border-form bg-bg-default text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-form focus:ring-2 focus:ring-[var(--color-border-form)] focus:ring-inset disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, error, id, className = "", size = "default", modalStyle, ...props }, ref) => {
    const hasError = Boolean(error);
    return (
      <div>
        {label && (
          <label
            htmlFor={id}
            className="mb-1 block text-sm font-medium text-text-primary"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          suppressHydrationWarning
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : undefined}
          className={`${modalStyle ? inputBaseModal : inputBase} px-3 ${
            size === "compact" ? "h-9" : "h-10"
          } ${className}`}
          {...props}
        />
        {error && (
          <p id={id ? `${id}-error` : undefined} className="mt-1 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
