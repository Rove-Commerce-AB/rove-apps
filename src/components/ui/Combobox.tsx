"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

/** Splits label by query (case-insensitive) and returns React nodes with matches wrapped in <strong>. */
function renderLabelWithHighlight(label: string, query: string): React.ReactNode {
  const q = query.trim().toLowerCase();
  if (!q) return label;
  const lower = label.toLowerCase();
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let pos = 0;
  let keyIndex = 0;
  while ((pos = lower.indexOf(q, lastIndex)) !== -1) {
    if (lastIndex < pos) {
      parts.push(<span key={`${keyIndex++}`}>{label.slice(lastIndex, pos)}</span>);
    }
    parts.push(<strong key={`${keyIndex++}`}>{label.slice(pos, pos + q.length)}</strong>);
    lastIndex = pos + q.length;
  }
  if (lastIndex < label.length) {
    parts.push(<span key={`${keyIndex++}`}>{label.slice(lastIndex)}</span>);
  }
  return parts.length > 0 ? parts : label;
}

export type ComboboxOption = {
  value: string;
  label: string;
};

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  /** Filter variant to match Select filter style */
  variant?: "default" | "filter";
  className?: string;
  inputClassName?: string;
  /** Placeholder when options list is empty (e.g. "No Jira/DevOps") */
  emptyOptionsPlaceholder?: string;
  /** When false, render dropdown list inline (use inside Dialog so clicks on list are not "outside") */
  renderListInPortal?: boolean;
  /** Focus input automatically when combobox mounts. */
  autoFocus?: boolean;
};

