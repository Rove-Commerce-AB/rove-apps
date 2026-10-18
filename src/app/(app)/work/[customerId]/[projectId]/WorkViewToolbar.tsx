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
  actions = null,
  filters = null,
  onPlanNext,
  planNextDisabled = false,
  onEditSprint,
  editSprintDisabled = false,
  onStartSprint,
  startSprintDisabled = false,
  onCloseCurrent,
  closeCurrentDisabled = false,
  onDeleteSprint,
  deleteSprintDisabled = false,
}: {
  sprints: WorkSprint[];
  selectedSprintIds: readonly string[];
  onSelectedSprintIdsChange: (ids: string[]) => void;
  sprintPickerMulti?: boolean;
  /** Capacity, etc. (Planning). */
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
  onEditSprint?: (sprintId: string) => void;
  editSprintDisabled?: boolean;
  onStartSprint?: (sprintId: string) => void;
  startSprintDisabled?: boolean;
  onCloseCurrent?: () => void;
  closeCurrentDisabled?: boolean;
  onDeleteSprint?: (sprintId: string) => void;
  deleteSprintDisabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        {sprints.length > 0 || onPlanNext ? (
          <WorkSprintPicker
            sprints={sprints}
            selectedIds={selectedSprintIds}
            onChange={onSelectedSprintIdsChange}
            multi={sprintPickerMulti}
            onPlanNext={onPlanNext}
            planNextDisabled={planNextDisabled}
            onEditSprint={onEditSprint}
            editSprintDisabled={editSprintDisabled}
            onStartSprint={onStartSprint}
            startSprintDisabled={startSprintDisabled}
            onCloseCurrent={onCloseCurrent}
            closeCurrentDisabled={closeCurrentDisabled}
            onDeleteSprint={onDeleteSprint}
            deleteSprintDisabled={deleteSprintDisabled}
          />
        ) : null}
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
