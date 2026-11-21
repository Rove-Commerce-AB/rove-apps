"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, ListFilter } from "lucide-react";
import { toggleIdInList } from "@/lib/idListFilter";

export type ListFilterOption = {
  id: string;
  name: string;
  /** Optional second line (e.g. SNI description). */
  description?: string;
};

export type ListFilterSection = {
  id: string;
  label: string;
  allLabel: string;
  options: ListFilterOption[];
  /** Empty = all. */
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Show a search field for this section's options. */
  searchable?: boolean;
};

type Menu = { top: number; left: number };

const MENU_WIDTH_COMPACT = 224;
const MENU_WIDTH_WIDE = 340;

function sectionNeedsWide(section: ListFilterSection) {
  return (
    Boolean(section.searchable) ||
    section.options.some((option) => Boolean(option.description))
  );
}

function menuWidthFor(activeSection: ListFilterSection | null) {
  if (activeSection && sectionNeedsWide(activeSection)) return MENU_WIDTH_WIDE;
  return MENU_WIDTH_COMPACT;
}

function clampMenuLeft(left: number, width: number) {
  return Math.min(left, window.innerWidth - width - 8);
}

function menuLeft(rect: DOMRect, width: number) {
  return Math.min(rect.right - width, window.innerWidth - width - 8);
}

function triggerClass(active: boolean) {
  return `inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] transition-colors ${
    active
      ? "bg-accent-primary-subtle text-accent-primary-text"
      : "text-text-secondary hover:bg-bg-muted hover:text-text-primary"
  }`;
}

function optionMatches(option: ListFilterOption, needle: string) {
  if (!needle) return true;
  const haystack = `${option.id} ${option.name} ${option.description ?? ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return haystack.includes(needle);
}

function sectionSummary(section: ListFilterSection): string {
  if (section.selectedIds.length === 0) return "All";
  if (section.selectedIds.length === 1) {
    const option = section.options.find((o) => o.id === section.selectedIds[0]);
    return option?.name ?? "1 selected";
  }
  return `${section.selectedIds.length} selected`;
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
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const visibleSections = sections.filter(
    (section) => section.options.length > 0
  );
  const activeSection =
    visibleSections.find((section) => section.id === activeSectionId) ?? null;
  const width = menuWidthFor(activeSection);
  const filterActive = visibleSections.some(
    (section) => section.selectedIds.length > 0
  );
  const filterLabel = summarize(visibleSections);

  const filteredOptions = useMemo(() => {
    if (!activeSection) return [];
    const needle = query
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    if (!activeSection.searchable || !needle) return activeSection.options;
    return activeSection.options.filter((option) =>
      optionMatches(option, needle)
    );
  }, [activeSection, query]);

  function closeMenu() {
    setMenu(null);
    setActiveSectionId(null);
    setQuery("");
  }

  useEffect(() => {
    if (!menu) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-list-filter-menu]")) return;
      closeMenu();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (activeSectionId) {
        setActiveSectionId(null);
        setQuery("");
        return;
      }
      closeMenu();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // closeMenu is stable enough via setters; activeSectionId needed for Escape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, activeSectionId]);

  if (visibleSections.length === 0) return null;

  function openMenu(event: React.MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setActiveSectionId(null);
    setQuery("");
    const openWidth = menuWidthFor(null);
    setMenu({
      top: rect.bottom + 4,
      left: menuLeft(rect, openWidth),
    });
  }

  function openSection(section: ListFilterSection) {
    const nextWidth = menuWidthFor(section);
    setActiveSectionId(section.id);
    setQuery("");
    setMenu((prev) =>
      prev ? { ...prev, left: clampMenuLeft(prev.left, nextWidth) } : prev
    );
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
              style={{ top: menu.top, left: menu.left, width }}
            >
              {activeSection ? (
                <>
                  <button
                    type="button"
                    className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-body-m text-text-secondary hover:bg-bg-muted hover:text-text-primary"
                    onClick={() => {
                      setActiveSectionId(null);
                      setQuery("");
                    }}
                  >
                    <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 truncate font-medium text-text-primary">
                      {activeSection.label}
                    </span>
                  </button>
                  {activeSection.searchable ? (
                    <div className="px-2.5 pb-1.5">
                      <input
                        type="search"
                        value={query}
                        placeholder={`Search ${activeSection.label}…`}
                        aria-label={`Search ${activeSection.label}`}
                        autoFocus
                        className="h-8 w-full rounded-md border border-border-subtle bg-bg-default px-2 text-[13px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-border-strong"
                        onChange={(event) => setQuery(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      />
                    </div>
                  ) : null}
                  <MenuRow
                    selected={activeSection.selectedIds.length === 0}
                    onSelect={() => activeSection.onChange([])}
                  >
                    <span className="min-w-0 truncate">
                      {activeSection.allLabel}
                    </span>
                  </MenuRow>
                  {filteredOptions.map((option) => (
                    <MenuRow
                      key={option.id}
                      selected={activeSection.selectedIds.includes(option.id)}
                      onSelect={() =>
                        activeSection.onChange(
                          toggleIdInList(activeSection.selectedIds, option.id)
                        )
                      }
                    >
                      {option.description ? (
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="tabular-nums text-text-primary">
                            {option.name}
                          </span>
                          <span className="line-clamp-2 text-[12px] leading-snug text-text-tertiary">
                            {option.description}
                          </span>
                        </span>
                      ) : (
                        <span className="min-w-0 truncate">{option.name}</span>
                      )}
                    </MenuRow>
                  ))}
                  {activeSection.searchable &&
                  query.trim() &&
                  filteredOptions.length === 0 ? (
                    <p className="px-3 py-2 text-[12px] text-text-tertiary">
                      No matches
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  {visibleSections.map((section) => {
                    const selected = section.selectedIds.length > 0;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-body-m text-text-primary hover:bg-bg-muted"
                        onClick={() => openSection(section)}
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate">{section.label}</span>
                          <span
                            className={`truncate text-[12px] ${
                              selected
                                ? "text-accent-primary-text"
                                : "text-text-tertiary"
                            }`}
                          >
                            {sectionSummary(section)}
                          </span>
                        </span>
                        <ChevronRight
                          className="h-3.5 w-3.5 shrink-0 text-text-tertiary"
                          aria-hidden
                        />
                      </button>
                    );
                  })}
                  {filterActive ? (
                    <button
                      type="button"
                      className="mt-1 flex w-full border-t border-border-subtle px-3 py-1.5 text-left text-body-m text-text-secondary hover:bg-bg-muted hover:text-text-primary"
                      onClick={() => {
                        for (const section of visibleSections) {
                          section.onChange([]);
                        }
                        closeMenu();
                      }}
                    >
                      Clear filter
                    </button>
                  ) : null}
                </>
              )}
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
      const option = section.options.find(
        (o) => o.id === section.selectedIds[0]
      );
      parts.push(option?.name ?? section.label);
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
      className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-body-m text-text-primary hover:bg-bg-muted"
      onClick={onSelect}
    >
      <span className="flex min-w-0 flex-1 items-start gap-2">{children}</span>
      <Check
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
          selected ? "text-text-primary" : "text-transparent"
        }`}
        aria-hidden
      />
    </button>
  );
}
