import type {
  ProbabilityDisplay,
  ProjectVisibility,
} from "@/lib/allocationPageView";

export type AllocationFilterParams = {
  team?: string | null;
  role?: string | null;
  prob?: ProbabilityDisplay | null;
  projects?: ProjectVisibility | null;
  unbooked?: boolean | null;
};

export type AllocationWeekParams = {
  year: number;
  from: number;
  to: number;
};

const PROJECT_VISIBILITY = new Set<ProjectVisibility>([
  "all",
  "hideNon100",
  "hide100",
  "availability",
]);

/** Merge week range + filter/view params into a query string (omits defaults). */
export function buildAllocationSearch(
  week: AllocationWeekParams,
  filters: AllocationFilterParams = {},
  existing?: URLSearchParams | string | null
): string {
  const base =
    existing instanceof URLSearchParams
      ? new URLSearchParams(existing.toString())
      : new URLSearchParams(existing ?? "");

  base.set("year", String(week.year));
  base.set("from", String(week.from));
  base.set("to", String(week.to));

  applyAllocationFilters(base, filters);
  return base.toString();
}

export function applyAllocationFilters(
  params: URLSearchParams,
  filters: AllocationFilterParams
): void {
  if (filters.team !== undefined) {
    if (filters.team) params.set("team", filters.team);
    else params.delete("team");
  }
  if (filters.role !== undefined) {
    if (filters.role) params.set("role", filters.role);
    else params.delete("role");
  }
  if (filters.prob !== undefined) {
    if (filters.prob && filters.prob !== "weighted") {
      params.set("prob", filters.prob);
    } else {
      params.delete("prob");
    }
  }
  if (filters.projects !== undefined) {
    if (filters.projects && filters.projects !== "all") {
      params.set("projects", filters.projects);
    } else {
      params.delete("projects");
    }
  }
  if (filters.unbooked !== undefined) {
    if (filters.unbooked) params.set("unbooked", "1");
    else params.delete("unbooked");
  }
}

export function readAllocationFilters(
  searchParams: URLSearchParams | { get(name: string): string | null }
): {
  team: string | null;
  role: string | null;
  prob: ProbabilityDisplay;
  projects: ProjectVisibility;
  unbooked: boolean;
} {
  const team = searchParams.get("team") || null;
  const role = searchParams.get("role") || null;
  const probRaw = searchParams.get("prob");
  const prob: ProbabilityDisplay = probRaw === "none" ? "none" : "weighted";
  const projectsRaw = searchParams.get("projects");
  const projects: ProjectVisibility = PROJECT_VISIBILITY.has(
    projectsRaw as ProjectVisibility
  )
    ? (projectsRaw as ProjectVisibility)
    : "all";
  const unbooked = searchParams.get("unbooked") === "1";
  return { team, role, prob, projects, unbooked };
}

export type AllocationFiltersState = ReturnType<typeof readAllocationFilters>;

/** Read filters from a Next.js page `searchParams` plain object. */
export function readAllocationFiltersFromRecord(
  params: Record<string, string | string[] | undefined>
): AllocationFiltersState {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value !== "") sp.set(key, value);
  }
  return readAllocationFilters(sp);
}

export function allocationFiltersKey(filters: AllocationFiltersState): string {
  return [
    filters.team ?? "",
    filters.role ?? "",
    filters.prob,
    filters.projects,
    filters.unbooked ? "1" : "0",
  ].join("|");
}

/** Preserve non-week query params when only the week range changes. */
export function allocationHrefWithWeek(
  pathname: string,
  week: AllocationWeekParams,
  existingSearch?: string | URLSearchParams | null
): string {
  const q = buildAllocationSearch(week, {}, existingSearch);
  return `${pathname}?${q}`;
}
