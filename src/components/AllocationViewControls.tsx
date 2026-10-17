"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Eye, ListFilter } from "lucide-react";
import type {
  ProbabilityDisplay,
  ProjectVisibility,
} from "@/lib/allocationPageView";

type Menu = {
  kind: "filter" | "view";
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

type NamedOption = { id: string; name: string };

type Props = {
  teams: NamedOption[];
  roles: NamedOption[];
  teamFilterId: string | null;
  onTeamFilterChange: (id: string | null) => void;
  roleFilterId: string | null;
  onRoleFilterChange: (id: string | null) => void;
  showUnbookedToggle?: boolean;
  showProjectsWithoutBooking?: boolean;
  onShowProjectsWithoutBookingChange?: (value: boolean) => void;
  /** When false, only the Filter control is shown (e.g. embed planning). */
  showView?: boolean;
  probabilityDisplay?: ProbabilityDisplay;
  onProbabilityDisplayChange?: (value: ProbabilityDisplay) => void;
  projectVisibility?: ProjectVisibility;
  onProjectVisibilityChange?: (value: ProjectVisibility) => void;
};

export function AllocationViewControls({
  teams,
  roles,
  teamFilterId,
  onTeamFilterChange,
  roleFilterId,
  onRoleFilterChange,
  showUnbookedToggle = false,
  showProjectsWithoutBooking = false,
  onShowProjectsWithoutBookingChange,
  showView = true,
  probabilityDisplay = "weighted",
  onProbabilityDisplayChange,
  projectVisibility = "all",
  onProjectVisibilityChange,
}: Props) {
  const [menu, setMenu] = useState<Menu | null>(null);

  const filterActive =
    teamFilterId != null ||
    roleFilterId != null ||
    (showUnbookedToggle && showProjectsWithoutBooking);

  const viewActive =
    showView &&
    (probabilityDisplay !== "weighted" || projectVisibility !== "all");

  const filterLabel = filterSummary(
    teams,
    roles,
    teamFilterId,
    roleFilterId,
    showUnbookedToggle && showProjectsWithoutBooking
  );

  const viewLabel = viewSummary(probabilityDisplay, projectVisibility);

  function openMenu(kind: Menu["kind"], event: React.MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({
      kind,
      top: rect.bottom + 4,
      left: menuLeft(rect),
    });
  }

  useEffect(() => {
    if (!menu) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-allocation-view-menu]")) return;
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

  const hasFilterOptions =
    teams.length > 0 || roles.length > 0 || showUnbookedToggle;
  if (!hasFilterOptions && !showView) return null;

  return (
    <>
      {hasFilterOptions ? (
        <button
          type="button"
          data-allocation-view-menu
          aria-label="Filter allocations"
          aria-expanded={menu?.kind === "filter"}
          aria-haspopup="menu"
          className={triggerClass(filterActive)}
          onClick={(event) => openMenu("filter", event)}
        >
          <ListFilter className="h-3.5 w-3.5" aria-hidden />
          <span className="max-w-28 truncate">{filterLabel}</span>
        </button>
      ) : null}
      {showView ? (
        <button
          type="button"
          data-allocation-view-menu
          aria-label="View options"
          aria-expanded={menu?.kind === "view"}
          aria-haspopup="menu"
          className={triggerClass(viewActive)}
          onClick={(event) => openMenu("view", event)}
        >
          <Eye className="h-3.5 w-3.5" aria-hidden />
          <span className="max-w-36 truncate">{viewLabel}</span>
        </button>
      ) : null}
      {menu
        ? createPortal(
            <div
              data-allocation-view-menu
              role="menu"
              className="fixed z-50 max-h-[min(70vh,28rem)] min-w-56 overflow-y-auto rounded-lg border border-border-subtle bg-bg-default py-1 shadow-lg"
              style={{ top: menu.top, left: menu.left, width: MENU_WIDTH }}
            >
              {menu.kind === "filter" ? (
                <>
                  {teams.length > 0 ? (
                    <>
                      <p className="px-3 py-1.5 text-label-s text-text-tertiary">
                        Team
                      </p>
                      <MenuRow
                        selected={teamFilterId == null}
                        onSelect={() => {
                          onTeamFilterChange(null);
                        }}
                      >
                        <span className="min-w-0 truncate">All teams</span>
                      </MenuRow>
                      {teams.map((team) => (
                        <MenuRow
                          key={team.id}
                          selected={teamFilterId === team.id}
                          onSelect={() => onTeamFilterChange(team.id)}
                        >
                          <span className="min-w-0 truncate">{team.name}</span>
                        </MenuRow>
                      ))}
                    </>
                  ) : null}
                  {roles.length > 0 ? (
                    <>
                      <p
                        className={`px-3 py-1.5 text-label-s text-text-tertiary ${
                          teams.length > 0
                            ? "mt-1 border-t border-border-subtle"
                            : ""
                        }`}
                      >
                        Role
                      </p>
                      <MenuRow
                        selected={roleFilterId == null}
                        onSelect={() => onRoleFilterChange(null)}
                      >
                        <span className="min-w-0 truncate">All roles</span>
                      </MenuRow>
                      {roles.map((role) => (
                        <MenuRow
                          key={role.id}
                          selected={roleFilterId === role.id}
                          onSelect={() => onRoleFilterChange(role.id)}
                        >
                          <span className="min-w-0 truncate">{role.name}</span>
                        </MenuRow>
                      ))}
                    </>
                  ) : null}
                  {showUnbookedToggle && onShowProjectsWithoutBookingChange ? (
                    <>
                      <p className="mt-1 border-t border-border-subtle px-3 py-1.5 text-label-s text-text-tertiary">
                        Projects
                      </p>
                      <MenuRow
                        selected={showProjectsWithoutBooking}
                        onSelect={() =>
                          onShowProjectsWithoutBookingChange(
                            !showProjectsWithoutBooking
                          )
                        }
                      >
                        <span className="min-w-0 truncate">
                          Without booking
                        </span>
                      </MenuRow>
                    </>
                  ) : null}
                  {filterActive ? (
                    <button
                      type="button"
                      className="mt-1 flex w-full border-t border-border-subtle px-3 py-1.5 text-left text-body-m text-text-secondary hover:bg-bg-muted hover:text-text-primary"
                      onClick={() => {
                        onTeamFilterChange(null);
                        onRoleFilterChange(null);
                        onShowProjectsWithoutBookingChange?.(false);
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
                    Probability
                  </p>
                  <MenuRow
                    selected={probabilityDisplay === "weighted"}
                    onSelect={() => {
                      onProbabilityDisplayChange?.("weighted");
                      setMenu(null);
                    }}
                  >
                    With probability
                  </MenuRow>
                  <MenuRow
                    selected={probabilityDisplay === "none"}
                    onSelect={() => {
                      onProbabilityDisplayChange?.("none");
                      setMenu(null);
                    }}
                  >
                    Without probability
                  </MenuRow>
                  <p className="mt-1 border-t border-border-subtle px-3 py-1.5 text-label-s text-text-tertiary">
                    Projects
                  </p>
                  <MenuRow
                    selected={projectVisibility === "all"}
                    onSelect={() => {
                      onProjectVisibilityChange?.("all");
                      setMenu(null);
                    }}
                  >
                    All projects
                  </MenuRow>
                  <MenuRow
                    selected={projectVisibility === "hideNon100"}
                    onSelect={() => {
                      onProjectVisibilityChange?.("hideNon100");
                      setMenu(null);
                    }}
                  >
                    Only show 100%
                  </MenuRow>
                  <MenuRow
                    selected={projectVisibility === "hide100"}
                    onSelect={() => {
                      onProjectVisibilityChange?.("hide100");
                      setMenu(null);
                    }}
                  >
                    Only show planned
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
  teams: NamedOption[],
  roles: NamedOption[],
  teamFilterId: string | null,
  roleFilterId: string | null,
  unbooked: boolean
) {
  const parts: string[] = [];
  if (teamFilterId) {
    parts.push(teams.find((t) => t.id === teamFilterId)?.name ?? "Team");
  }
  if (roleFilterId) {
    parts.push(roles.find((r) => r.id === roleFilterId)?.name ?? "Role");
  }
  if (unbooked) parts.push("Unbooked");
  if (parts.length === 0) return "Filter";
  if (parts.length === 1) return parts[0]!;
  return `Filter · ${parts.length}`;
}

function viewSummary(
  probabilityDisplay: ProbabilityDisplay,
  projectVisibility: ProjectVisibility
) {
  if (probabilityDisplay === "weighted" && projectVisibility === "all") {
    return "View";
  }
  const parts: string[] = [];
  if (probabilityDisplay === "none") parts.push("No probability");
  if (projectVisibility === "hideNon100") parts.push("100%");
  if (projectVisibility === "hide100") parts.push("Planned");
  if (parts.length === 1) return parts[0]!;
  return `View · ${parts.length}`;
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
