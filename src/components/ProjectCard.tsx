import Link from "next/link";
import { Building2, Calendar, Users } from "lucide-react";
import type { ProjectWithDetails } from "@/types";
import { DEFAULT_CUSTOMER_COLOR } from "@/lib/constants";
import { Badge } from "@/components/ui";
import { projectHref } from "@/lib/routes";

type Props = {
  project: ProjectWithDetails;
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ProjectCard({ project }: Props) {
  const dateRange =
    project.startDate || project.endDate
      ? `${formatDate(project.startDate)} – ${formatDate(project.endDate)}`
      : "—";
  const color = project.color || DEFAULT_CUSTOMER_COLOR;
  const isInactive = !project.isActive;

  return (
    <Link
      href={projectHref(project.id)}
      prefetch={false}
      className={`flex overflow-hidden rounded-lg border border-form bg-bg-default shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-signal focus:ring-offset-2 ${
        isInactive ? "opacity-60 grayscale" : ""
      }`}
    >
      <div
        className="w-1 flex-shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-heading-m text-text-primary">{project.name}</h3>
            {isInactive && (
              <Badge variant="inactive" className="mt-1 px-2 py-0.5">
                Inactive
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-text-primary opacity-80">
            <Building2 className="h-4 w-4 flex-shrink-0 opacity-60" />
            <span>{project.customerName}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-text-primary opacity-80">
            <Calendar className="h-4 w-4 flex-shrink-0 opacity-60" />
            <span>{dateRange}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-text-primary opacity-80">
            <Users className="h-4 w-4 flex-shrink-0 opacity-60" />
            <span>
              {project.consultantCount} consultant
              {project.consultantCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-form pt-4">
          <div>
            <p className="text-xs text-text-primary opacity-60">
              Total allocated
            </p>
            <p className="font-semibold text-text-primary">
              {project.totalHoursAllocated}h
            </p>
          </div>
          {project.consultantInitials.length > 0 && (
            <div className="flex -space-x-2">
              {project.consultantInitials.map((initials, i) => (
                <div
                  key={i}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-bg-default bg-bg-muted text-xs font-medium text-text-primary"
                  title={initials}
                >
                  {initials}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
