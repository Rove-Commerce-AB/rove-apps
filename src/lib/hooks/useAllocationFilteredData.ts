import { useMemo } from "react";
import type { AllocationPageData } from "@/lib/allocationPageTypes";
import { matchesIdListFilter } from "@/lib/idListFilter";

export function useAllocationFilteredData(
  data: AllocationPageData | null,
  teamFilterIds: readonly string[],
  defaultRoleFilterIds: readonly string[]
): AllocationPageData | null {
  return useMemo(() => {
    if (data === null) return null;
    return {
      consultants: data.consultants.filter((c) => {
        if (!matchesIdListFilter(teamFilterIds, c.teamId)) return false;
        if (!matchesIdListFilter(defaultRoleFilterIds, c.defaultRoleId))
          return false;
        return true;
      }),
      projects: data.projects ?? [],
      customers: data.customers ?? [],
      roles: data.roles ?? [],
      teams: data.teams ?? [],
      allocations: data.allocations ?? [],
      year: data.year,
      weekFrom: data.weekFrom,
      weekTo: data.weekTo,
      weeks: data.weeks ?? [],
    };
  }, [data, teamFilterIds, defaultRoleFilterIds]);
}
