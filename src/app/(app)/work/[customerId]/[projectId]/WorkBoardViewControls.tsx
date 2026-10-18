"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Box, Check, Group, ListFilter, Rocket, User } from "lucide-react";
import { InitialsAvatar } from "@/components/ui";
import type { WorkComponent, WorkPreDeployAction } from "@/lib/workTypes";
import {
  NO_COMPONENT_ID,
  NO_PRIORITY_ID,
  UNASSIGNED_OWNER_ID,
  groupByTriggerLabel,
  workIssuePriorityLabel,
  workIssueTypeLabel,
  type WorkBoardGroupBy,
  type WorkBoardPriorityFilterId,
  type WorkColumnGroup,
} from "@/lib/workBoardView";
import { formatWorkHoursPair } from "@/lib/workTime";
import type {
  WorkIssueType,
  WorkLabel,
  WorkPerson,
} from "@/lib/workTypes";
import { WorkIssueTypeIcon, WorkIssueTypePicker } from "./WorkIssueTypeIcon";

const PRIORITY_FILTER_OPTIONS: WorkBoardPriorityFilterId[] = [
  "high",
  "medium",
  "low",
  NO_PRIORITY_ID,
];

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

export function WorkCardComponent({
  component,
}: {
  component: WorkComponent | null;
}) {
  if (!component) return null;
  return (
    <span
      className="mt-1.5 inline-flex max-w-full items-center gap-1 text-caption text-text-secondary"
      title={`Component: ${component.name}`}
    >
      <Box className="h-3 w-3 shrink-0 text-text-tertiary" aria-hidden />
      <span className="min-w-0 truncate">{component.name}</span>
    </span>
  );
}

export function WorkCardLabels({ labels }: { labels: WorkLabel[] }) {
  if (labels.length === 0) return null;
  return (
    <div className="mt-1.5 flex min-w-0 flex-wrap gap-1">
      {labels.map((label) => (
        <span
          key={label.id}
          className="inline-flex max-w-full truncate rounded-full border border-border-subtle bg-bg-muted px-1.5 py-0.5 text-caption text-text-secondary"
          title={`Label: ${label.name}`}
        >
          {label.name}
        </span>
      ))}
    </div>
  );
}

/** Discrete card hint when at least one pre-deploy action is still open. */
export function WorkCardPreDeployHint({
  actions,
  onOpen,
}: {
  actions: WorkPreDeployAction[];
  /** Opens the issue on the Pre-deploy tab. */
  onOpen?: () => void;
}) {
  if (!actions.some((action) => !action.isDone)) return null;
  if (!onOpen) {
    return (
      <span
        className="inline-flex shrink-0 text-text-tertiary"
        title="Open pre-deploy actions remaining"
        aria-label="Open pre-deploy actions remaining"
      >
        <Rocket className="h-3.5 w-3.5" aria-hidden />
      </span>
    );
  }
  return (
    <button
      type="button"
      className="inline-flex shrink-0 rounded-sm text-text-tertiary transition-colors hover:text-text-primary"
      title="Open pre-deploy actions"
      aria-label="Open pre-deploy actions"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpen();
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Rocket className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

export function WorkCardTypeBadge({
  issueType,
  disabled = false,
  onChange,
  /** Portals to document.body (cards). Set false inside dialogs/drawers so the menu stays in the layer. */
  portal = true,
}: {
  issueType: WorkIssueType;
  disabled?: boolean;
  onChange?: (issueType: WorkIssueType) => void;
  portal?: boolean;
}) {
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const interactive = onChange != null;
  const menuOpen = menu != null;

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-card-issue-type]")
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
  }, [menuOpen]);

  if (!interactive) {
    return <WorkIssueTypeIcon type={issueType} size="sm" />;
  }

  const menuNode = menuOpen ? (
    <div
      data-card-issue-type
      role="dialog"
      aria-label="Change issue type"
      className={
        portal
          ? "fixed z-[80] rounded-lg border border-border-subtle bg-bg-default p-1 shadow-lg"
          : "absolute left-0 top-full z-[80] mt-1 rounded-lg border border-border-subtle bg-bg-default p-1 shadow-lg"
      }
      style={
        portal && menu
          ? { top: menu.top, left: menu.left }
          : undefined
      }
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <WorkIssueTypePicker
        value={issueType}
        size="sm"
        disabled={disabled}
        onChange={(next) => {
          onChange(next);
          setMenu(null);
        }}
      />
    </div>
  ) : null;

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        data-card-issue-type
        disabled={disabled}
        aria-label={`Type: ${workIssueTypeLabel(issueType)}. Change type`}
        title={`Type: ${workIssueTypeLabel(issueType)}`}
        aria-expanded={menuOpen}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) return;
          if (menuOpen) {
            setMenu(null);
            return;
          }
          if (!portal) {
            setMenu({ top: 0, left: 0 });
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          const left = Math.max(
            8,
            Math.min(rect.left, window.innerWidth - 120)
          );
          const top = Math.min(rect.bottom + 4, window.innerHeight - 56);
          setMenu({ top: Math.max(8, top), left });
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        <WorkIssueTypeIcon type={issueType} size="sm" />
      </button>
      {menuNode
        ? portal && typeof document !== "undefined"
          ? createPortal(menuNode, document.body)
          : menuNode
        : null}
    </span>
  );
}

