"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, ListFilter } from "lucide-react";
import {
  buildPathWithCustomerFilter,
  CUSTOMER_FILTER_QUERY_KEY,
  persistCustomerFilterCookie,
  shouldHideCustomerFilter,
  type CustomerFilterOption,
} from "@/lib/customerFilter";
import { toggleIdInList } from "@/lib/idListFilter";

type Props = {
  customers: CustomerFilterOption[];
  /** Selected customer ids. Empty = All. */
  value: string[];
  basePath: string;
  cookieName: string;
  /** Hide the control when the actor only has one customer (customer users). */
  hideWhenSingle?: boolean;
  allLabel?: string;
  queryKey?: string;
  className?: string;
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

export function CustomerFilter({
  customers,
  value,
  basePath,
  cookieName,
  hideWhenSingle = false,
  allLabel = "All customers",
  queryKey = CUSTOMER_FILTER_QUERY_KEY,
  className = "",
}: Props) {
  const router = useRouter();
  const [menu, setMenu] = useState<Menu | null>(null);

  // Keep cookie in sync with the resolved selection (incl. deep links with ?customer=).
  useEffect(() => {
    persistCustomerFilterCookie(cookieName, value);
  }, [cookieName, value]);

  useEffect(() => {
    if (!menu) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-customer-filter-menu]")) return;
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

  if (shouldHideCustomerFilter(customers.length, hideWhenSingle)) {
    return null;
  }

  if (customers.length === 0) return null;

  const filterActive = value.length > 0;
  const filterLabel =
    value.length === 0
      ? "Filter"
      : value.length === 1
        ? (customers.find((customer) => customer.id === value[0])?.name ??
          "Filter")
        : `${value.length} customers`;

  function applySelection(next: string[]) {
    persistCustomerFilterCookie(cookieName, next);
    router.replace(buildPathWithCustomerFilter(basePath, next, queryKey));
  }

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
        data-customer-filter-menu
        aria-label="Filter by customer"
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
              data-customer-filter-menu
              role="menu"
              aria-label="Customer filter"
              className="fixed z-50 max-h-72 overflow-y-auto rounded-lg border border-border-subtle bg-bg-default py-1 shadow-lg"
              style={{
                top: menu.top,
                left: menu.left,
                width: MENU_WIDTH,
              }}
            >
              <p className="px-3 py-1.5 text-label-s text-text-tertiary">
                Customer
              </p>
              <MenuRow
                selected={value.length === 0}
                onSelect={() => {
                  applySelection([]);
                  setMenu(null);
                }}
              >
                <span className="min-w-0 truncate">{allLabel}</span>
              </MenuRow>
              {customers.map((customer) => (
                <MenuRow
                  key={customer.id}
                  selected={value.includes(customer.id)}
                  onSelect={() =>
                    applySelection(toggleIdInList(value, customer.id))
                  }
                >
                  <span className="min-w-0 truncate">{customer.name}</span>
                </MenuRow>
              ))}
              {filterActive ? (
                <button
                  type="button"
                  className="mt-1 flex w-full border-t border-border-subtle px-3 py-1.5 text-left text-body-m text-text-secondary hover:bg-bg-muted hover:text-text-primary"
                  onClick={() => {
                    applySelection([]);
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
