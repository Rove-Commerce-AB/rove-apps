"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { WorkPerson } from "@/lib/workTypes";

type Props = {
  open: boolean;
  people: WorkPerson[];
  disabled?: boolean;
  onConfirm: (approverAppUserId: string) => void;
  onDismiss: () => void;
  className?: string;
};

/** Under-card / drawer banner: pick customer approver then confirm with check. */
export function WorkScopeApproverBanner({
  open,
  people,
  disabled = false,
  onConfirm,
  onDismiss,
  className = "",
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const [approverId, setApproverId] = useState("");

  useEffect(() => {
    if (!open) {
      setApproverId("");
      return;
    }
    setApproverId((current) => {
      if (current && people.some((person) => person.id === current)) {
        return current;
      }
      return people[0]?.id ?? "";
    });
  }, [open, people]);

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

  const canConfirm = Boolean(approverId) && !disabled && people.length > 0;

  return (
    <div
      ref={rootRef}
      className={`grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out ${
        open
          ? "mt-1.5 grid-rows-[1fr] opacity-100"
          : "mt-0 grid-rows-[0fr] opacity-0"
      } ${className}`.trim()}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          role="dialog"
          aria-label="Select customer approver"
          className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-default px-2 py-1.5 text-[12px] leading-snug text-text-primary shadow-sm"
        >
          <span className="shrink-0 text-text-secondary">Approver</span>
          {people.length === 0 ? (
            <span className="min-w-0 flex-1 text-text-secondary">
              No customer Work users
            </span>
          ) : (
            <select
              value={approverId}
              disabled={disabled}
              aria-label="Customer approver"
              className="min-w-0 flex-1 rounded border border-form bg-bg-default px-1.5 py-1 text-[12px] text-text-primary focus:border-brand-signal focus:outline-none"
              onChange={(event) => setApproverId(event.target.value)}
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            aria-label="Confirm approver and approve"
            title="Approve"
            disabled={!canConfirm}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-green-700)] transition-colors hover:bg-[var(--color-green-50)] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={(event) => {
              event.stopPropagation();
              if (!canConfirm) return;
              onConfirm(approverId);
            }}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
