"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ListFilter } from "lucide-react";
import { toggleIdInList } from "@/lib/idListFilter";

export type ListFilterSection = {
  id: string;
  label: string;
  allLabel: string;
  options: { id: string; name: string }[];
  /** Empty = all. */
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

type Menu = { top: number; left: number };

const MENU_WIDTH = 224;

function menuLeft(rect: DOMRect) {
  return Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8);
}

function triggerClass(active: boolean) {
  return `inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] transition-colors ${
    active
      ? "bg-accent-primary-subtle text-accent-primary-text"
      : "text-text-secondary hover:bg-bg-muted hover:text-text-primary"
  }`;
}

type Props = {
  sections: ListFilterSection[];
  ariaLabel?: string;
  className?: string;
};

export function ListFilterMenu({
  sections,
  ariaLabel = "Filter",
  className = "",
}: Props) {
  const [menu, setMenu] = useState<Menu | null>(null);

  const visibleSections = sections.filter((section) => section.options.length > 0);
  const filterActive = visibleSections.some(
    (section) => section.selectedIds.length > 0
  );

  const filterLabel = summarize(visibleSections);

  useEffect(() => {
    if (!menu) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-list-filter-menu]")) return;
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

  if (visibleSections.length === 0) return null;

  function openMenu(event: React.MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({
      top: rect.bottom + 4,
      left: menuLeft(rect),
    });
  }

  return (
    <div className={className.trim() || undefined}>
      <button
        type="button"
        data-list-filter-menu
        aria-label={ariaLabel}
        aria-expanded={menu != null}
        aria-haspopup="menu"
        className={triggerClass(filterActive)}
        onClick={openMenu}
      >
        <ListFilter className="h-3.5 w-3.5" aria-hidden />
        <span className="max-w-28 truncate">{filterLabel}</span>
      </button>
      {menu
        ? createPortal(
            <div
              data-list-filter-menu
              role="menu"
              className="fixed z-50 max-h-[min(70vh,28rem)] min-w-56 overflow-y-auto rounded-lg border border-border-subtle bg-bg-default py-1 shadow-lg"
              style={{ top: menu.top, left: menu.left, width: MENU_WIDTH }}
            >
              {visibleSections.map((section, index) => (
                <div key={section.id}>
                  <p
                    className={`px-3 py-1.5 text-label-s text-text-tertiary ${
                      index > 0 ? "mt-1 border-t border-border-subtle" : ""
                    }`}
                  >
                    {section.label}
                  </p>
                  <MenuRow
                    selected={section.selectedIds.length === 0}
                    onSelect={() => section.onChange([])}
                  >
                    <span className="min-w-0 truncate">{section.allLabel}</span>
                  </MenuRow>
                  {section.options.map((option) => (
                    <MenuRow
                      key={option.id}
                      selected={section.selectedIds.includes(option.id)}
                      onSelect={() =>
                        section.onChange(
                          toggleIdInList(section.selectedIds, option.id)
                        )
                      }
                    >
                      <span className="min-w-0 truncate">{option.name}</span>
                    </MenuRow>
                  ))}
                </div>
              ))}
              {filterActive ? (
                <button
                  type="button"
                  className="mt-1 flex w-full border-t border-border-subtle px-3 py-1.5 text-left text-body-m text-text-secondary hover:bg-bg-muted hover:text-text-primary"
                  onClick={() => {
                    for (const section of visibleSections) {
                      section.onChange([]);
                    }
                    setMenu(null);
                  }}
                >
                  Clear filter
                </button>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function summarize(sections: ListFilterSection[]) {
  const parts: string[] = [];
  for (const section of sections) {
    if (section.selectedIds.length === 1) {
      parts.push(
        section.options.find((o) => o.id === section.selectedIds[0])?.name ??
          section.label
      );
    } else if (section.selectedIds.length > 1) {
      parts.push(`${section.selectedIds.length} ${section.label.toLowerCase()}`);
    }
  }
  if (parts.length === 0) return "Filter";
  if (parts.length === 1) return parts[0]!;
  return `Filter · ${parts.length}`;
}

function MenuRow({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={selected}
      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-body-m text-text-primary hover:bg-bg-muted"
      onClick={onSelect}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      <Check
        className={`h-3.5 w-3.5 shrink-0 ${
          selected ? "text-text-primary" : "text-transparent"
        }`}
        aria-hidden
      />
    </button>
  );
}
