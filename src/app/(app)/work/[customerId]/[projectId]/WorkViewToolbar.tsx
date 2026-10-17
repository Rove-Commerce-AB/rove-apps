"use client";

import type { ReactNode } from "react";
import type {
  WorkBoardGroupBy,
  WorkBoardPriorityFilterId,
} from "@/lib/workBoardView";
import type {
  WorkComponent,
  WorkIssueType,
  WorkPerson,
  WorkSprint,
} from "@/lib/workTypes";
import { WorkBoardViewControls } from "./WorkBoardViewControls";
import { WorkSprintPicker } from "./WorkSprintPicker";

/**
 * Shared chrome for Work Planning + Timeline: sprint chips and optional filters/actions.
 */
export function WorkViewToolbar({
  sprints,
  selectedSprintIds,
  onSelectedSprintIdsChange,
  sprintPickerMulti = false,
  emptySprints = null,
  actions = null,
  filters = null,
  onPlanNext,
  planNextDisabled = false,
  onCloseCurrent,
  closeCurrentDisabled = false,
}: {
  sprints: WorkSprint[];
  selectedSprintIds: readonly string[];
  onSelectedSprintIdsChange: (ids: string[]) => void;
  sprintPickerMulti?: boolean;
  emptySprints?: ReactNode;
  /** Capacity, start sprint, etc. (Planning). */
  actions?: ReactNode;
  /** Shared filters (Timeline). Omit when filters live per list (Planning). */
  filters?: {
    people: WorkPerson[];
    components: WorkComponent[];
    ownerFilterIds: string[];
    onOwnerFilterChange: (ids: string[]) => void;
    typeFilterIds: WorkIssueType[];
    onTypeFilterChange: (ids: WorkIssueType[]) => void;
    componentFilterIds: string[];
    onComponentFilterChange: (ids: string[]) => void;
    priorityFilterIds: WorkBoardPriorityFilterId[];
    onPriorityFilterChange: (ids: WorkBoardPriorityFilterId[]) => void;
    groupBy: WorkBoardGroupBy;
    onGroupByChange: (value: WorkBoardGroupBy) => void;
  } | null;
  onPlanNext?: () => void;
  planNextDisabled?: boolean;
  onCloseCurrent?: () => void;
  closeCurrentDisabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        {sprints.length > 0 ? (
          <WorkSprintPicker
            sprints={sprints}
            selectedIds={selectedSprintIds}
            onChange={onSelectedSprintIdsChange}
            multi={sprintPickerMulti}
            onPlanNext={onPlanNext}
            planNextDisabled={planNextDisabled}
            onCloseCurrent={onCloseCurrent}
            closeCurrentDisabled={closeCurrentDisabled}
          />
        ) : (
          emptySprints
        )}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {actions}
        {filters ? (
          <WorkBoardViewControls
            people={filters.people}
            components={filters.components}
            ownerFilterIds={filters.ownerFilterIds}
            onOwnerFilterChange={filters.onOwnerFilterChange}
            typeFilterIds={filters.typeFilterIds}
            onTypeFilterChange={filters.onTypeFilterChange}
            componentFilterIds={filters.componentFilterIds}
            onComponentFilterChange={filters.onComponentFilterChange}
            priorityFilterIds={filters.priorityFilterIds}
            onPriorityFilterChange={filters.onPriorityFilterChange}
            groupBy={filters.groupBy}
            onGroupByChange={filters.onGroupByChange}
          />
        ) : null}
      </div>
    </div>
  );
}