export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = "Type to search...",
  disabled = false,
  size = "md",
  variant = "default",
  className = "",
  inputClassName = "",
  emptyOptionsPlaceholder,
  renderListInPortal = true,
  autoFocus = false,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [listStyle, setListStyle] = useState<{
    top: number;
    left: number;
    minWidth: number;
    isInline?: boolean;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const highlightedRef = useRef<HTMLLIElement | null>(null);

  const selectedOption = options.find((o) => o.value === value);
  const displayWhenClosed = selectedOption ? selectedOption.label : "";

  useEffect(() => {
    if (!isOpen && value) {
      setInputValue(selectedOption ? selectedOption.label : "");
    }
    if (value === "") {
      setInputValue("");
    }
  }, [value, isOpen, selectedOption?.label]);

  const query = inputValue.trim().toLowerCase();
  const filtered =
    query === ""
      ? options
      : options.filter((o) =>
          o.label.toLowerCase().includes(query)
        );

  const listContent = options.length === 0 ? [] : filtered;
  const showList = isOpen && !disabled;
  const listRef = useRef<HTMLUListElement>(null);
  const [listScrollable, setListScrollable] = useState(false);

  const recomputeListScrollable = useCallback(() => {
    const el = listRef.current;
    if (!el || !showList) {
      setListScrollable(false);
      return;
    }
    setListScrollable(el.scrollHeight > el.clientHeight + 1);
  }, [showList]);

  const clampHighlight = (i: number) => Math.max(0, Math.min(i, listContent.length - 1));

  useEffect(() => {
    setHighlightedIndex((i) => clampHighlight(i));
  }, [listContent.length]);

  useEffect(() => {
    highlightedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightedIndex]);

  useLayoutEffect(() => {
    if (!showList) {
      setListScrollable(false);
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => recomputeListScrollable());
    });
  }, [showList, listStyle, listContent.length, recomputeListScrollable]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !showList) return;
    const ro = new ResizeObserver(() => recomputeListScrollable());
    ro.observe(el);
    return () => ro.disconnect();
  }, [showList, recomputeListScrollable]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      const t = e.target;
      const el =
        t instanceof Element
          ? t
          : (t as { parentElement?: Element | null } | null)?.parentElement ?? null;
      if (el?.closest?.("[data-combobox-list]")) return;
      setIsOpen(false);
      setInputValue(displayWhenClosed);
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen, displayWhenClosed]);

  const isFilter = variant === "filter";
  const inputSize = isFilter ? "py-1.5 px-3 text-xs" : size === "sm" ? "py-1.5 px-3 text-sm" : "py-2 px-3 text-sm";
  const inputShape = isFilter
    ? "rounded-lg border border-[var(--color-border-subtle)] bg-bg-default text-[var(--color-text-primary)] placeholder:opacity-70 focus:border-[var(--color-border-default)] focus:ring-1 focus:ring-inset focus:ring-[var(--color-border-default)] focus:outline-none"
    : "rounded-lg border border-form bg-bg-default text-text-primary placeholder-text-muted focus:border-[var(--color-border-default)] focus:ring-1 focus:ring-inset focus:ring-[var(--color-border-default)] focus:outline-none";
  const listBorderClass = isFilter
    ? "border-[var(--color-border-subtle)]"
    : "border-form";

  const handleFocus = () => {
    if (disabled) return;
    setIsOpen(true);
    setInputValue(selectedOption ? selectedOption.label : inputValue || "");
    const idx = listContent.findIndex((o) => o.value === value);
    setHighlightedIndex(idx >= 0 ? idx : 0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setIsOpen(true);
  };

  const handleSelect = (opt: ComboboxOption) => {
    onValueChange(opt.value);
    setInputValue(opt.label || "");
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      setInputValue(displayWhenClosed);
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => clampHighlight(i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => clampHighlight(i - 1));
      return;
    }
    if (e.key === "Enter" && listContent.length > 0) {
      e.preventDefault();
      const opt = listContent[highlightedIndex];
      if (opt && opt.value !== "") {
        handleSelect(opt);
      }
      return;
    }
  };

  const updateListPosition = () => {
    const input = inputRef.current;
    const container = containerRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    if (!renderListInPortal && container) {
      const cr = container.getBoundingClientRect();
      setListStyle({
        top: rect.bottom - cr.top,
        left: rect.left - cr.left,
        minWidth: rect.width,
        isInline: true,
      });
    } else {
      setListStyle({
        top: rect.bottom,
        left: rect.left,
        minWidth: rect.width,
      });
    }
  };

  useEffect(() => {
    if (!showList) {
      setListStyle(null);
      return;
    }
    updateListPosition();
    const onScrollOrResize = () => updateListPosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    const input = inputRef.current;
    let scrollParent: Element | null = null;
    if (input) {
      let el: HTMLElement | null = input.parentElement;
      while (el) {
        const { overflowX, overflowY, overflow } = getComputedStyle(el);
        if (/(auto|scroll|overlay)/.test(overflow + overflowX + overflowY)) {
          scrollParent = el;
          break;
        }
        el = el.parentElement;
      }
      if (scrollParent) {
        scrollParent.addEventListener("scroll", onScrollOrResize);
      }
    }
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      scrollParent?.removeEventListener("scroll", onScrollOrResize);
    };
  }, [showList, renderListInPortal]);

  const listElement = showList && listStyle && (
    <ul
      ref={listRef}
      id="combobox-list"
      role="listbox"
      data-combobox-list
      className={`ds-dropdown-content ds-dropdown-joined relative min-h-0 overflow-x-hidden rounded-b-xl ds-dropdown-list-scroll max-h-60 rounded-t-none border border-t-0 bg-bg-default px-1 pb-1 pt-2 shadow-none z-[9999] ${listScrollable ? "ds-dropdown-list-scroll--scrollable" : ""} ${listBorderClass}`}
      style={{
        position: listStyle.isInline ? "absolute" : "fixed",
        top: listStyle.top,
        left: listStyle.left,
        width: listStyle.minWidth,
      }}
    >
      {listContent.length === 0 ? (
        <li className="px-3 py-2 text-sm text-text-muted">
          {options.length === 0
            ? emptyOptionsPlaceholder ?? "No options"
            : "No matches"}
        </li>
      ) : (
        listContent.map((opt, idx) => (
          <li
            key={opt.value === "" ? "__empty__" : opt.value}
            ref={idx === highlightedIndex ? (el) => { highlightedRef.current = el; } : undefined}
            id={listContent.length ? `combobox-option-${idx}` : undefined}
            role="option"
            aria-selected={idx === highlightedIndex}
            onClick={() => handleSelect(opt)}
            className={`rounded-lg px-3 ${isFilter ? "py-1.5 text-xs" : "py-2 text-sm"} outline-none ${
              opt.value === ""
                ? "cursor-default text-text-muted"
                : "cursor-pointer text-text-primary hover:bg-brand-blue/20"
            } ${opt.value === value ? "bg-brand-blue/30 font-medium" : ""} ${idx === highlightedIndex ? "bg-brand-blue/20" : ""}`}
          >
            {renderLabelWithHighlight(opt.label, query)}
          </li>
        ))
      )}
    </ul>
  );

  const dropdownList =
    renderListInPortal && listElement && typeof document !== "undefined"
      ? createPortal(listElement, document.body)
      : listElement;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? inputValue : displayWhenClosed}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={showList}
          aria-autocomplete="list"
          aria-controls={showList ? "combobox-list" : undefined}
          aria-activedescendant={showList && listContent.length > 0 ? `combobox-option-${highlightedIndex}` : undefined}
          className={`w-full pr-8 ${showList ? "rounded-b-none" : ""} ${inputSize} ${inputShape} disabled:cursor-not-allowed disabled:opacity-50 ${inputClassName}`}
        />
        <span
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted"
          aria-hidden
        >
          <ChevronDown className={`${isFilter ? "h-3.5 w-3.5" : "h-4 w-4"} transition-transform ${showList ? "rotate-180" : ""}`} />
        </span>
      </div>
      {dropdownList}
    </div>
  );
}
