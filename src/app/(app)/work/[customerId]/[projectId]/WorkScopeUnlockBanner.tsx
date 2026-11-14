"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

type Props = {
  open: boolean;
  onUnlock: () => void;
  onDismiss: () => void;
  className?: string;
};

/** Same shell as the board card “Approve before Done” alert, with a confirm check. */
export function WorkScopeUnlockBanner({
  open,
  onUnlock,
  onDismiss,
  className = "",
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node)) return;
      if (root.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      onDismissRef.current();
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out ${
        open
          ? "mt-1.5 grid-rows-[1fr] opacity-100"
          : "mt-0 grid-rows-[0fr] opacity-0"
      } ${className}`.trim()}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-danger/35 bg-bg-default px-2 py-1.5 text-[12px] leading-snug text-danger shadow-sm"
        >
          <span className="min-w-0 flex-1">Unlock scope?</span>
          <button
            type="button"
            aria-label="Unlock"
            title="Unlock"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors hover:bg-danger/10"
            onClick={(event) => {
              event.stopPropagation();
              onUnlock();
            }}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
