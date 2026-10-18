"use client";

import type { Dispatch, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { IconButton, Panel, PanelSectionTitle } from "@/components/ui";
import { CustomerProjectGroup } from "@/components/CustomerProjectGroup";
import { groupCustomerProjectsForList } from "@/lib/customerProjectsList";
import type { CustomerWithDetails } from "@/types";

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
      <div className="space-y-4 overflow-x-auto px-3 pb-3 pt-0">
        {projects.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-tertiary">
            No projects for this customer.
          </p>
        ) : (
          <>
            <CustomerProjectGroup
              title="Confirmed"
              projects={confirmed}
              tone="confirmed"
              rowBleed="panel"
              onOpen={openProject}
            />
            <CustomerProjectGroup
              title="Pipeline"
              projects={pipeline}
              tone="pipeline"
              rowBleed="panel"
              onOpen={openProject}
            />
            {showInactiveProjects ? (
              <CustomerProjectGroup
                title="Inactive"
                projects={inactive}
                tone="inactive"
                rowBleed="panel"
                onOpen={openProject}
              />
            ) : null}
            {inactive.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowInactiveProjects((show) => !show)}
                className="rounded-md px-1.5 py-1 text-label-s font-medium text-text-tertiary hover:bg-text-primary/[0.06] hover:text-text-secondary"
                aria-expanded={showInactiveProjects}
              >
                {showInactiveProjects
                  ? "Hide inactive"
                  : `Show inactive (${inactive.length})`}
              </button>
            ) : null}
          </>
        )}
      </div>
    </Panel>
  );
}
