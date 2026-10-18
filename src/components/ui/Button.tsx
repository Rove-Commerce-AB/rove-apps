import { forwardRef, cloneElement, Children, isValidElement } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "dangerSecondary" | "ghost";
type ButtonSize = "default" | "sm";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
  asChild?: boolean;
};

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-offset-2";

/** Stable class so modal-form-discreet can exclude primary/danger actions from grey border. */
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    `btn-primary bg-brand-signal text-text-inverse hover:bg-accent-primary-hover active:bg-accent-primary-active ${focusRing}`,
  danger: `btn-danger bg-danger text-text-inverse hover:opacity-90 ${focusRing}`,
  secondary:
    `border border-form bg-bg-default text-text-primary hover:bg-bg-muted ${focusRing}`,
  dangerSecondary:
    `border border-form text-danger bg-bg-default hover:bg-danger/10 ${focusRing}`,
  ghost:
    `text-text-primary hover:bg-bg-muted ${focusRing}`,
};

const sizeClasses: Record<ButtonSize, string> = {
  /** Fixed heights so buttons line up with Input / select / h-9 controls. */
  default: "box-border h-10 rounded-lg px-4 text-sm font-medium",
  sm: "box-border h-9 rounded-md px-3 text-sm font-medium",
};

const baseClasses = "cursor-pointer inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "primary", size = "default", className = "", children, disabled, asChild, ...props }, ref) => {
    const combinedClassName = `${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`.trim();

    if (asChild) {
      const child = Children.only(children);
      if (isValidElement(child)) {
        return cloneElement(child as React.ReactElement<{ className?: string }>, {
          className: [combinedClassName, (child.props as { className?: string }).className].filter(Boolean).join(" "),
        });
      }
    }

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={combinedClassName}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
