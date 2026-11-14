"use client";

import {
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Menu = { top: number; left: number };

type Props = {
  title: string;
  description?: string;
  /** Trigger control (usually a toolbar-style button). */
  trigger: ReactNode;
  triggerAriaLabel?: string;
  children: ReactNode | ((api: { close: () => void }) => ReactNode);
  /** Panel width in px. Default 280. */
  width?: number;
  className?: string;
};

function menuLeft(rect: DOMRect, width: number) {
  return Math.min(rect.right - width, window.innerWidth - width - 8);
}

/**
 * Compact anchored action panel (Export downtime DNA).
 * No page dimming — click outside / Escape closes.
 */
export function ActionPopover({
  title,
  description,
  trigger,
  triggerAriaLabel,
  children,
  width = 280,
  className = "",
}: Props) {
  const [menu, setMenu] = useState<Menu | null>(null);

  useEffect(() => {
    if (!menu) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-action-popover]")) return;
      setMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  function openMenu(event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({
      top: rect.bottom + 4,
      left: menuLeft(rect, width),
    });
  }

  function close() {
    setMenu(null);
  }

  const body =
    typeof children === "function" ? children({ close }) : children;

  return (
    <div className={className.trim() || undefined}>
      <button
        type="button"
        data-action-popover
        aria-label={triggerAriaLabel ?? title}
        aria-expanded={menu != null}
        aria-haspopup="dialog"
        className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-text-secondary transition-colors hover:bg-bg-muted hover:text-text-primary"
        onClick={openMenu}
      >
        {trigger}
      </button>
      {menu
        ? createPortal(
            <div
              data-action-popover
              role="dialog"
              aria-label={title}
              className="fixed z-50 rounded-lg border border-border-subtle bg-bg-default p-3 shadow-lg"
              style={{ top: menu.top, left: menu.left, width }}
            >
              <p className="text-[13px] font-medium text-text-primary">{title}</p>
              {description ? (
                <p className="mt-0.5 text-[12px] leading-snug text-text-tertiary">
                  {description}
                </p>
              ) : null}
              <div className={description || title ? "mt-3" : undefined}>
                {body}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
