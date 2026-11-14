"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Group, ListFilter } from "lucide-react";

export type MyWorkRoleFilter = "either" | "owner" | "assignee";
export type MyWorkGroupBy = "project" | "status" | "sprint" | "none";

type Menu = {
  kind: "filter" | "group";
  top: number;
  left: number;
};

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

function roleLabel(role: MyWorkRoleFilter): string {
  if (role === "owner") return "Owner";
  if (role === "assignee") return "Assignee";
  return "All roles";
}

function groupByTriggerLabel(groupBy: MyWorkGroupBy): string {
  if (groupBy === "project") return "Project";
  if (groupBy === "status") return "Status";
  if (groupBy === "sprint") return "Sprint";
  return "Group";
}

function filterSummary(roleFilter: MyWorkRoleFilter, includeDone: boolean) {
  const parts: string[] = [];
  if (roleFilter !== "either") parts.push(roleLabel(roleFilter));
  if (includeDone) parts.push("Done");
  if (parts.length === 0) return "Filter";
  if (parts.length === 1) return parts[0]!;
  return parts.join(" · ");
}

function MenuRow({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
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

export function WorkMyWorkViewControls({
  roleFilter,
  onRoleFilterChange,
  includeDone,
  onIncludeDoneChange,
  groupBy,
  onGroupByChange,
}: {
  roleFilter: MyWorkRoleFilter;
  onRoleFilterChange: (value: MyWorkRoleFilter) => void;
  includeDone: boolean;
  onIncludeDoneChange: (value: boolean) => void;
  groupBy: MyWorkGroupBy;
  onGroupByChange: (value: MyWorkGroupBy) => void;
}) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const filterActive = roleFilter !== "either" || includeDone;
  const groupActive = groupBy !== "none";

  useEffect(() => {
    if (!menu) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-my-work-view-menu]")
      ) {
        return;
      }
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

  function openMenu(
    kind: Menu["kind"],
    event: React.MouseEvent<HTMLButtonElement>
  ) {
    if (menu?.kind === kind) {
      setMenu(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ kind, top: rect.bottom + 4, left: menuLeft(rect) });
  }

  return (
    <>
      <button
        type="button"
        data-my-work-view-menu
        aria-label="Filter issues"
        aria-expanded={menu?.kind === "filter"}
        aria-haspopup="menu"
        className={triggerClass(filterActive)}
        onClick={(event) => openMenu("filter", event)}
      >
        <ListFilter className="h-3.5 w-3.5" aria-hidden />
        <span className="max-w-28 truncate">
          {filterSummary(roleFilter, includeDone)}
        </span>
      </button>
      <button
        type="button"
        data-my-work-view-menu
        aria-label="Group issues"
        aria-expanded={menu?.kind === "group"}
        aria-haspopup="menu"
        className={triggerClass(groupActive)}
        onClick={(event) => openMenu("group", event)}
      >
        <Group className="h-3.5 w-3.5" aria-hidden />
        <span>{groupByTriggerLabel(groupBy)}</span>
      </button>
      {menu
        ? createPortal(
            <div
              data-my-work-view-menu
              role="menu"
              className="fixed z-50 max-h-[min(70vh,28rem)] min-w-56 overflow-y-auto rounded-lg border border-border-subtle bg-bg-default py-1 shadow-lg"
              style={{ top: menu.top, left: menu.left, width: MENU_WIDTH }}
            >
              {menu.kind === "filter" ? (
                <>
                  <p className="px-3 py-1.5 text-label-s text-text-tertiary">
                    Role
                  </p>
                  {(
                    [
                      ["either", "All roles"],
                      ["owner", "Owner"],
                      ["assignee", "Assignee"],
                    ] as const
                  ).map(([value, label]) => (
                    <MenuRow
                      key={value}
                      selected={roleFilter === value}
                      onSelect={() => {
                        onRoleFilterChange(value);
                        setMenu(null);
                      }}
                    >
                      <span className="min-w-0 truncate">{label}</span>
                    </MenuRow>
                  ))}
                  <p className="mt-1 border-t border-border-subtle px-3 py-1.5 text-label-s text-text-tertiary">
                    Status
                  </p>
                  <MenuRow
                    selected={includeDone}
                    onSelect={() => onIncludeDoneChange(!includeDone)}
                  >
                    <span className="min-w-0 truncate">Include done</span>
                  </MenuRow>
                  {filterActive ? (
                    <button
                      type="button"
                      className="mt-1 flex w-full border-t border-border-subtle px-3 py-1.5 text-left text-body-m text-text-secondary hover:bg-bg-muted hover:text-text-primary"
                      onClick={() => {
                        onRoleFilterChange("either");
                        onIncludeDoneChange(false);
                        setMenu(null);
                      }}
                    >
                      Clear filter
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="px-3 py-1.5 text-label-s text-text-tertiary">
                    Group by
                  </p>
                  <MenuRow
                    selected={groupBy === "none"}
                    onSelect={() => {
                      onGroupByChange("none");
                      setMenu(null);
                    }}
                  >
                    No grouping
                  </MenuRow>
                  <MenuRow
                    selected={groupBy === "project"}
                    onSelect={() => {
                      onGroupByChange("project");
                      setMenu(null);
                    }}
                  >
                    Project
                  </MenuRow>
                  <MenuRow
                    selected={groupBy === "status"}
                    onSelect={() => {
                      onGroupByChange("status");
                      setMenu(null);
                    }}
                  >
                    Status
                  </MenuRow>
                  <MenuRow
                    selected={groupBy === "sprint"}
                    onSelect={() => {
                      onGroupByChange("sprint");
                      setMenu(null);
                    }}
                  >
                    Sprint
                  </MenuRow>
                </>
              )}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