export function WorkColumnGroupHeader({
  groupBy,
  group,
  showTime = true,
  className = "",
  actions,
}: {
  groupBy: WorkBoardGroupBy;
  group: WorkColumnGroup;
  showTime?: boolean;
  className?: string;
  actions?: ReactNode;
}) {
  if (groupBy === "none") return null;
  const estimateSum = group.issues.reduce(
    (sum, issue) => sum + (issue.estimateHours ?? 0),
    0
  );
  const loggedSum = group.issues.reduce(
    (sum, issue) => sum + issue.loggedHours,
    0
  );
  const hasEstimate = group.issues.some(
    (issue) => issue.estimateHours != null
  );
  const timeLabel = showTime
    ? formatWorkHoursPair(loggedSum, hasEstimate ? estimateSum : null)
    : null;
  return (
    <div className={`flex min-w-0 items-center gap-1.5 px-0.5 ${className}`.trim()}>
      {groupBy === "owner" ? (
        group.owner ? (
          <InitialsAvatar
            name={group.owner.name}
            initials={group.owner.initials}
            size="xxs"
          />
        ) : (
          <span
            aria-hidden
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border-default text-text-tertiary"
          >
            <User className="h-3 w-3" />
          </span>
        )
      ) : null}
      <span className="min-w-0 truncate text-label-s text-text-secondary">
        {group.title}
      </span>
      <span
        className="shrink-0 tabular-nums text-body-xs text-text-tertiary"
        title={
          timeLabel
            ? `${group.issues.length} issues · Logged ${timeLabel}`
            : `${group.issues.length} issues`
        }
      >
        {group.issues.length}
        {timeLabel ? (
          <>
            <span className="text-text-muted"> · </span>
            {timeLabel}
          </>
        ) : null}
      </span>
      {actions ? (
        <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>
      ) : null}
    </div>
  );
}

