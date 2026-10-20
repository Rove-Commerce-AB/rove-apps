"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

type SideDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: React.ReactNode;
  /** Replaces the default title/subtitle block (e.g. avatar + meta). Title stays for a11y. */
  header?: React.ReactNode;
  /** Default `p-4 overflow-y-auto`. Use `p-0` when tabs need to span the drawer width. */
  bodyClassName?: string;
  children: React.ReactNode;
};

function eventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  return (target as { parentElement?: Element | null } | null)?.parentElement ?? null;
}

/** Commit focused inputs (blur handlers) before the drawer unmounts. */
function blurActiveElement() {
  const el = document.activeElement;
  if (el instanceof HTMLElement) el.blur();
}

/**
 * Right-side overlay drawer. Slides in from the right; dims the page.
 * Closes via X, Escape, or click on the overlay.
 */
export function SideDrawer({
  open,
  onOpenChange,
  title,
  subtitle,
  header,
  bodyClassName = "overflow-y-auto p-4",
  children,
}: SideDrawerProps) {
  function requestClose() {
    // Outside-click / dismiss can unmount before React runs input onBlur.
    // Force blur first so draft fields (estimate, title, …) flush to the server.
    blurActiveElement();
    onOpenChange(false);
  }

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) blurActiveElement();
        onOpenChange(next);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="side-drawer-overlay fixed inset-0 z-50 bg-black/25" />
        <DialogPrimitive.Content
          className="side-drawer-content fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[40rem] flex-col border-l border-border-subtle bg-bg-default shadow-lg focus:outline-none"
          onPointerDownOutside={(e) => {
            const original = (
              e as unknown as { detail?: { originalEvent?: Event } }
            ).detail?.originalEvent;
            const el =
              eventTargetElement(original?.target ?? null) ??
              eventTargetElement(e.target);
            if (
              el?.closest?.("[data-combobox-list]") ||
              el?.closest?.("[data-radix-select-content]") ||
              el?.closest?.("[data-radix-alert-dialog-content]") ||
              el?.closest?.("[data-radix-dialog-content]") ||
              el?.closest?.("[data-board-add-person]") ||
              el?.closest?.("[data-card-issue-type]") ||
              el?.closest?.("[data-card-assign-people]") ||
              document.querySelector("[data-radix-alert-dialog-content]") ||
              document.querySelectorAll("[data-radix-dialog-content]").length > 1
            ) {
              e.preventDefault();
              return;
            }
            // Prevent Radix from dismissing before our blur+close runs.
            e.preventDefault();
            requestClose();
          }}
          onInteractOutside={(e) => {
            const original = (
              e as unknown as { detail?: { originalEvent?: Event } }
            ).detail?.originalEvent;
            const el =
              eventTargetElement(original?.target ?? null) ??
              eventTargetElement(e.target);
            if (
              el?.closest?.("[data-board-add-person]") ||
              el?.closest?.("[data-card-issue-type]") ||
              el?.closest?.("[data-card-assign-people]")
            ) {
              e.preventDefault();
            }
          }}
          onFocusOutside={(e) => {
            const original = (
              e as unknown as { detail?: { originalEvent?: Event } }
            ).detail?.originalEvent;
            const el =
              eventTargetElement(original?.target ?? null) ??
              eventTargetElement(e.target);
            if (
              el?.closest?.("[data-board-add-person]") ||
              el?.closest?.("[data-card-issue-type]") ||
              el?.closest?.("[data-card-assign-people]")
            ) {
              e.preventDefault();
            }
          }}
          onEscapeKeyDown={(e) => {
            const el = eventTargetElement(e.target);
            if (
              document.querySelectorAll("[data-radix-dialog-content]").length > 1 ||
              document.querySelector("[data-radix-alert-dialog-content]") ||
              el?.closest?.(
                "input, textarea, select, [data-radix-select-content], [data-combobox-list]"
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-6 py-5">
            {header != null ? (
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
                {header}
                <DialogPrimitive.Description className="sr-only">
                  Details
                </DialogPrimitive.Description>
              </div>
            ) : (
              <div className="min-w-0">
                <DialogPrimitive.Title className="truncate text-heading-l text-text-primary">
                  {title}
                </DialogPrimitive.Title>
                {subtitle != null && subtitle !== "" ? (
                  <DialogPrimitive.Description className="mt-0.5 text-sm text-text-secondary">
                    {subtitle}
                  </DialogPrimitive.Description>
                ) : (
                  <DialogPrimitive.Description className="sr-only">
                    Details
                  </DialogPrimitive.Description>
                )}
              </div>
            )}
            <DialogPrimitive.Close
              aria-label="Close"
              onPointerDown={(event) => {
                // Blur focused fields before the close button takes focus/unmounts.
                if (document.activeElement instanceof HTMLElement) {
                  const active = document.activeElement;
                  if (active !== event.currentTarget) active.blur();
                }
              }}
              className="cursor-pointer rounded-md border border-border-default p-1.5 text-text-secondary transition-colors hover:bg-interactive-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
