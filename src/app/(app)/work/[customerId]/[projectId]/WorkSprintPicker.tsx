"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Calendar, Check, CircleDot, Plus } from "lucide-react";
import type { WorkSprint } from "@/lib/workTypes";
import { workSprintLabel } from "@/lib/workSprintLabel";

/** Fixed chip size so Board / Planning / Timeline don't jump when switching. */
const CHIP_SIZE = "box-border h-[3.25rem] w-[9rem] shrink-0";

type SprintStatusKind = "current" | "planned" | "completed";

function statusKind(sprint: WorkSprint): SprintStatusKind {
  if (sprint.status === "current") return "current";
  if (sprint.status === "next") return "planned";
  return "completed";
}

function statusTitle(kind: SprintStatusKind) {
  if (kind === "current") return "Current";
  if (kind === "planned") return "Planned";
  return "Completed";
}

function StatusIcon({
  kind,
  className,
}: {
  kind: SprintStatusKind;
  className?: string;
}) {
  if (kind === "current") {
    return <CircleDot className={className} aria-hidden />;
  }
  if (kind === "planned") {
    return <Calendar className={className} aria-hidden />;
  }
  return <Check className={className} aria-hidden />;
}

function formatShortDate(iso: string) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function WorkSprintPicker({
  sprints,
  selectedIds = [],
  onChange,
  multi = false,
  onPlanNext,
  planNextDisabled = false,
  onCloseCurrent,
  closeCurrentDisabled = false,
}: {
  sprints: WorkSprint[];
  selectedIds?: readonly string[];
  onChange: (ids: string[]) => void;
  /** When true, chips toggle independently (Board filter). */
  multi?: boolean;
  /** Dashed empty sprint chip after the rightmost sprint (Planning). */
  onPlanNext?: () => void;
  planNextDisabled?: boolean;
  /** Close control inside the current sprint chip (Planning). */
  onCloseCurrent?: () => void;
  closeCurrentDisabled?: boolean;
}) {
  const selectedRef = useRef<HTMLElement | null>(null);
  const skipInitialScrollRef = useRef(true);
  const selectedSet = new Set(selectedIds);
  const focusId = selectedIds[selectedIds.length - 1] ?? null;

  function bindSelectedRef(sprintId: string) {
    return (el: HTMLElement | null) => {
      if (sprintId === focusId) selectedRef.current = el;
    };
  }

  // Only auto-scroll for single-select (Planning) after the user changes
  // selection — not on mount, or switching Timeline↔Planning re-scrolls the
  // chip strip and looks like a selection blink.
  useEffect(() => {
    if (multi) return;
    if (skipInitialScrollRef.current) {
      skipInitialScrollRef.current = false;
      return;
    }
    selectedRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "nearest",
      block: "nearest",
    });
  }, [focusId, multi]);

  if (sprints.length === 0) return null;

  function selectSprint(sprintId: string) {
    if (multi) {
      if (selectedSet.has(sprintId)) {
        onChange(selectedIds.filter((id) => id !== sprintId));
        return;
      }
      onChange([...selectedIds, sprintId]);
      return;
    }
    onChange([sprintId]);
  }

  return (
    <div
      role={multi ? "group" : "tablist"}
      aria-label={multi ? "Filter by sprint" : "Sprints"}
      className="-mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 py-1.5"
    >
      {sprints.map((sprint) => {
        const selected = selectedSet.has(sprint.id);
        const isCurrent = sprint.status === "current";
        const kind = statusKind(sprint);
        const status = statusTitle(kind);
        const showClose = Boolean(onCloseCurrent) && isCurrent && !multi;
        const chipClass = `${CHIP_SIZE} overflow-hidden rounded-md border transition-colors ${
          selected
            ? "border-interactive-primary bg-interactive-primary text-text-inverse"
            : "border-border-subtle bg-bg-default text-text-primary hover:bg-bg-muted"
        } ${
          !selected && isCurrent
            ? "ring-2 ring-inset ring-interactive-primary"
            : ""
        }`;

        const iconClass = `h-3.5 w-3.5 shrink-0 ${
          selected
            ? "text-text-inverse/80"
            : kind === "current"
              ? "text-text-primary"
              : kind === "planned"
                ? "text-text-secondary"
                : "text-text-tertiary"
        }`;

        const body: ReactNode = (
          <>
            <span className="flex w-full min-w-0 items-center gap-1.5">
              <span title={status} className="inline-flex shrink-0 items-center">
                <StatusIcon kind={kind} className={iconClass} />
                <span className="sr-only">{status}</span>
              </span>
              <span
                className={`min-w-0 truncate text-[13px] font-medium ${
                  selected ? "text-text-inverse" : "text-text-primary"
                }`}
              >
                {workSprintLabel(sprint)}
              </span>
            </span>
            <span
              className={`w-full truncate text-left text-caption tabular-nums ${
                selected ? "text-text-inverse/70" : "text-text-tertiary"
              }`}
            >
              {formatShortDate(sprint.startsOn)}–
              {formatShortDate(sprint.endsOn)}
            </span>
          </>
        );

        if (showClose) {
          return (
            <div
              key={sprint.id}
              ref={bindSelectedRef(sprint.id)}
              className={`${chipClass} flex items-stretch`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={`${workSprintLabel(sprint)} (current sprint)`}
                title={`${workSprintLabel(sprint)} · ${status} · ${sprint.startsOn} → ${sprint.endsOn}`}
                onClick={() => selectSprint(sprint.id)}
                className="flex min-w-0 flex-1 flex-col items-start justify-center gap-0.5 px-2.5 py-1.5 text-left"
              >
                {body}
              </button>
              <button
                type="button"
                disabled={closeCurrentDisabled}
                aria-label="Complete sprint"
                title="Complete sprint"
                onClick={onCloseCurrent}
                className={`flex w-7 shrink-0 items-center justify-center border-l transition-colors disabled:opacity-50 ${
                  selected
                    ? "border-text-inverse/25 text-text-inverse/80 hover:bg-text-inverse/15 hover:text-text-inverse"
                    : "border-border-subtle text-text-tertiary hover:bg-bg-muted hover:text-text-primary"
                }`}
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          );
        }

        return (
          <button
            key={sprint.id}
            ref={bindSelectedRef(sprint.id)}
            type="button"
            role={multi ? "checkbox" : "tab"}
            aria-checked={multi ? selected : undefined}
            aria-selected={multi ? undefined : selected}
            aria-label={`${workSprintLabel(sprint)}${isCurrent ? " (current sprint)" : ""}`}
            title={`${workSprintLabel(sprint)} · ${status} · ${sprint.startsOn} → ${sprint.endsOn}`}
            onClick={() => selectSprint(sprint.id)}
            className={`${chipClass} flex flex-col items-start justify-center gap-0.5 px-2.5 py-1.5 text-left`}
          >
            {body}
          </button>
        );
      })}
      {onPlanNext ? (
        <button
          type="button"
          disabled={planNextDisabled}
          aria-label="Plan next sprint"
          title="Plan next sprint"
          onClick={onPlanNext}
          className={`${CHIP_SIZE} flex items-center justify-center rounded-md border-2 border-dashed border-border-default bg-bg-muted/30 text-text-secondary transition-colors hover:border-text-secondary hover:bg-bg-muted hover:text-text-primary disabled:opacity-50`}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
