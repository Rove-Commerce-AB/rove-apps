"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { AddConsultantModal } from "./AddConsultantModal";
import { ConsultantDetailClient } from "./ConsultantDetailClient";
import { ListFilterMenu } from "@/components/ListFilterMenu";
import {
  ListSearchInput,
  ListTableToolbar,
} from "@/components/ListTableToolbar";
import {
  Button,
  CapacityBar,
  DataTable,
  EmptyState,
  InitialsAvatar,
  PageHeader,
  SideDrawer,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type DataTableColumn,
} from "@/components/ui";
import type { ConsultantListItem } from "@/lib/consultants";
import { ROUTES, consultantHref } from "@/lib/routes";

type Props = {
  consultants: ConsultantListItem[];
  error: string | null;
  isAdmin?: boolean;
};

const EXTERNAL_TEAM_FILTER = "__external__";
type SortKey = "name" | "team" | "role" | "capacity" | "overhead";
type SortDirection = "asc" | "desc";

function formatTeamName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "—";
  return trimmed.replace(/^Team\s+/i, "");
}

function formatConsultantSince(iso: string | null): string {
  if (!iso) return "Consultant since —";
  const parts = iso.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2] || 1;
  if (!year || !month) return "Consultant since —";
  const date = new Date(year, month - 1, day);
  const label = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `Consultant since ${label}`;
}