export function WorkBoardViewControls({
  people,
  components,
  ownerFilterIds,
  onOwnerFilterChange,
  typeFilterIds,
  onTypeFilterChange,
  componentFilterIds,
  onComponentFilterChange,
  priorityFilterIds,
  onPriorityFilterChange,
  groupBy,
  onGroupByChange,
}: {
  people: WorkPerson[];
  components: WorkComponent[];
  ownerFilterIds: string[];
  onOwnerFilterChange: (ids: string[]) => void;
  typeFilterIds: WorkIssueType[];
  onTypeFilterChange: (ids: WorkIssueType[]) => void;
  componentFilterIds: string[];
  onComponentFilterChange: (ids: string[]) => void;
  priorityFilterIds: WorkBoardPriorityFilterId[];
  onPriorityFilterChange: (ids: WorkBoardPriorityFilterId[]) => void;
  groupBy: WorkBoardGroupBy;
  onGroupByChange: (value: WorkBoardGroupBy) => void;
}) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const filterActive =
    ownerFilterIds.length > 0 ||
    typeFilterIds.length > 0 ||
    componentFilterIds.length > 0 ||
    priorityFilterIds.length > 0;
  const groupActive = groupBy !== "none";
  const selectedOwners = new Set(ownerFilterIds);
  const selectedTypes = new Set(typeFilterIds);
  const selectedComponents = new Set(componentFilterIds);
  const selectedPriorities = new Set(priorityFilterIds);
  const filterLabel = filterSummary(
    people,
    components,
    ownerFilterIds,
    typeFilterIds,
    componentFilterIds,
    priorityFilterIds
  );

  useEffect(() => {
    if (!menu) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-board-view-menu]")
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

  function openMenu(kind: Menu["kind"], event: React.MouseEvent<HTMLButtonElement>) {
    if (menu?.kind === kind) {
      setMenu(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ kind, top: rect.bottom + 4, left: menuLeft(rect) });
  }

  function toggleOwner(id: string) {
    if (selectedOwners.has(id)) {
      onOwnerFilterChange(ownerFilterIds.filter((value) => value !== id));
      return;
    }
    onOwnerFilterChange([...ownerFilterIds, id]);
  }

  function toggleType(id: WorkIssueType) {
    if (selectedTypes.has(id)) {
      onTypeFilterChange(typeFilterIds.filter((value) => value !== id));
      return;
    }
    onTypeFilterChange([...typeFilterIds, id]);
  }

  function toggleComponent(id: string) {
    if (selectedComponents.has(id)) {
      onComponentFilterChange(
        componentFilterIds.filter((value) => value !== id)
      );
      return;
    }
    onComponentFilterChange([...componentFilterIds, id]);
  }

  function togglePriority(id: WorkBoardPriorityFilterId) {
    if (selectedPriorities.has(id)) {
      onPriorityFilterChange(
        priorityFilterIds.filter((value) => value !== id)
      );
      return;
    }
    onPriorityFilterChange([...priorityFilterIds, id]);
  }

  return (
    <>
      <button
        type="button"
        data-board-view-menu
        aria-label="Filter issues"
        aria-expanded={menu?.kind === "filter"}
        aria-haspopup="menu"
        className={triggerClass(filterActive)}
        onClick={(event) => openMenu("filter", event)}
      >
        <ListFilter className="h-3.5 w-3.5" aria-hidden />
        <span className="max-w-28 truncate">{filterLabel}</span>
      </button>
      <button
        type="button"
        data-board-view-menu
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
              data-board-view-menu
              role="menu"
              className="fixed z-50 max-h-[min(70vh,28rem)] min-w-56 overflow-y-auto rounded-lg border border-border-subtle bg-bg-default py-1 shadow-lg"
              style={{ top: menu.top, left: menu.left, width: MENU_WIDTH }}
            >
              {menu.kind === "filter" ? (
                <>
                  <p className="px-3 py-1.5 text-label-s text-text-tertiary">
                    Type
                  </p>
                  {(["issue", "bug"] as const).map((type) => (
                    <MenuRow
                      key={type}
                      selected={selectedTypes.has(type)}
                      onSelect={() => toggleType(type)}
                    >
                      <WorkIssueTypeIcon type={type} size="sm" />
                      <span className="min-w-0 truncate">
                        {workIssueTypeLabel(type)}
                      </span>
                    </MenuRow>
                  ))}
                  <p className="mt-1 border-t border-border-subtle px-3 py-1.5 text-label-s text-text-tertiary">
                    Priority
                  </p>
                  {PRIORITY_FILTER_OPTIONS.map((priority) => (
                    <MenuRow
                      key={priority}
                      selected={selectedPriorities.has(priority)}
                      onSelect={() => togglePriority(priority)}
                    >
                      <span className="min-w-0 truncate">
                        {priority === NO_PRIORITY_ID
                          ? workIssuePriorityLabel(null)
                          : workIssuePriorityLabel(priority)}
                      </span>
                    </MenuRow>
                  ))}
                  <p className="mt-1 border-t border-border-subtle px-3 py-1.5 text-label-s text-text-tertiary">
                    Component
                  </p>
                  <MenuRow
                    selected={selectedComponents.has(NO_COMPONENT_ID)}
                    onSelect={() => toggleComponent(NO_COMPONENT_ID)}
                  >
                    <span className="min-w-0 truncate">No component</span>
                  </MenuRow>
                  {components.map((component) => (
                    <MenuRow
                      key={component.id}
                      selected={selectedComponents.has(component.id)}
                      onSelect={() => toggleComponent(component.id)}
                    >
                      <span className="min-w-0 truncate">{component.name}</span>
                    </MenuRow>
                  ))}
                  <p className="mt-1 border-t border-border-subtle px-3 py-1.5 text-label-s text-text-tertiary">
                    Owner
                  </p>
                  <MenuRow
                    selected={selectedOwners.has(UNASSIGNED_OWNER_ID)}
                    onSelect={() => toggleOwner(UNASSIGNED_OWNER_ID)}
                  >
                    <span
                      aria-hidden
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border-default text-text-tertiary"
                    >
                      <User className="h-3 w-3" />
                    </span>
                    <span className="min-w-0 truncate">Unassigned</span>
                  </MenuRow>
                  {people.map((person) => (
                    <MenuRow
                      key={person.id}
                      selected={selectedOwners.has(person.id)}
                      onSelect={() => toggleOwner(person.id)}
                    >
                      <InitialsAvatar
                        name={person.name}
                        initials={person.initials}
                        size="xxs"
                      />
                      <span className="min-w-0 truncate">{person.name}</span>
                    </MenuRow>
                  ))}
                  {filterActive ? (
                    <button
                      type="button"
                      className="mt-1 flex w-full border-t border-border-subtle px-3 py-1.5 text-left text-body-m text-text-secondary hover:bg-bg-muted hover:text-text-primary"
                      onClick={() => {
                        onOwnerFilterChange([]);
                        onTypeFilterChange([]);
                        onComponentFilterChange([]);
                        onPriorityFilterChange([]);
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
                    selected={groupBy === "component"}
                    onSelect={() => {
                      onGroupByChange("component");
                      setMenu(null);
                    }}
                  >
                    Component
                  </MenuRow>
                  <MenuRow
                    selected={groupBy === "priority"}
                    onSelect={() => {
                      onGroupByChange("priority");
                      setMenu(null);
                    }}
                  >
                    Priority
                  </MenuRow>
                  <MenuRow
                    selected={groupBy === "owner"}
                    onSelect={() => {
                      onGroupByChange("owner");
                      setMenu(null);
                    }}
                  >
                    Owner
                  </MenuRow>
                  <MenuRow
                    selected={groupBy === "label"}
                    onSelect={() => {
                      onGroupByChange("label");
                      setMenu(null);
                    }}
                  >
                    Label
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

function filterSummary(
  people: WorkPerson[],
  components: WorkComponent[],
  ownerFilterIds: string[],
  typeFilterIds: WorkIssueType[],
  componentFilterIds: string[],
  priorityFilterIds: WorkBoardPriorityFilterId[]
) {
  const parts: string[] = [];
  if (typeFilterIds.length === 1) {
    parts.push(workIssueTypeLabel(typeFilterIds[0]!));
  } else if (typeFilterIds.length > 1) {
    parts.push(`${typeFilterIds.length} types`);
  }
  if (priorityFilterIds.length === 1) {
    const id = priorityFilterIds[0]!;
    parts.push(
      id === NO_PRIORITY_ID
        ? workIssuePriorityLabel(null)
        : workIssuePriorityLabel(id)
    );
  } else if (priorityFilterIds.length > 1) {
    parts.push(`${priorityFilterIds.length} priorities`);
  }
  if (componentFilterIds.length === 1) {
    const id = componentFilterIds[0]!;
    parts.push(
      id === NO_COMPONENT_ID
        ? "No component"
        : (components.find((row) => row.id === id)?.name ?? "Component")
    );
  } else if (componentFilterIds.length > 1) {
    parts.push(`${componentFilterIds.length} components`);
  }
  if (ownerFilterIds.length === 1) {
    const id = ownerFilterIds[0]!;
    parts.push(
      id === UNASSIGNED_OWNER_ID
        ? "Unassigned"
        : (people.find((person) => person.id === id)?.name ?? "Owner")
    );
  } else if (ownerFilterIds.length > 1) {
    parts.push(`${ownerFilterIds.length} owners`);
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
