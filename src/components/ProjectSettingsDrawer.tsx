"use client";

import { SideDrawer } from "@/components/ui";
import { ProjectSettingsPanel } from "@/components/ProjectSettingsPanel";
import type { ProjectWithDetails } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectWithDetails;
  isAdmin?: boolean;
};

/**
 * Project master data as a SideDrawer — same panel as nested under Customer.
 * Opened from planning via “Edit in Settings”, not as app-local settings.
 */
export function ProjectSettingsDrawer({
  open,
  onOpenChange,
  project,
  isAdmin = false,
}: Props) {
  return (
    <SideDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={project.name}
      subtitle={project.customerName}
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
    >
      <ProjectSettingsPanel
        key={project.id}
        project={project}
        isAdmin={isAdmin}
        hidePlanningLink
      />
    </SideDrawer>
  );
}
