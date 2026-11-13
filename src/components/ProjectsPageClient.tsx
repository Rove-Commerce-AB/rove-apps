"use client";

import dynamic from "next/dynamic";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { revalidateProjects } from "@/app/(app)/projects/actions";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { ProjectsPageHeader } from "./ProjectsPageHeader";
import {
  ListSearchInput,
  ListTableToolbar,
} from "@/components/ListTableToolbar";
import { EmptyState, Panel, Badge } from "@/components/ui";
import type { ProjectWithDetails } from "@/types";
import { DEFAULT_CUSTOMER_COLOR } from "@/lib/constants";

type SortKey = "name" | "customer" | "status" | "dates" | "consultants" | "hours";
type SortDir = "asc" | "desc";

const tableBorder = "border-panel";

const AddProjectModal = dynamic(() =>
  import("./AddProjectModal").then((mod) => mod.AddProjectModal)
);

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type Props = {
  projects: ProjectWithDetails[];
  error: string | null;
};

export function ProjectsPageClient({ projects, error }: Props) {
  const router = useRouter();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ChevronsUpDown className="ml-1 inline h-3.5 w-3.5 opacity-50" />;
    return sortDir === "asc" ? (
      <ChevronUp className="ml-1 inline h-3.5 w-3.5" />
    ) : (
      <ChevronDown className="ml-1 inline h-3.5 w-3.5" />
    );
  };

  const filteredProjects = useMemo(() => {
    let result = projects;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.customerName.toLowerCase().includes(q)
      );
    }
    return result;
  }, [projects, search]);

  const visibleProjects = useMemo(
    () =>
      showInactive
        ? filteredProjects
        : filteredProjects.filter((p) => p.isActive),
    [filteredProjects, showInactive]
  );

  const sortedProjects = useMemo(() => {
    const sorted = [...visibleProjects].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "customer":
          cmp = a.customerName.localeCompare(b.customerName);
          break;
        case "status":
          cmp = (a.isActive ? 1 : 0) - (b.isActive ? 1 : 0);
          break;
        case "dates":
          cmp =
            new Date(a.startDate ?? 0).getTime() -
            new Date(b.startDate ?? 0).getTime();
          break;
        case "consultants":
          cmp = a.consultantCount - b.consultantCount;
          break;
        case "hours":
          cmp = a.totalHoursAllocated - b.totalHoursAllocated;
          break;
        default:
          cmp = a.name.localeCompare(b.name);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [visibleProjects, sortKey, sortDir]);

  const handleSuccess = async () => {
    await revalidateProjects();
    router.refresh();
  };

  return (
    <>
      <ProjectsPageHeader
        count={projects.length}
        onAdd={() => setAddModalOpen(true)}
      />

      <AddProjectModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={handleSuccess}
      />

      {error && (
        <p className="mt-6 text-sm text-danger">Error: {error}</p>
      )}


      {!error && projects.length === 0 && (
        <EmptyState
          title="No projects yet"
          description="Add your first project to start allocating consultants and tracking hours."
          actionLabel="Add project"
          onAction={() => setAddModalOpen(true)}
        />
      )}

      {!error && projects.length > 0 && (
        <div className="mt-6">
          <ListTableToolbar
            leading={
              <ListSearchInput
                placeholder="Search projects…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search projects"
              />
            }
          />

          {filteredProjects.length === 0 ? (
            <div
              className="rounded-panel border p-12 text-center text-sm text-text-primary opacity-70"
              style={{ backgroundColor: "var(--panel-bg)", borderColor: "var(--panel-border)" }}
            >
              No projects match &quot;{search}&quot;
            </div>
          ) : (
            <Panel>
              <h2
                className="ds-shadow-sm bg-bg-muted/40 px-4 py-3 text-heading-m text-text-primary"
              >
                Projects
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className={`border-b ${tableBorder} bg-bg-muted/80`}>
                      <th className="px-4 py-3 text-left">
                        <button
                          type="button"
                          onClick={() => toggleSort("name")}
                          className="flex items-center font-medium text-text-primary hover:opacity-80"
                        >
                          Project
                          <SortIcon column="name" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <button
                          type="button"
                          onClick={() => toggleSort("customer")}
                          className="flex items-center font-medium text-text-primary hover:opacity-80"
                        >
                          Customer
                          <SortIcon column="customer" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <button
                          type="button"
                          onClick={() => toggleSort("status")}
                          className="flex items-center font-medium text-text-primary hover:opacity-80"
                        >
                          Status
                          <SortIcon column="status" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <button
                          type="button"
                          onClick={() => toggleSort("dates")}
                          className="flex items-center font-medium text-text-primary hover:opacity-80"
                        >
                          Dates
                          <SortIcon column="dates" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <button
                          type="button"
                          onClick={() => toggleSort("consultants")}
                          className="flex items-center font-medium text-text-primary hover:opacity-80"
                        >
                          Consultants
                          <SortIcon column="consultants" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <button
                          type="button"
                          onClick={() => toggleSort("hours")}
                          className="flex items-center font-medium text-text-primary hover:opacity-80"
                        >
                          Allocated
                          <SortIcon column="hours" />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProjects.map((project) => {
                      const color = project.color || DEFAULT_CUSTOMER_COLOR;
                      const isInactive = !project.isActive;
                      const dateRange =
                        project.startDate || project.endDate
                          ? `${formatDate(project.startDate)} – ${formatDate(project.endDate)}`
                          : "—";
                      return (
                        <tr
                          key={project.id}
                          className={`cursor-pointer transition-colors hover:bg-bg-muted/50 ${isInactive ? "opacity-70" : ""}`}
                          onClick={() => router.push(`/projects/${project.id}`)}
                        >
                          <td className={`border-b ${tableBorder} px-4 py-3`}>
                            <div className="flex items-center gap-3">
                              <div
                                className="h-9 w-1 flex-shrink-0 rounded"
                                style={{ backgroundColor: color }}
                                aria-hidden
                              />
                              <div>
                                <span className="font-medium text-text-primary">
                                  {project.name}
                                </span>
                                {isInactive && (
                                  <Badge variant="inactive" className="ml-2 px-2 py-0.5">
                                    Inactive
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className={`border-b ${tableBorder} px-4 py-3 text-text-primary opacity-90`}>
                            {project.customerName}
                          </td>
                          <td className={`border-b ${tableBorder} px-4 py-3`}>
                            {project.isActive ? (
                              <Badge variant="active" className="px-2 py-0.5">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="inactive" className="px-2 py-0.5">
                                Inactive
                              </Badge>
                            )}
                          </td>
                          <td className={`border-b ${tableBorder} px-4 py-3 text-text-primary opacity-90`}>
                            {dateRange}
                          </td>
                          <td className={`border-b ${tableBorder} px-4 py-3 text-text-primary opacity-90`}>
                            {project.consultantCount} consultant
                            {project.consultantCount !== 1 ? "s" : ""}
                          </td>
                          <td className={`border-b ${tableBorder} px-4 py-3 font-medium tabular-nums text-text-primary opacity-90`}>
                            {project.totalHoursAllocated}h
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!showInactive && filteredProjects.some((p) => !p.isActive) && (
                <div className="border-t border-panel px-4 py-2">
                  <button
                    type="button"
                    onClick={() => setShowInactive(true)}
                    className="w-full rounded-md py-2 text-center text-sm font-medium text-text-primary opacity-70 transition-colors hover:bg-bg-muted/50 hover:opacity-100"
                    aria-label="Show inactive projects"
                  >
                    Show inactive ({filteredProjects.filter((p) => !p.isActive).length})
                  </button>
                </div>
              )}
              {showInactive && filteredProjects.some((p) => !p.isActive) && (
                <div className="border-t border-panel px-4 py-2">
                  <button
                    type="button"
                    onClick={() => setShowInactive(false)}
                    className="w-full rounded-md py-2 text-center text-sm font-medium text-text-primary opacity-70 transition-colors hover:bg-bg-muted/50 hover:opacity-100"
                    aria-label="Hide inactive projects"
                  >
                    Hide inactive
                  </button>
                </div>
              )}
            </Panel>
          )}
        </div>
      )}
    </>
  );
}
