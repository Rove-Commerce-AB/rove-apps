"use client";

import { InitialsAvatar } from "@/components/ui";
import type { WorkPerson } from "@/lib/workTypes";

export function WorkMentionSuggest({
  matches,
  activeIndex,
  onPick,
  placement = "above",
}: {
  matches: WorkPerson[];
  activeIndex: number;
  onPick: (person: WorkPerson) => void;
  placement?: "above" | "below";
}) {
  return (
    <div
      role="listbox"
      aria-label="Mention someone on this board"
      className={`absolute inset-x-0 z-20 max-h-48 overflow-y-auto rounded-lg border border-border-subtle bg-bg-default py-1 shadow-lg ${
        placement === "above" ? "bottom-full mb-1" : "top-full mt-1"
      }`}
    >
      {matches.length === 0 ? (
        <p className="px-2.5 py-1.5 text-body-m text-text-tertiary">
          No matching people
        </p>
      ) : (
        matches.map((person, index) => (
          <button
            key={person.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-body-m ${
              index === activeIndex
                ? "bg-accent-primary-subtle text-text-primary"
                : "text-text-primary hover:bg-bg-muted"
            }`}
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(person);
            }}
          >
            <InitialsAvatar
              name={person.name}
              initials={person.initials}
              size="xxs"
            />
            <span className="min-w-0 truncate">{person.name}</span>
          </button>
        ))
      )}
    </div>
  );
}

export function mentionListKeyDown(
  event: {
    key: string;
    preventDefault: () => void;
  },
  opts: {
    open: boolean;
    matches: WorkPerson[];
    activeIndex: number;
    setActiveIndex: (updater: (index: number) => number) => void;
    onPick: (person: WorkPerson) => void;
    onClose: () => void;
  }
): boolean {
  if (!opts.open) return false;
  if (opts.matches.length > 0) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      opts.setActiveIndex((index) => (index + 1) % opts.matches.length);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      opts.setActiveIndex(
        (index) => (index - 1 + opts.matches.length) % opts.matches.length
      );
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const person = opts.matches[opts.activeIndex];
      if (person) {
        event.preventDefault();
        opts.onPick(person);
        return true;
      }
    }
  }
  if (event.key === "Escape") {
    event.preventDefault();
    opts.onClose();
    return true;
  }
  return false;
}
