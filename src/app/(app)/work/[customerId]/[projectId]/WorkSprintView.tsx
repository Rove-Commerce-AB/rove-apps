"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type DragEvent,
} from "react";
import { ArrowRight } from "lucide-react";
import { Button, ConfirmModal, IconButton } from "@/components/ui";
import {
  addWorkIssueAssigneeAction,
  closeWorkSprintAction,
  createWorkIssueAction,
  createWorkSprintAction,
  deleteWorkSprintAction,
  removeWorkIssueAssigneeAction,
  setWorkIssueSprintAction,
  startWorkSprintAction,
  updateWorkIssueEstimateAction,
  updateWorkIssueOwnerAction,
  updateWorkIssueTypeAction,
  updateWorkSprintAction,
} from "../../actions";
import {
  collectBoardComponents,
  collectOwnerFilterPeople,
  columnIssueGroups,
  issueMatchesBoardFilters,
  type WorkBoardGroupBy,
  type WorkBoardPriorityFilterId,
  type WorkColumnGroup,
} from "@/lib/workBoardView";
import type {
  WorkBoardView,
  WorkIssue,
  WorkIssueType,
  WorkPerson,
  WorkSprint,
} from "@/lib/workTypes";
import {
  WORK_SPRINT_TITLE_MAX_LENGTH,
  clampWorkSprintTitle,
  workSprintLabel,
} from "@/lib/workSprintLabel";
import { formatWorkEstimate } from "@/lib/workEstimate";
import { formatWorkHours } from "@/lib/workTime";
import {
  workStatusBorderColor,
  workStatusToneById,
} from "@/lib/workStatusColors";
import {
  startWorkCardDragGhost,
  waitForPaint,
  type WorkCardDragGhost,
} from "@/lib/workCardDragGhost";
import { WorkAddIssueInline } from "./WorkAddIssueInline";
import {
  WorkBoardViewControls,
  WorkCardPreDeployHint,
  WorkCardTypeBadge,
  WorkColumnGroupHeader,
} from "./WorkBoardViewControls";
import { WorkCardEstimate } from "./WorkCardEstimate";
import { WorkCardPeople } from "./WorkIssueDrawer";
import { WorkViewToolbar } from "./WorkViewToolbar";

const DRAG_TYPE = "application/x-work-sprint-issue";

function sortSprints(sprints: WorkSprint[]) {
  return sprints.slice().sort((a, b) => a.number - b.number);
}

function issueEstimateSum(issues: WorkIssue[]) {
  return issues.reduce((sum, issue) => sum + (issue.estimateHours ?? 0), 0);
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sprintLengthWeeks(sprint: WorkSprint) {
  const start = new Date(`${sprint.startsOn}T00:00:00.000Z`).getTime();
  const end = new Date(`${sprint.endsOn}T00:00:00.000Z`).getTime();
  const days = Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1);
  return Math.max(1, Math.round(days / 7));
}

const LENGTH_WEEK_PRESETS = [1, 2, 3, 4] as const;

