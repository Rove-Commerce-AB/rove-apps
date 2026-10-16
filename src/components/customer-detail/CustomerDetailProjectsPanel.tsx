"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { IconButton, Panel, PanelSectionTitle } from "@/components/ui";
import {
  effectiveProjectProbability,
  groupCustomerProjectsForList,
} from "@/lib/customerProjectsList";
import type { CustomerProjectSummary, CustomerWithDetails } from "@/types";

function ProjectRow({
  project,
  onOpen,
  dimmed = false,
  emphasizeConfirmed = false,
}: {
  project: CustomerProjectSummary;
  onOpen: (id: string) => void;
  dimmed?: boolean;
  emphasizeConfirmed?: boolean;
}) {
  const pct = effectiveProjectProbability(project.probability);

  return (
    <li
      className={`flex h-[2.25rem] cursor-pointer items-center gap-3 rounded-md px-2 transition-colors hover:bg-bg-muted/50 ${dimmed ? "opacity-60" : ""}`}
      onClick={() => onOpen(project.id)}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
        {project.name}
      </span>
      <span
        className={`shrink-0 tabular-nums text-xs font-medium ${
          emphasizeConfirmed ? "text-success" : "text-text-muted"
        }`}
      >
        {pct}%
      </span>
    </li>
  );
}

function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <li className="px-2 pb-1 pt-2 first:pt-0">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        {children}
      </span>
    </li>
  );
}

export function CustomerDetailProjectsPanel({
  projects,
  showInactiveProjects,
  setShowInactiveProjects,
  onAddProject,
}: {
  projects: CustomerWithDetails["projects"];
  showInactiveProjects: boolean;
  setShowInactiveProjects: Dispatch<SetStateAction<boolean>>;
  onAddProject: () => void;
}) {
  const router = useRouter();
  const { confirmed, pipeline, inactive } = groupCustomerProjectsForList(projects);
  const openProject = (id: string) => router.push(`/projects/${id}`);

  return (
    <Panel>
      <PanelSectionTitle
        action={
          <IconButton
            aria-label="Add project"
            onClick={onAddProject}
            className="text-text-muted hover:text-text-primary"
          >
            <Plus className="h-4 w-4" />
          </IconButton>
        }
      >
        PROJECTS
      </PanelSectionTitle>
      <div className="overflow-x-auto p-3 pt-0">
        {projects.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-primary opacity-60">
            No projects for this customer.
          </p>
        ) : (
          <>
            <ul className="space-y-0.5">
              {confirmed.length > 0 && (
                <>
                  <GroupHeading>Confirmed</GroupHeading>
                  {confirmed.map((p) => (
                    <ProjectRow
                      key={p.id}
                      project={p}
                      onOpen={openProject}
                      emphasizeConfirmed
                    />
                  ))}
                </>
              )}
              {pipeline.length > 0 && (
                <>
                  <GroupHeading>Pipeline</GroupHeading>
                  {pipeline.map((p) => (
                    <ProjectRow key={p.id} project={p} onOpen={openProject} />
                  ))}
                </>
              )}
              {showInactiveProjects &&
                inactive.map((p) => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    onOpen={openProject}
                    dimmed
                  />
                ))}
            </ul>
            {!showInactiveProjects && inactive.length > 0 && (
              <button
                type="button"
                onClick={() => setShowInactiveProjects(true)}
                className="mt-2 w-full rounded-md py-2 text-center text-sm font-medium text-text-primary opacity-70 transition-colors hover:bg-bg-muted/50 hover:opacity-100"
                aria-label="Show inactive projects"
              >
                Show inactive ({inactive.length})
              </button>
            )}
            {showInactiveProjects && inactive.length > 0 && (
              <button
                type="button"
                onClick={() => setShowInactiveProjects(false)}
                className="mt-2 w-full rounded-md py-2 text-center text-sm font-medium text-text-primary opacity-70 transition-colors hover:bg-bg-muted/50 hover:opacity-100"
                aria-label="Hide inactive projects"
              >
                Hide inactive
              </button>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