export function ConsultantsPageClient({
  consultants,
  error,
  isAdmin = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const routeId = useMemo(() => {
    const prefix = `${ROUTES.consultants}/`;
    if (!pathname.startsWith(prefix)) return null;
    const rest = pathname.slice(prefix.length);
    if (!rest || rest.includes("/")) return null;
    return rest;
  }, [pathname]);

  const [openId, setOpenId] = useState<string | null>(routeId);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [teamFilterIds, setTeamFilterIds] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    setOpenId(routeId);
  }, [routeId]);

  const activeConsultants = useMemo(
    () => consultants.filter((c) => c.isActive),
    [consultants]
  );

  const teamFilters = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const c of activeConsultants) {
      if (!c.team_id || !c.teamName) continue;
      const existing = map.get(c.team_id);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(c.team_id, { id: c.team_id, name: formatTeamName(c.teamName), count: 1 });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [activeConsultants]);

  const visibleConsultants = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = activeConsultants.filter((c) => {
      if (teamFilterIds.length > 0) {
        const matchTeam =
          Boolean(c.team_id) && teamFilterIds.includes(c.team_id!);
        const matchExternal =
          teamFilterIds.includes(EXTERNAL_TEAM_FILTER) && c.isExternal;
        if (!matchTeam && !matchExternal) return false;
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.teamName ?? "").toLowerCase().includes(q) ||
        c.roleName.toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1;
      switch (sortKey) {
        case "team":
          return (
            dir * formatTeamName(a.teamName).localeCompare(formatTeamName(b.teamName)) ||
            a.name.localeCompare(b.name)
          );
        case "role":
          return dir * a.roleName.localeCompare(b.roleName) || a.name.localeCompare(b.name);
        case "capacity":
          return dir * (a.workPercentage - b.workPercentage) || a.name.localeCompare(b.name);
        case "overhead":
          return (
            dir * (a.overheadPercentage - b.overheadPercentage) || a.name.localeCompare(b.name)
          );
        default:
          return dir * a.name.localeCompare(b.name);
      }
    });
  }, [activeConsultants, search, teamFilterIds, sortKey, sortDirection]);

  const selectedConsultant =
    openId == null ? null : consultants.find((c) => c.id === openId) ?? null;

  const columns: DataTableColumn<ConsultantListItem>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      cell: (c) => (
        <span className="flex min-w-0 items-center gap-3">
          <InitialsAvatar name={c.name} initials={c.initials} size="sm" />
          <span className="truncate">{c.name}</span>
        </span>
      ),
    },
    {
      id: "team",
      header: "Team",
      sortable: true,
      secondary: true,
      cell: (c) => formatTeamName(c.teamName),
    },
    {
      id: "role",
      header: "Role",
      sortable: true,
      secondary: true,
      cell: (c) => c.roleName,
    },
    {
      id: "capacity",
      header: "Capacity",
      sortable: true,
      cell: (c) => <CapacityBar value={c.workPercentage} />,
    },
    {
      id: "overhead",
      header: "Overhead",
      sortable: true,
      cell: (c) => <CapacityBar value={c.overheadPercentage} />,
    },
  ];

  function handleSort(columnId: string) {
    const key = columnId as SortKey;
    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  }

  const teamFilterOptions = useMemo(
    () => [
      ...teamFilters.map((team) => ({
        id: team.id,
        name: team.name,
      })),
      {
        id: EXTERNAL_TEAM_FILTER,
        name: "External resources",
      },
    ],
    [teamFilters]
  );

  function openConsultant(id: string) {
    setOpenId(id);
    router.push(consultantHref(id), { scroll: false });
  }

  function closeDrawer() {
    setOpenId(null);
    router.push(ROUTES.consultants, { scroll: false });
  }

  return (
    <>
      <AddConsultantModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => router.refresh()}
      />

      <div className="flex flex-col gap-8">
        <PageHeader
          title="Consultants"
          description="Manage your consultant team members and their assignments."
        >
          <Button
            type="button"
            variant="primary"
            onClick={() => setAddModalOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add consultant
          </Button>
        </PageHeader>

        {error && (
          <p className="text-sm text-danger" role="alert">
            Error: {error}
          </p>
        )}

        {!error && consultants.length === 0 && (
          <EmptyState
            title="No consultants yet"
            description="Add your first consultant to start planning allocations."
            actionLabel="Add consultant"
            onAction={() => setAddModalOpen(true)}
          />
        )}

        {!error && consultants.length > 0 && (
          <div>
            <ListTableToolbar
              leading={
                <ListSearchInput
                  placeholder="Search consultants…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search consultants"
                />
              }
              trailing={
                <ListFilterMenu
                  ariaLabel="Filter consultants"
                  sections={[
                    {
                      id: "team",
                      label: "Team",
                      allLabel: "All teams",
                      options: teamFilterOptions,
                      selectedIds: teamFilterIds,
                      onChange: setTeamFilterIds,
                    },
                  ]}
                />
              }
            />

            {visibleConsultants.length === 0 ? (
              <p className="px-1 py-6 text-sm text-text-secondary">
                No consultants match this filter.
              </p>
            ) : (
              <DataTable
                columns={columns}
                rows={visibleConsultants}
                getRowId={(c) => c.id}
                onRowClick={(c) => openConsultant(c.id)}
                selectedRowId={openId ?? undefined}
                sort={{
                  columnId: sortKey,
                  direction: sortDirection,
                  onSort: handleSort,
                }}
              />
            )}
          </div>
        )}
      </div>

      <SideDrawer
        open={openId != null}
        onOpenChange={(open) => {
          if (!open) closeDrawer();
        }}
        title={selectedConsultant?.name ?? "Consultant"}
        header={
          selectedConsultant != null ? (
            <div className="flex items-start gap-3">
              <InitialsAvatar
                name={selectedConsultant.name}
                initials={selectedConsultant.initials}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <p className="text-heading-l leading-tight text-text-primary">
                    {selectedConsultant.name}
                  </p>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-status-success-subtle px-2.5 py-0.5 text-[12px] font-medium text-status-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-status-success" aria-hidden />
                    {selectedConsultant.teamName
                      ? `${selectedConsultant.roleName} · ${selectedConsultant.teamName.replace(/^Team\s+/i, "")}`
                      : selectedConsultant.roleName}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-tertiary">
                  {formatConsultantSince(selectedConsultant.startDate)}
                </p>
              </div>
            </div>
          ) : undefined
        }
        bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      >
        {selectedConsultant != null ? (
          <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="shrink-0 border-border-default px-6 !gap-6">
              <TabsTrigger
                value="overview"
                className="px-1 !px-1 font-semibold data-[state=inactive]:font-medium"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger value="projects" className="px-1 !px-1">
                Projects
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value="overview"
              className="min-h-0 flex-1 flex-col overflow-y-auto pt-1 data-[state=active]:flex"
            >
              <ConsultantDetailClient
                key={selectedConsultant.id}
                consultant={selectedConsultant}
                isAdmin={isAdmin}
                embedded
              />
            </TabsContent>
            <TabsContent value="projects" className="flex-1 overflow-y-auto px-6 py-8">
              <p className="text-sm text-text-secondary">
                No project assignments yet.
              </p>
            </TabsContent>
          </Tabs>
        ) : openId != null ? (
          <p className="px-6 py-4 text-sm text-text-secondary">Consultant not found.</p>
        ) : null}
      </SideDrawer>
    </>
  );
}