export function WorkSprintView({
  board,
  issues,
  sprints,
  doneStatusIds,
  onIssuesChange,
  onSprintsChange,
  onOpenIssue,
  onError,
  onChanged,
  onOptimisticIssuePatch,
}: {
  board: WorkBoardView;
  issues: WorkIssue[];
  sprints: WorkSprint[];
  doneStatusIds: Set<string>;
  onIssuesChange: (issues: WorkIssue[]) => void;
  onSprintsChange: (sprints: WorkSprint[]) => void;
  onOpenIssue: (issueId: string, options?: { tab?: string }) => void;
  onError: (message: string) => void;
  onChanged: () => void;
  onOptimisticIssuePatch?: (
    issueId: string,
    patch: Pick<WorkIssue, "estimateHours">
  ) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [closeOpen, setCloseOpen] = useState(false);
  const [deleteSprintId, setDeleteSprintId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editSprintId, setEditSprintId] = useState<string | null>(null);
  const [editTitleDraft, setEditTitleDraft] = useState("");
  const [editStartsOn, setEditStartsOn] = useState("");
  const [editEndsOn, setEditEndsOn] = useState("");
  const [editCapacityDraft, setEditCapacityDraft] = useState("");
  const [planStartsOn, setPlanStartsOn] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [planLengthWeeks, setPlanLengthWeeks] = useState(2);
  const [planTitleDraft, setPlanTitleDraft] = useState("");
  const [planCapacityDraft, setPlanCapacityDraft] = useState("");
  const [viewingId, setViewingId] = useState<string | null>(() => {
    const currentSprint =
      sprints.find((sprint) => sprint.status === "current") ?? null;
    if (currentSprint) return currentSprint.id;
    const ordered = sortSprints(sprints);
    return ordered[ordered.length - 1]?.id ?? null;
  });
  const [dragOverTarget, setDragOverTarget] = useState<"backlog" | "sprint" | null>(
    null
  );
  const [backlogOwnerFilterIds, setBacklogOwnerFilterIds] = useState<string[]>(
    []
  );
  const [backlogTypeFilterIds, setBacklogTypeFilterIds] = useState<
    WorkIssueType[]
  >([]);
  const [backlogComponentFilterIds, setBacklogComponentFilterIds] = useState<
    string[]
  >([]);
  const [backlogPriorityFilterIds, setBacklogPriorityFilterIds] = useState<
    WorkBoardPriorityFilterId[]
  >([]);
  const [backlogGroupBy, setBacklogGroupBy] =
    useState<WorkBoardGroupBy>("none");
  const [sprintOwnerFilterIds, setSprintOwnerFilterIds] = useState<string[]>(
    []
  );
  const [sprintTypeFilterIds, setSprintTypeFilterIds] = useState<
    WorkIssueType[]
  >([]);
  const [sprintComponentFilterIds, setSprintComponentFilterIds] = useState<
    string[]
  >([]);
  const [sprintPriorityFilterIds, setSprintPriorityFilterIds] = useState<
    WorkBoardPriorityFilterId[]
  >([]);
  const [sprintGroupBy, setSprintGroupBy] = useState<WorkBoardGroupBy>("none");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const dragGhostRef = useRef<WorkCardDragGhost | null>(null);
  const dropIssueIdRef = useRef<string | null>(null);

  function clearDragGhost() {
    dragGhostRef.current?.remove();
    dragGhostRef.current = null;
  }

  async function finishSprintDragGhost() {
    const ghost = dragGhostRef.current;
    dragGhostRef.current = null;
    const issueId = dropIssueIdRef.current;
    dropIssueIdRef.current = null;
    if (!ghost) return;
    if (issueId) {
      await waitForPaint(2);
      const landed = document.querySelector<HTMLElement>(
        `[data-sprint-issue-id="${CSS.escape(issueId)}"]`
      );
      if (landed) {
        landed.style.opacity = "0";
        const rect = landed.getBoundingClientRect();
        await ghost.landAt({
          left: rect.left,
          top: rect.top,
          width: rect.width,
        });
        landed.style.opacity = "";
        await waitForPaint(2);
        ghost.remove();
        return;
      }
    }
    await ghost.dispose();
  }

  const orderedSprints = useMemo(() => sortSprints(sprints), [sprints]);
  const current = sprints.find((sprint) => sprint.status === "current") ?? null;
  const upcomingSprints = useMemo(
    () =>
      sprints
        .filter((sprint) => sprint.status === "next")
        .slice()
        .sort(
          (a, b) =>
            a.startsOn.localeCompare(b.startsOn) || a.number - b.number
        ),
    [sprints]
  );
  const next = upcomingSprints[0] ?? null;
  const editSprint =
    editSprintId == null
      ? null
      : (sprints.find((sprint) => sprint.id === editSprintId) ?? null);
  const planAfterSprint = useMemo(() => {
    const open = sprints.filter(
      (sprint) => sprint.status === "current" || sprint.status === "next"
    );
    if (open.length === 0) return null;
    return open.slice().sort((a, b) => b.endsOn.localeCompare(a.endsOn))[0]!;
  }, [sprints]);

  useEffect(() => {
    if (orderedSprints.length === 0) {
      setViewingId(null);
      return;
    }
    setViewingId((prev) => {
      if (prev && orderedSprints.some((sprint) => sprint.id === prev)) {
        return prev;
      }
      return current?.id ?? orderedSprints[orderedSprints.length - 1]!.id;
    });
  }, [orderedSprints, current?.id]);

  // Fall back synchronously so the sprint chip is selected on first paint
  // (avoids a flash when remounting after switching from Timeline).
  const viewing =
    orderedSprints.find((sprint) => sprint.id === viewingId) ??
    current ??
    orderedSprints[orderedSprints.length - 1] ??
    null;
  const canPlanScope =
    viewing?.status === "current" || viewing?.status === "next";

  const backlogAll = useMemo(
    () =>
      issues.filter(
        (issue) => issue.sprintId == null && !doneStatusIds.has(issue.status)
      ),
    [issues, doneStatusIds]
  );
  const viewingIssuesAll = useMemo(
    () =>
      viewing ? issues.filter((issue) => issue.sprintId === viewing.id) : [],
    [issues, viewing]
  );
  const backlogFilters = useMemo(
    () => ({
      ownerIds: backlogOwnerFilterIds,
      typeIds: backlogTypeFilterIds,
      componentIds: backlogComponentFilterIds,
      priorityIds: backlogPriorityFilterIds,
      sprintIds: [] as const,
    }),
    [
      backlogOwnerFilterIds,
      backlogTypeFilterIds,
      backlogComponentFilterIds,
      backlogPriorityFilterIds,
    ]
  );
  const sprintFilters = useMemo(
    () => ({
      ownerIds: sprintOwnerFilterIds,
      typeIds: sprintTypeFilterIds,
      componentIds: sprintComponentFilterIds,
      priorityIds: sprintPriorityFilterIds,
      sprintIds: [] as const,
    }),
    [
      sprintOwnerFilterIds,
      sprintTypeFilterIds,
      sprintComponentFilterIds,
      sprintPriorityFilterIds,
    ]
  );
  const backlog = useMemo(
    () =>
      backlogAll.filter((issue) =>
        issueMatchesBoardFilters(issue, backlogFilters)
      ),
    [backlogAll, backlogFilters]
  );
  const backlogGroups = useMemo(
    () => columnIssueGroups(backlog, backlogGroupBy),
    [backlog, backlogGroupBy]
  );
  const viewingIssues = useMemo(
    () =>
      viewingIssuesAll.filter((issue) =>
        issueMatchesBoardFilters(issue, sprintFilters)
      ),
    [viewingIssuesAll, sprintFilters]
  );
  const viewingGroups = useMemo(
    () => columnIssueGroups(viewingIssues, sprintGroupBy),
    [viewingIssues, sprintGroupBy]
  );
  const backlogFilterPeople = useMemo(
    () => collectOwnerFilterPeople(board.people, backlogAll),
    [board.people, backlogAll]
  );
  const backlogFilterComponents = useMemo(
    () => collectBoardComponents(board.components, backlogAll),
    [board.components, backlogAll]
  );
  const sprintFilterPeople = useMemo(
    () => collectOwnerFilterPeople(board.people, viewingIssuesAll),
    [board.people, viewingIssuesAll]
  );
  const sprintFilterComponents = useMemo(
    () => collectBoardComponents(board.components, viewingIssuesAll),
    [board.components, viewingIssuesAll]
  );
  const unfinished = viewingIssuesAll.filter(
    (issue) => !doneStatusIds.has(issue.status)
  );
  const estimateSum = issueEstimateSum(viewingIssuesAll);
  const estimatesAreHours = board.estimateUnit === "hours";
  const overCapacity =
    estimatesAreHours &&
    viewing?.capacityHours != null &&
    estimateSum > viewing.capacityHours;
  const capacityHours = viewing?.capacityHours ?? null;
  const capacityRatio =
    estimatesAreHours && capacityHours != null && capacityHours > 0
      ? estimateSum / capacityHours
      : null;
  const capacityFillPct =
    capacityRatio == null ? 0 : Math.min(100, capacityRatio * 100);
  const estimateSumLabel = formatWorkEstimate(
    estimateSum,
    board.estimateUnit,
    board.billingCurrency
  );

  function parseCapacityInput(rawValue: string): number | null | false {
    const raw = rawValue.trim().replace(",", ".");
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return false;
    return value;
  }

  function commitEstimate(issueId: string, value: number | null) {
    onOptimisticIssuePatch?.(issueId, { estimateHours: value });
    onIssuesChange(
      issues.map((issue) =>
        issue.id === issueId ? { ...issue, estimateHours: value } : issue
      )
    );
    runQuiet(() =>
      updateWorkIssueEstimateAction(
        board.id,
        issueId,
        value == null ? "" : String(value)
      )
    );
  }

  function commitType(issueId: string, issueType: WorkIssueType) {
    onIssuesChange(
      issues.map((issue) =>
        issue.id === issueId ? { ...issue, issueType } : issue
      )
    );
    runQuiet(() =>
      updateWorkIssueTypeAction(board.id, issueId, issueType)
    );
  }

  async function createIssue(input: {
    title: string;
    issueType: WorkIssueType;
    sprintId: string | null;
  }): Promise<boolean> {
    const result = await createWorkIssueAction({
      boardId: board.id,
      title: input.title,
      issueType: input.issueType,
      status: board.statuses[0]?.id,
      sprintId: input.sprintId,
    });
    if (!result.ok) {
      onError(result.error);
      return false;
    }
    onChanged();
    return true;
  }

  function commitOwner(issueId: string, person: WorkPerson | null) {
    onIssuesChange(
      issues.map((issue) =>
        issue.id === issueId ? { ...issue, owner: person } : issue
      )
    );
    runQuiet(() =>
      updateWorkIssueOwnerAction(
        board.id,
        issueId,
        person?.id ?? null,
        person?.name ?? ""
      )
    );
  }

  function commitAddAssignee(issueId: string, person: WorkPerson) {
    onIssuesChange(
      issues.map((issue) => {
        if (issue.id !== issueId) return issue;
        if (issue.assignees.some((assignee) => assignee.id === person.id)) {
          return issue;
        }
        return { ...issue, assignees: [...issue.assignees, person] };
      })
    );
    runQuiet(() =>
      addWorkIssueAssigneeAction(board.id, issueId, person.id, person.name)
    );
  }

  function commitRemoveAssignee(issueId: string, person: WorkPerson) {
    onIssuesChange(
      issues.map((issue) =>
        issue.id === issueId
          ? {
              ...issue,
              assignees: issue.assignees.filter(
                (assignee) => assignee.id !== person.id
              ),
            }
          : issue
      )
    );
    runQuiet(() =>
      removeWorkIssueAssigneeAction(board.id, issueId, person.id, person.name)
    );
  }

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        onError(result.error);
        return;
      }
      onChanged();
    });
  }

  /** Optimistic field edits — no transition/refresh so the list doesn't jump. */
  function runQuiet(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>
  ) {
    void action().then((result) => {
      if (result.ok) return;
      onError(result.error);
      onChanged();
    });
  }

  function moveIssue(issueId: string, sprintId: string | null) {
    moveIssues([issueId], sprintId);
  }

  function moveIssues(issueIds: string[], sprintId: string | null) {
    const idSet = new Set(
      issueIds.filter((issueId) => {
        const issue = issues.find((row) => row.id === issueId);
        return issue != null && (issue.sprintId ?? null) !== sprintId;
      })
    );
    if (idSet.size === 0) return;
    onIssuesChange(
      issues.map((row) =>
        idSet.has(row.id) ? { ...row, sprintId } : row
      )
    );
    run(async () => {
      const results = await Promise.all(
        [...idSet].map((issueId) =>
          setWorkIssueSprintAction(board.id, issueId, sprintId)
        )
      );
      const failed = results.find(
        (result): result is { ok: false; error: string } => !result.ok
      );
      return failed ?? { ok: true };
    });
  }

  function onDragStart(event: DragEvent<HTMLElement>, issueId: string) {
    if (!canPlanScope) {
      event.preventDefault();
      return;
    }
    draggingIdRef.current = issueId;
    setDraggingId(issueId);
    clearDragGhost();
    event.dataTransfer.setData(DRAG_TYPE, issueId);
    event.dataTransfer.setData("text/plain", issueId);
    event.dataTransfer.effectAllowed = "move";
    dragGhostRef.current = startWorkCardDragGhost(event, {
      rotateDeg: 2,
      scale: 1.02,
    });
  }

  function onDragEnd() {
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragOverTarget(null);
    void finishSprintDragGhost();
  }

  function acceptDrop(event: DragEvent, target: "backlog" | "sprint") {
    if (!canPlanScope) return false;
    if (!draggingIdRef.current && !event.dataTransfer.types.includes(DRAG_TYPE)) {
      return false;
    }
    if (target === "sprint" && !viewing) return false;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverTarget(target);
    return true;
  }

  function handleDrop(event: DragEvent, target: "backlog" | "sprint") {
    event.preventDefault();
    if (!canPlanScope) return;
    const issueId =
      event.dataTransfer.getData(DRAG_TYPE) ||
      event.dataTransfer.getData("text/plain") ||
      draggingIdRef.current;
    setDragOverTarget(null);
    draggingIdRef.current = null;
    setDraggingId(null);
    if (!issueId) {
      clearDragGhost();
      return;
    }
    dropIssueIdRef.current = issueId;
    if (target === "sprint") {
      if (!viewing) {
        dropIssueIdRef.current = null;
        clearDragGhost();
        return;
      }
      moveIssue(issueId, viewing.id);
      return;
    }
    moveIssue(issueId, null);
  }

  const canCreateInSprint = canPlanScope && viewing != null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mb-2 shrink-0">
        <WorkViewToolbar
          sprints={orderedSprints}
          selectedSprintIds={viewing?.id ? [viewing.id] : []}
          onSelectedSprintIdsChange={(ids) => {
            const id = ids[ids.length - 1];
            if (id) setViewingId(id);
          }}
          onPlanNext={() => {
            const anchor = planAfterSprint;
            setPlanStartsOn(
              anchor
                ? addDays(anchor.endsOn, 1)
                : new Date().toISOString().slice(0, 10)
            );
            setPlanLengthWeeks(anchor ? sprintLengthWeeks(anchor) : 2);
            setPlanTitleDraft("");
            setPlanCapacityDraft("");
            setCreateDialogOpen(true);
          }}
          planNextDisabled={pending}
          onEditSprint={(sprintId) => {
            const sprint = sprints.find((row) => row.id === sprintId);
            if (!sprint) return;
            setEditTitleDraft(sprint.title);
            setEditStartsOn(sprint.startsOn);
            setEditEndsOn(sprint.endsOn);
            setEditCapacityDraft(
              sprint.capacityHours == null ? "" : String(sprint.capacityHours)
            );
            setEditSprintId(sprint.id);
          }}
          editSprintDisabled={pending}
          onStartSprint={(sprintId) => {
            run(async () => {
              const result = await startWorkSprintAction(board.id, sprintId);
              if (!result.ok) return result;
              onSprintsChange(
                sprints.map((sprint) =>
                  sprint.id === result.sprint.id ? result.sprint : sprint
                )
              );
              setViewingId(result.sprint.id);
              return { ok: true };
            });
          }}
          startSprintDisabled={pending || Boolean(current)}
          onCloseCurrent={
            current ? () => setCloseOpen(true) : undefined
          }
          closeCurrentDisabled={pending}
          onDeleteSprint={(sprintId) => setDeleteSprintId(sprintId)}
          deleteSprintDisabled={pending}
          actions={
            <>
              {viewing && board.showEstimates ? (
                <div
                  className="flex w-[11rem] flex-col gap-1"
                  title={
                    !estimatesAreHours
                      ? `${estimateSumLabel} planned`
                      : capacityHours == null
                        ? `${estimateSumLabel} planned · set capacity in Edit`
                        : overCapacity
                          ? `${estimateSumLabel} of ${formatWorkHours(capacityHours)} · over capacity`
                          : `${estimateSumLabel} of ${formatWorkHours(capacityHours)}`
                  }
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-medium text-text-tertiary">
                      {estimatesAreHours ? "Capacity" : "Estimate"}
                    </span>
                    <span
                      className={`text-[12px] tabular-nums ${
                        overCapacity
                          ? "font-medium text-danger"
                          : "text-text-primary"
                      }`}
                    >
                      {!estimatesAreHours
                        ? estimateSumLabel
                        : capacityHours == null
                          ? `${estimateSumLabel} / —`
                          : `${estimateSumLabel} / ${formatWorkHours(capacityHours)}`}
                    </span>
                  </div>
                  {estimatesAreHours ? (
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-bg-muted"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={
                        capacityHours == null
                          ? undefined
                          : Math.round(capacityFillPct)
                      }
                      aria-label="Planned hours versus capacity"
                    >
                      <div
                        className={`h-full rounded-full transition-[width] duration-200 ${
                          overCapacity ? "bg-danger" : "bg-brand-signal"
                        }`}
                        style={{
                          width:
                            capacityHours == null
                              ? "0%"
                              : `${capacityFillPct}%`,
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          }
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border-subtle bg-bg-default">
        <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-border-subtle">
          <SprintColumn
            embedded
            title="Backlog"
            count={backlog.length}
            empty="No backlog issues."
            issues={backlog}
            groups={backlogGroups}
            groupBy={backlogGroupBy}
            pending={pending}
            estimateDisabled={pending}
            dropActive={dragOverTarget === "backlog"}
            canDrop={canPlanScope}
            draggableCards={canPlanScope}
            draggingIssueId={draggingId}
            onOpenIssue={onOpenIssue}
            onEstimateChange={commitEstimate}
            onTypeChange={commitType}
            onSetOwner={commitOwner}
            onAddAssignee={commitAddAssignee}
            onRemoveAssignee={commitRemoveAssignee}
            onError={onError}
            board={board}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={(event) => acceptDrop(event, "backlog")}
            onDragLeave={() => setDragOverTarget(null)}
            onDrop={(event) => handleDrop(event, "backlog")}
            onMoveGroupToSprint={
              canPlanScope && viewing
                ? (issueIds) => moveIssues(issueIds, viewing.id)
                : undefined
            }
            viewControls={{
              people: backlogFilterPeople,
              components: backlogFilterComponents,
              ownerFilterIds: backlogOwnerFilterIds,
              onOwnerFilterChange: setBacklogOwnerFilterIds,
              typeFilterIds: backlogTypeFilterIds,
              onTypeFilterChange: setBacklogTypeFilterIds,
              componentFilterIds: backlogComponentFilterIds,
              onComponentFilterChange: setBacklogComponentFilterIds,
              priorityFilterIds: backlogPriorityFilterIds,
              onPriorityFilterChange: setBacklogPriorityFilterIds,
              groupBy: backlogGroupBy,
              onGroupByChange: setBacklogGroupBy,
            }}
            onCreateIssue={({ title, issueType }) =>
              createIssue({ title, issueType, sprintId: null })
            }
          />
          <SprintColumn
            embedded
            title={viewing ? workSprintLabel(viewing) : "Sprint"}
            count={viewingIssues.length}
            empty={
              viewing
                ? canPlanScope
                  ? "Drop issues here from the backlog."
                  : "No issues in this sprint."
                : "Start a sprint first."
            }
            issues={viewingIssues}
            groups={viewingGroups}
            groupBy={sprintGroupBy}
            pending={pending || !canPlanScope}
            estimateDisabled={pending}
            dropActive={dragOverTarget === "sprint"}
            canDrop={canPlanScope}
            draggableCards={canPlanScope}
            draggingIssueId={draggingId}
            onOpenIssue={onOpenIssue}
            onEstimateChange={commitEstimate}
            onTypeChange={commitType}
            onSetOwner={commitOwner}
            onAddAssignee={commitAddAssignee}
            onRemoveAssignee={commitRemoveAssignee}
            onError={onError}
            warnBlocked={canPlanScope ? unfinished : undefined}
            board={board}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={(event) => acceptDrop(event, "sprint")}
            onDragLeave={() => setDragOverTarget(null)}
            onDrop={(event) => handleDrop(event, "sprint")}
            viewControls={{
              people: sprintFilterPeople,
              components: sprintFilterComponents,
              ownerFilterIds: sprintOwnerFilterIds,
              onOwnerFilterChange: setSprintOwnerFilterIds,
              typeFilterIds: sprintTypeFilterIds,
              onTypeFilterChange: setSprintTypeFilterIds,
              componentFilterIds: sprintComponentFilterIds,
              onComponentFilterChange: setSprintComponentFilterIds,
              priorityFilterIds: sprintPriorityFilterIds,
              onPriorityFilterChange: setSprintPriorityFilterIds,
              groupBy: sprintGroupBy,
              onGroupByChange: setSprintGroupBy,
            }}
            onCreateIssue={
              canCreateInSprint && viewing
                ? ({ title, issueType }) =>
                    createIssue({
                      title,
                      issueType,
                      sprintId: viewing.id,
                    })
                : undefined
            }
          />
        </div>
      </div>

      {createDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-bg-default p-5 shadow-lg">
            <h3 className="text-heading-s text-text-primary">
              {sprints.length === 0
                ? "Create sprint"
                : upcomingSprints.length > 0
                  ? "Plan another sprint"
                  : "Plan next sprint"}
            </h3>
            <p className="mt-1 text-sm text-text-secondary">
              Creates a planned sprint. Start it later from the chip.
            </p>
            <label className="mt-4 block space-y-1.5">
              <span className="text-sm font-medium text-text-primary">
                Starts on
              </span>
              <input
                type="date"
                value={planStartsOn}
                onChange={(event) => setPlanStartsOn(event.target.value)}
                aria-label="Sprint start date"
                className="w-full rounded-md border border-border-subtle bg-bg-default px-2.5 py-1.5 text-sm tabular-nums text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-signal"
              />
            </label>
            <div className="mt-4 space-y-1.5">
              <span className="text-sm font-medium text-text-primary">
                Length
              </span>
              <div
                role="group"
                aria-label="Sprint length in weeks"
                className="flex h-9 items-stretch gap-0.5 rounded-lg border border-border-subtle bg-bg-muted/50 p-0.5"
              >
                {LENGTH_WEEK_PRESETS.map((weeks) => {
                  const selected = planLengthWeeks === weeks;
                  return (
                    <button
                      key={weeks}
                      type="button"
                      aria-pressed={selected}
                      className={`min-w-0 flex-1 rounded-md text-[13px] font-medium tabular-nums transition-colors ${
                        selected
                          ? "bg-bg-default text-text-primary shadow-sm ring-1 ring-border-subtle"
                          : "text-text-secondary hover:bg-bg-default/70 hover:text-text-primary"
                      }`}
                      onClick={() => setPlanLengthWeeks(weeks)}
                    >
                      {weeks}w
                    </button>
                  );
                })}
                <span
                  className="mx-0.5 my-1.5 w-px shrink-0 bg-border-subtle"
                  aria-hidden
                />
                <label className="inline-flex min-w-[3.75rem] shrink-0 items-center justify-center gap-0.5 rounded-md bg-bg-default px-1.5 text-text-primary shadow-sm ring-1 ring-border-subtle focus-within:ring-brand-signal">
                  <span className="sr-only">Custom length in weeks</span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={planLengthWeeks}
                    aria-label="Custom length in weeks"
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isFinite(value)) return;
                      setPlanLengthWeeks(
                        Math.max(1, Math.min(12, Math.round(value)))
                      );
                    }}
                    onFocus={(event) => event.currentTarget.select()}
                    className="w-6 border-0 bg-transparent p-0 text-center text-[13px] font-medium tabular-nums text-text-primary placeholder:text-text-muted focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="text-[12px] font-normal text-text-tertiary">
                    w
                  </span>
                </label>
              </div>
              <p className="text-caption text-text-tertiary">
                {planStartsOn
                  ? `${planStartsOn} → ${addDays(planStartsOn, planLengthWeeks * 7 - 1)}`
                  : "Pick a start date"}
              </p>
            </div>
            <label className="mt-4 block space-y-1.5">
              <span className="text-sm font-medium text-text-primary">
                Name
              </span>
              <input
                type="text"
                value={planTitleDraft}
                maxLength={WORK_SPRINT_TITLE_MAX_LENGTH}
                onChange={(event) => setPlanTitleDraft(event.target.value)}
                placeholder="Optional subtitle"
                aria-label="Sprint name"
                className="w-full rounded-md border border-border-subtle bg-bg-default px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-signal"
              />
            </label>
            <label className="mt-3 block space-y-1.5">
              <span className="text-sm font-medium text-text-primary">
                Capacity (h)
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={planCapacityDraft}
                onChange={(event) => setPlanCapacityDraft(event.target.value)}
                placeholder="Optional"
                aria-label="Sprint capacity in hours"
                className="w-full rounded-md border border-border-subtle bg-bg-default px-2.5 py-1.5 text-sm tabular-nums text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-signal"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => setCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={pending || planLengthWeeks < 1 || !planStartsOn}
                onClick={() => {
                  const capacity = parseCapacityInput(planCapacityDraft);
                  if (capacity === false) {
                    onError("Capacity must be a number of hours");
                    return;
                  }
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(planStartsOn)) {
                    onError("Pick a valid start date");
                    return;
                  }
                  const startsOn = planStartsOn;
                  const title = clampWorkSprintTitle(planTitleDraft);
                  setCreateDialogOpen(false);
                  run(async () => {
                    const result = await createWorkSprintAction(board.id, {
                      as: "next",
                      startsOn,
                      lengthDays: planLengthWeeks * 7,
                      capacityHours: capacity,
                      title,
                    });
                    if (!result.ok) return result;
                    onSprintsChange([...sprints, result.sprint]);
                    setViewingId(result.sprint.id);
                    return { ok: true };
                  });
                }}
              >
                Create sprint
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {editSprint ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-bg-default p-5 shadow-lg">
            <h3 className="text-heading-s text-text-primary">Edit sprint</h3>
            <p className="mt-1 text-sm text-text-secondary">
              Sprint {editSprint.number}
            </p>
            <label className="mt-4 block space-y-1.5">
              <span className="text-sm font-medium text-text-primary">
                Name
              </span>
              <input
                type="text"
                value={editTitleDraft}
                maxLength={WORK_SPRINT_TITLE_MAX_LENGTH}
                onChange={(event) => setEditTitleDraft(event.target.value)}
                placeholder="Optional subtitle"
                aria-label="Sprint name"
                className="w-full rounded-md border border-border-subtle bg-bg-default px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-signal"
              />
            </label>
            <label className="mt-3 block space-y-1.5">
              <span className="text-sm font-medium text-text-primary">
                Starts on
              </span>
              <input
                type="date"
                value={editStartsOn}
                onChange={(event) => setEditStartsOn(event.target.value)}
                aria-label="Sprint start date"
                className="w-full rounded-md border border-border-subtle bg-bg-default px-2.5 py-1.5 text-sm tabular-nums text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-signal"
              />
            </label>
            <label className="mt-3 block space-y-1.5">
              <span className="text-sm font-medium text-text-primary">
                Ends on
              </span>
              <input
                type="date"
                value={editEndsOn}
                onChange={(event) => setEditEndsOn(event.target.value)}
                aria-label="Sprint end date"
                className="w-full rounded-md border border-border-subtle bg-bg-default px-2.5 py-1.5 text-sm tabular-nums text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-signal"
              />
            </label>
            <label className="mt-3 block space-y-1.5">
              <span className="text-sm font-medium text-text-primary">
                Capacity (h)
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={editCapacityDraft}
                onChange={(event) => setEditCapacityDraft(event.target.value)}
                placeholder="Optional"
                aria-label="Sprint capacity in hours"
                className="w-full rounded-md border border-border-subtle bg-bg-default px-2.5 py-1.5 text-sm tabular-nums text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-signal"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => setEditSprintId(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={
                  pending ||
                  !/^\d{4}-\d{2}-\d{2}$/.test(editStartsOn) ||
                  !/^\d{4}-\d{2}-\d{2}$/.test(editEndsOn)
                }
                onClick={() => {
                  const sprintId = editSprint.id;
                  const title = clampWorkSprintTitle(editTitleDraft);
                  const startsOn = editStartsOn;
                  const endsOn = editEndsOn;
                  const capacity = parseCapacityInput(editCapacityDraft);
                  if (capacity === false) {
                    onError("Capacity must be a number of hours");
                    return;
                  }
                  if (endsOn < startsOn) {
                    onError("End date must be on or after start");
                    return;
                  }
                  setEditSprintId(null);
                  run(async () => {
                    const result = await updateWorkSprintAction(
                      board.id,
                      sprintId,
                      { title, startsOn, endsOn, capacityHours: capacity }
                    );
                    if (!result.ok) return result;
                    onSprintsChange(
                      sprints.map((sprint) =>
                        sprint.id === result.sprint.id ? result.sprint : sprint
                      )
                    );
                    return { ok: true };
                  });
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        isOpen={deleteSprintId != null}
        title={(() => {
          const sprint = deleteSprintId
            ? sprints.find((row) => row.id === deleteSprintId)
            : null;
          return sprint
            ? `Delete ${workSprintLabel(sprint)}?`
            : "Delete sprint?";
        })()}
        message="Issues in this sprint move back to the backlog. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onClose={() => setDeleteSprintId(null)}
        onConfirm={() => {
          const sprintId = deleteSprintId;
          if (!sprintId) return;
          const remaining = sprints.filter((sprint) => sprint.id !== sprintId);
          onSprintsChange(remaining);
          onIssuesChange(
            issues.map((issue) =>
              issue.sprintId === sprintId ? { ...issue, sprintId: null } : issue
            )
          );
          if (viewingId === sprintId) {
            const nextView =
              remaining.find((sprint) => sprint.status === "current") ??
              remaining[remaining.length - 1] ??
              null;
            setViewingId(nextView?.id ?? null);
          }
          setDeleteSprintId(null);
          run(() => deleteWorkSprintAction(board.id, sprintId));
        }}
      />

      {closeOpen && current ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-bg-default p-5 shadow-lg">
            <h3 className="text-heading-s text-text-primary">Close sprint</h3>
            <p className="mt-1 text-sm text-text-secondary">
              {unfinished.length > 0
                ? `${unfinished.length} unfinished issue${
                    unfinished.length === 1 ? "" : "s"
                  }. Where should they go?`
                : "All sprint issues are done. Close this sprint?"}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {unfinished.length > 0 ? (
                <>
                  <Button
                    type="button"
                    disabled={pending || !next}
                    onClick={() => {
                      setCloseOpen(false);
                      run(() =>
                        closeWorkSprintAction(board.id, current.id, "next")
                      );
                    }}
                  >
                    Move to next sprint
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => {
                      setCloseOpen(false);
                      run(() =>
                        closeWorkSprintAction(board.id, current.id, "backlog")
                      );
                    }}
                  >
                    Move to backlog
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => {
                      setCloseOpen(false);
                      run(() =>
                        closeWorkSprintAction(board.id, current.id, "leave")
                      );
                    }}
                  >
                    Leave in this sprint
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setCloseOpen(false);
                    run(() =>
                      closeWorkSprintAction(board.id, current.id, "leave")
                    );
                  }}
                >
                  Close sprint
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => setCloseOpen(false)}
              >
                Cancel
              </Button>
            </div>
            {unfinished.length > 0 && !next ? (
              <p className="mt-3 text-caption text-text-tertiary">
                Plan a next sprint to enable “Move to next”.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SprintColumn({
  embedded = false,
  title,
  count,
  empty,
  issues,
  groups,
  groupBy = "none",
  pending,
  estimateDisabled = false,
  dropActive,
  canDrop,
  draggableCards,
  draggingIssueId = null,
  onOpenIssue,
  onEstimateChange,
  onTypeChange,
  onSetOwner,
  onAddAssignee,
  onRemoveAssignee,
  onError,
  warnBlocked,
  board,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onMoveGroupToSprint,
  viewControls,
  onCreateIssue,
}: {
  embedded?: boolean;
  title: string;
  count: number;
  empty: string;
  issues: WorkIssue[];
  groups?: WorkColumnGroup[];
  groupBy?: WorkBoardGroupBy;
  pending: boolean;
  estimateDisabled?: boolean;
  dropActive: boolean;
  canDrop: boolean;
  draggableCards: boolean;
  draggingIssueId?: string | null;
  onOpenIssue: (issueId: string, options?: { tab?: string }) => void;
  onEstimateChange: (issueId: string, value: number | null) => void;
  onTypeChange: (issueId: string, issueType: WorkIssueType) => void;
  onSetOwner: (issueId: string, person: WorkPerson | null) => void;
  onAddAssignee: (issueId: string, person: WorkPerson) => void;
  onRemoveAssignee: (issueId: string, person: WorkPerson) => void;
  onError: (message: string) => void;
  warnBlocked?: WorkIssue[];
  board?: WorkBoardView;
  onDragStart: (event: DragEvent<HTMLElement>, issueId: string) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent) => boolean;
  onDragLeave: () => void;
  onDrop: (event: DragEvent) => void;
  onMoveGroupToSprint?: (issueIds: string[]) => void;
  viewControls?: {
    people: WorkPerson[];
    components: ReturnType<typeof collectBoardComponents>;
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
  };
  onCreateIssue?: (input: {
    title: string;
    issueType: WorkIssueType;
  }) => Promise<boolean> | boolean;
}) {
  const [adding, setAdding] = useState(false);
  const skipRowClickRef = useRef(false);
  const statusTones = useMemo(
    () =>
      board
        ? workStatusToneById(board.customerColor, board.statuses)
        : {},
    [board]
  );
  const blockedIds = useMemo(() => {
    if (!warnBlocked || !board) return new Set<string>();
    const ids = new Set<string>();
    for (const issue of warnBlocked) {
      for (const blocker of issue.relations.blockedBy) {
        const other = board.issues.find((row) => row.id === blocker.id);
        if (!other) continue;
        if (other.sprintId !== issue.sprintId) {
          ids.add(issue.id);
        }
        const done = board.statuses.find((s) => s.id === other.status)?.isDone;
        if (!done) ids.add(issue.id);
      }
    }
    return ids;
  }, [warnBlocked, board]);

  const issueGroups =
    groups ?? ([{ key: "all", title: "", owner: null, issues }] as WorkColumnGroup[]);

  function isRowControlTarget(target: EventTarget | null) {
    return (
      target instanceof Element &&
      target.closest("[data-no-row-drag]") != null
    );
  }

  function renderIssue(issue: WorkIssue, key: string) {
    const canDrag = draggableCards && !pending;
    const isDragging = draggingIssueId === issue.id;
    const tone = statusTones[issue.status];
    return (
      <li
        key={key}
        data-sprint-issue-id={issue.id}
        draggable={canDrag}
        role="button"
        tabIndex={0}
        aria-label={`Open ${issue.key}`}
        style={
          tone
            ? { borderLeftColor: workStatusBorderColor(tone) }
            : undefined
        }
        className={`flex cursor-pointer items-stretch gap-0.5 rounded-lg border border-l-4 border-border-subtle bg-bg-default transition-opacity ${
          canDrag ? "select-none" : ""
        } ${isDragging ? "opacity-35" : ""}`}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenIssue(issue.id);
          }
        }}
        onClick={(event) => {
          if (skipRowClickRef.current) return;
          if (isRowControlTarget(event.target)) return;
          onOpenIssue(issue.id);
        }}
        onDragStart={
          canDrag
            ? (event) => {
                if (isRowControlTarget(event.target)) {
                  event.preventDefault();
                  return;
                }
                skipRowClickRef.current = true;
                onDragStart(event, issue.id);
              }
            : undefined
        }
        onDragEnd={
          canDrag
            ? () => {
                onDragEnd();
                window.setTimeout(() => {
                  skipRowClickRef.current = false;
                }, 0);
              }
            : undefined
        }
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 py-2 pr-1 pl-2">
          <span data-no-row-drag className="shrink-0">
            <WorkCardTypeBadge
              issueType={issue.issueType}
              disabled={estimateDisabled}
              onChange={(issueType) => onTypeChange(issue.id, issueType)}
            />
          </span>
          <div className="flex min-w-0 flex-1 items-start gap-1">
            <span className="min-w-0 flex-1 text-left">
              <span className="flex min-w-0 items-center gap-2 text-sm leading-6 text-text-primary">
                <span className="shrink-0 tabular-nums text-text-tertiary">
                  {issue.key}
                </span>
                <span className="min-w-0 flex-1 truncate">{issue.title}</span>
              </span>
              {blockedIds.has(issue.id) ? (
                <span className="mt-0.5 block text-caption leading-snug text-danger">
                  Blocked by work outside this sprint or not done
                </span>
              ) : null}
            </span>
            <span data-no-row-drag className="shrink-0">
              <WorkCardPreDeployHint
                actions={issue.preDeployActions}
                onOpen={() => onOpenIssue(issue.id, { tab: "pre-deploy" })}
              />
            </span>
          </div>
        </div>
        <div
          data-no-row-drag
          className="flex shrink-0 items-center gap-1.5 py-2 pr-2"
        >
          <WorkCardPeople
            owner={issue.owner}
            assignees={issue.assignees}
            people={board?.members ?? []}
            disabled={estimateDisabled}
            onSetOwner={(person) => onSetOwner(issue.id, person)}
            onAddAssignee={(person) => onAddAssignee(issue.id, person)}
            onRemoveAssignee={(person) => onRemoveAssignee(issue.id, person)}
          />
          {/* Fixed slot so edit mode does not push avatars left. */}
          {board?.showEstimates !== false ? (
            <div className="flex w-14 shrink-0 justify-end">
              <WorkCardEstimate
                estimateHours={issue.estimateHours}
                estimateUnit={board?.estimateUnit ?? "hours"}
                billingCurrency={board?.billingCurrency ?? "SEK"}
                disabled={estimateDisabled}
                onError={onError}
                onChange={(value) => onEstimateChange(issue.id, value)}
              />
            </div>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <section
      className={`flex min-h-0 flex-col transition-[background-color,box-shadow] duration-150 ${
        embedded
          ? dropActive
            ? "min-h-0 bg-accent-primary-subtle ring-1 ring-inset ring-brand-signal/35"
            : "min-h-0 bg-bg-default"
          : dropActive
            ? "rounded-xl border border-brand-signal bg-accent-primary-subtle"
            : "rounded-xl border border-border-subtle bg-bg-muted/40"
      }`}
      onDragOver={(event) => {
        if (!canDrop) return;
        onDragOver(event);
      }}
      onDragLeave={(event) => {
        const related = event.relatedTarget;
        if (
          related instanceof Node &&
          event.currentTarget.contains(related)
        ) {
          return;
        }
        onDragLeave();
      }}
      onDrop={(event) => {
        if (!canDrop) return;
        onDrop(event);
      }}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
          {title}
        </h3>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {viewControls ? (
            <WorkBoardViewControls
              people={viewControls.people}
              components={viewControls.components}
              ownerFilterIds={viewControls.ownerFilterIds}
              onOwnerFilterChange={viewControls.onOwnerFilterChange}
              typeFilterIds={viewControls.typeFilterIds}
              onTypeFilterChange={viewControls.onTypeFilterChange}
              componentFilterIds={viewControls.componentFilterIds}
              onComponentFilterChange={viewControls.onComponentFilterChange}
              priorityFilterIds={viewControls.priorityFilterIds}
              onPriorityFilterChange={viewControls.onPriorityFilterChange}
              groupBy={viewControls.groupBy}
              onGroupByChange={viewControls.onGroupByChange}
            />
          ) : null}
          <span className="tabular-nums text-caption text-text-tertiary">
            {count}
          </span>
          {onCreateIssue && !adding ? (
            <WorkAddIssueInline
              iconOnly
              disabled={pending}
              onOpenChange={(open) => {
                if (open) setAdding(true);
              }}
              onCreate={onCreateIssue}
            />
          ) : null}
        </div>
      </header>
      {adding && onCreateIssue ? (
        <div className="border-b border-border-subtle px-2 py-2">
          <WorkAddIssueInline
            open
            disabled={pending}
            onOpenChange={setAdding}
            onCreate={onCreateIssue}
          />
        </div>
      ) : null}
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {issues.length === 0 && !adding ? (
          <li className="px-2 py-6 text-center text-sm text-text-tertiary">
            {empty}
          </li>
        ) : (
          issueGroups.map((group, groupIndex) => (
            <Fragment key={group.key}>
              {groupBy !== "none" ? (
                <li>
                  <WorkColumnGroupHeader
                    groupBy={groupBy}
                    group={group}
                    showEstimates={board?.showEstimates}
                    showReportedTime={board?.showReportedTime}
                    estimateUnit={board?.estimateUnit}
                    billingCurrency={board?.billingCurrency}
                    className={groupIndex === 0 ? "" : "mt-1"}
                    actions={
                      onMoveGroupToSprint && group.issues.length > 0 ? (
                        <IconButton
                          aria-label={`Move ${group.title} to sprint`}
                          title="Move group to sprint"
                          disabled={pending}
                          className="!p-1"
                          onClick={() =>
                            onMoveGroupToSprint(
                              group.issues.map((issue) => issue.id)
                            )
                          }
                        >
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </IconButton>
                      ) : undefined
                    }
                  />
                </li>
              ) : null}
              {group.issues.map((issue) =>
                renderIssue(issue, `${group.key}-${issue.id}`)
              )}
            </Fragment>
          ))
        )}
      </ul>
    </section>
  );
}
