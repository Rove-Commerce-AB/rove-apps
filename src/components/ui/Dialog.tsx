"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

/** Shared modal shell. For form content use class "modal-form-discreet" and modal styles from inlineEditStyles (modalInputClass, modalSelectTriggerClass, etc.) for consistent borders and focus. */
type DialogProps = React.ComponentProps<typeof DialogPrimitive.Root> & {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  overlayClassName?: string;
  contentClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  closeClassName?: string;
};

export function Dialog({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  overlayClassName,
  contentClassName,
  titleClassName,
  subtitleClassName,
  closeClassName,
  ...props
}: DialogProps) {
  const defaultOverlayClass = "fixed inset-0 z-50 bg-black/20";
  const defaultContentClass =
    "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-subtle bg-bg-default p-5 shadow-lg focus:outline-none";
  const defaultSubtitleClass = "pr-8 text-[12px] leading-snug text-text-tertiary";
  const defaultTitleClass =
    "pr-8 text-[15px] font-semibold leading-tight text-text-primary";
  const defaultCloseClass =
    "absolute right-3 top-3 rounded-md border border-transparent p-1 text-text-tertiary transition-colors hover:bg-bg-muted hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-inset";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} {...props}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={`${defaultOverlayClass} ${overlayClassName ?? ""}`.trim()}
        />
        <DialogPrimitive.Content
          className={`${defaultContentClass} ${contentClassName ?? ""}`.trim()}
          onOpenAutoFocus={(event) => {
            const root = event.currentTarget;
            if (!(root instanceof HTMLElement)) return;
            const preferred =
              root.querySelector<HTMLElement>("[autofocus]") ??
              root.querySelector<HTMLElement>(
                "input, textarea, select, [role='combobox']"
              );
            if (!preferred) return;
            event.preventDefault();
            preferred.focus();
          }}
          onPointerDownOutside={(e) => {
            const target = e.target;
            const el =
              target instanceof Element
                ? target
                : (target as { parentElement?: Element | null } | null)
                    ?.parentElement ?? null;
            if (el?.closest?.("[data-combobox-list]")) e.preventDefault();
            else onOpenChange?.(false);
          }}
          onEscapeKeyDown={() => onOpenChange?.(false)}
        >
          {subtitle ? (
            <p
              className={`${defaultSubtitleClass} ${subtitleClassName ?? ""}`.trim()}
            >
              {subtitle}
            </p>
          ) : null}
          <DialogPrimitive.Title
            className={`${defaultTitleClass} ${titleClassName ?? ""}`.trim()}
          >
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close
            className={`${defaultCloseClass} ${closeClassName ?? ""}`.trim()}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
