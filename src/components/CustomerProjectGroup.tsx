"use client";

import { Briefcase } from "lucide-react";
import {
  DrawerListGroupHeader,
  drawerListRowClass,
  type DrawerListBleed,
} from "@/components/ui";
import { effectiveProjectProbability } from "@/lib/customerProjectsList";
import type { CustomerProjectSummary } from "@/types";

const toneDotClass = {
  confirmed: "bg-status-success",
  pipeline: "bg-status-warning",
  inactive: "bg-border-strong",
} as const;

export type CustomerProjectGroupTone = keyof typeof toneDotClass;

/**
 * Grouped project list for customer drawer / detail.
 * Group headers are meta chrome (not list rows); rows carry a status dot + title.
 */
export function CustomerProjectGroup({
  title,
  projects,
  tone = "confirmed",
  onOpen,
  rowBleed = "drawer",
}: {
  title: string;
  projects: CustomerProjectSummary[];
  tone?: CustomerProjectGroupTone;
  onOpen: (id: string) => void;
  rowBleed?: DrawerListBleed;
}) {
  if (projects.length === 0) return null;

  return (
    <section className="space-y-1">
      <DrawerListGroupHeader
        title={title}
        count={projects.length}
        bleed={rowBleed}
      />
      <ul className="divide-y divide-border-subtle">
        {projects.map((project) => {
          const probability = effectiveProjectProbability(project.probability);
          return (
            <li
              key={project.id}
              className={`${drawerListRowClass(rowBleed)} ${
                tone === "inactive" ? "opacity-65" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => onOpen(project.id)}
                className="absolute inset-0"
                aria-label={project.name}
              />
              <span
                className={`pointer-events-none h-1.5 w-1.5 shrink-0 rounded-full ${toneDotClass[tone]}`}
                aria-hidden
              />
              <span className="pointer-events-none min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                {project.name}
              </span>
              <span className="pointer-events-none relative z-10 inline-flex shrink-0 items-center gap-2">
                {probability !== 100 ? (
                  <span className="rounded-md bg-bg-muted px-1.5 py-0.5 text-label-s tabular-nums text-text-secondary">
                    {probability}%
                  </span>
                ) : null}
                {project.hasWorkProject ? (
                  <span title="Work" className="text-text-secondary">
                    <Briefcase className="h-4 w-4" aria-hidden />
                    <span className="sr-only">Work</span>
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
