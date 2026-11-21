"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Presentation } from "lucide-react";
import { Button, Switch } from "@/components/ui";
import { usePresentingMode } from "@/components/PresentingModeContext";

type Menu = { top: number; left: number };

const PANEL_WIDTH = 280;

export function PresentingModeToggle() {
  const presenting = usePresentingMode();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [draftEstimates, setDraftEstimates] = useState(false);
  const [draftReportedTime, setDraftReportedTime] = useState(false);

  useEffect(() => {
    if (!menu) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-presenting-popover]")) return;
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
    const left = Math.min(
      rect.right - PANEL_WIDTH,
      window.innerWidth - PANEL_WIDTH - 8
    );
    if (presenting.active) {
      setDraftEstimates(presenting.showEstimates);
      setDraftReportedTime(presenting.showReportedTime);
    } else {
      setDraftEstimates(presenting.suggested.showEstimates);
      setDraftReportedTime(presenting.suggested.showReportedTime);
    }
    setMenu({ top: rect.bottom + 4, left: Math.max(8, left) });
  }

  return (
    <>
      <button
        type="button"
        data-presenting-popover
        aria-label={
          presenting.active ? "Presenting options" : "Start presenting"
        }
        title={presenting.active ? "Presenting" : "Present"}
        aria-expanded={menu != null}
        aria-haspopup="dialog"
        aria-pressed={presenting.active}
        onClick={openMenu}
        className={`flex items-center justify-center rounded-md px-3 py-3 transition-colors hover:bg-nav-hover hover:text-text-primary ${
          presenting.active
            ? "text-accent-primary"
            : "text-text-primary/70"
        }`}
      >
        <Presentation className="h-5 w-5" aria-hidden />
      </button>
      {menu
        ? createPortal(
            <div
              data-presenting-popover
              role="dialog"
              aria-label="Presenting"
              className="fixed z-50 rounded-lg border border-border-subtle bg-bg-default p-3 shadow-lg"
              style={{ top: menu.top, left: menu.left, width: PANEL_WIDTH }}
            >
              <p className="text-[13px] font-medium text-text-primary">
                {presenting.active ? "Presenting" : "Present to customer"}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Hides the sidebar and admin controls. Choose what the customer
                should see on screen.
              </p>
              <div className="mt-3 space-y-2.5">
                <Switch
                  id="presenting-show-estimates"
                  label="Show estimates"
                  checked={
                    presenting.active
                      ? presenting.showEstimates
                      : draftEstimates
                  }
                  onCheckedChange={(checked) => {
                    if (presenting.active) {
                      presenting.setShowEstimates(checked);
                    } else {
                      setDraftEstimates(checked);
                    }
                  }}
                />
                <Switch
                  id="presenting-show-reported-time"
                  label="Show logged time"
                  checked={
                    presenting.active
                      ? presenting.showReportedTime
                      : draftReportedTime
                  }
                  onCheckedChange={(checked) => {
                    if (presenting.active) {
                      presenting.setShowReportedTime(checked);
                    } else {
                      setDraftReportedTime(checked);
                    }
                  }}
                />
              </div>
              <div className="mt-3 flex justify-end gap-2">
                {presenting.active ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      presenting.stopPresenting();
                      setMenu(null);
                    }}
                  >
                    Stop presenting
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      presenting.startPresenting({
                        showEstimates: draftEstimates,
                        showReportedTime: draftReportedTime,
                      });
                      setMenu(null);
                    }}
                  >
                    Start presenting
                  </Button>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
