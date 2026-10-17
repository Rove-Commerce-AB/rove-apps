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
import { ArrowRight, GripVertical } from "lucide-react";
import { Button, IconButton } from "@/components/ui";
import {
  addWorkIssueAssigneeAction,
  closeWorkSprintAction,
  createWorkIssueAction,
  createWorkSprintAction,
  removeWorkIssueAssigneeAction,
  setWorkIssueSprintAction,
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
import { formatWorkHours } from "@/lib/workTime";
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
}: {
  board: WorkBoardView;
  issues: WorkIssue[];
  sprints: WorkSprint[];
  doneStatusIds: Set<string>;
  onIssuesChange: (issues: WorkIssue[]) => void;
  onSprintsChange: (sprints: WorkSprint[]) => void;
  onOpenIssue: (issueId: string) => void;
  onError: (message: string) => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [closeOpen, setCloseOpen] = useState(false);
  const [lengthDialog, setLengthDialog] = useState<"start" | "next" | null>(
    null
  );
  const [planStartsOn, setPlanStartsOn] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [planLengthWeeks, setPlanLengthWeeks] = useState(2);
  const [planTitleDraft, setPlanTitleDraft] = useState("");
  const [planCapacityDraft, setPlanCapacityDraft] = useState("");
  const [capacityDraft, setCapacityDraft] = useState("");
  const [editingCapacity, setEditingCapacity] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
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
  const draggingIdRef = useRef<string | null>(null);

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
  const overCapacity =
    viewing?.capacityHours != null && estimateSum > viewing.capacityHours;
  const capacityHours = viewing?.capacityHours ?? null;
  const capacityRatio =
    capacityHours != null && capacityHours > 0
      ? estimateSum / capacityHours
      : null;
  const capacityFillPct =
    capacityRatio == null ? 0 : Math.min(100, capacityRatio * 100);

  useEffect(() => {
    setCapacityDraft(
      viewing?.capacityHours == null ? "" : String(viewing.capacityHours)
    );
    setEditingCapacity(false);
  }, [viewing?.id, viewing?.capacityHours]);

  useEffect(() => {
    setTitleDraft(viewing?.title ?? "");
    setEditingTitle(false);
  }, [viewing?.id, viewing?.title]);

  function commitSprintTitle(rawValue: string) {
    if (!viewing || !canPlanScope) {
      setEditingTitle(false);
      return;
    }
    const nextTitle = clampWorkSprintTitle(rawValue);
    setTitleDraft(nextTitle);
    setEditingTitle(false);
    if (nextTitle === viewing.title.trim()) return;
    onSprintsChange(
      sprints.map((sprint) =>
        sprint.id === viewing.id ? { ...sprint, title: nextTitle } : sprint
      )
    );
    run(() =>
      updateWorkSprintAction(board.id, viewing.id, { title: nextTitle })
    );
  }

  function parseCapacityInput(rawValue: string): number | null | false {
    const raw = rawValue.trim().replace(",", ".");
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return false;
    return value;
  }

  function commitCapacity(rawValue: string) {
    if (!viewing || !canPlanScope) return;
    const value = parseCapacityInput(rawValue);
    if (value === false) {
      setCapacityDraft(
        viewing.capacityHours == null ? "" : String(viewing.capacityHours)
      );
      setEditingCapacity(false);
      onError("Capacity must be a number of hours");
      return;
    }
    setCapacityDraft(value == null ? "" : String(value));
    setEditingCapacity(false);
    if (value === (viewing.capacityHours ?? null)) return;
    onSprintsChange(
      sprints.map((sprint) =>
        sprint.id === viewing.id ? { ...sprint, capacityHours: value } : sprint
      )
    );
    run(() =>
      updateWorkSprintAction(board.id, viewing.id, {
        capacityHours: value,
      })
    );
  }

  function commitEstimate(issueId: string, value: number | null) {
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

  function onDragStart(event: DragEvent, issueId: string) {
    if (!canPlanScope) {
      event.preventDefault();
      return;
    }
    draggingIdRef.current = issueId;
    event.dataTransfer.setData(DRAG_TYPE, issueId);
    event.dataTransfer.setData("text/plain", issueId);
    event.dataTransfer.effectAllowed = "move";
  }

  function onDragEnd() {
    draggingIdRef.current = null;
    setDragOverTarget(null);
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
    if (!issueId) return;
    if (target === "sprint") {
      if (!viewing) return;
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
          emptySprints={
            <>
              <h2 className="text-heading-s text-text-primary">No sprints yet</h2>
              <p className="text-sm text-text-secondary">
                Create a current sprint to plan scope.
              </p>
            </>
          }
          onPlanNext={
            current
              ? () => {
                  const anchor = planAfterSprint ?? current;
                  setPlanStartsOn(addDays(anchor.endsOn, 1));
                  setPlanLengthWeeks(sprintLengthWeeks(anchor));
                  setPlanTitleDraft("");
                  setPlanCapacityDraft("");
                  setLengthDialog("next");
                }
              : undefined
          }
          planNextDisabled={pending}
          onCloseCurrent={
            current ? () => setCloseOpen(true) : undefined
          }
          closeCurrentDisabled={pending}
          actions={
            <>
              {viewing && board.showTime ? (
                <div
                  className="flex items-center gap-2"
                  title={
                    capacityHours == null
                      ? `${formatWorkHours(estimateSum)} planned`
                      : `${formatWorkHours(estimateSum)} / ${formatWorkHours(capacityHours)}`
                  }
                >
                  <div
                    className="h-1.5 w-24 overflow-hidden rounded-full bg-bg-muted"
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
                          capacityHours == null ? "0%" : `${capacityFillPct}%`,
                      }}
                    />
                  </div>
                  <span
                    className={`text-[13px] tabular-nums ${
                      overCapacity ? "text-danger" : "text-text-primary"
                    }`}
                  >
                    {formatWorkHours(estimateSum)}
                  </span>
                  <span className="text-[13px] text-text-tertiary">/</span>
                  {canPlanScope && editingCapacity ? (
                    <label className="inline-flex items-center gap-0.5 rounded-md bg-bg-muted px-1.5 py-0.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoFocus
                        disabled={pending}
                        aria-label="Sprint capacity in hours"
                        value={capacityDraft}
                        onChange={(event) => setCapacityDraft(event.target.value)}
                        onBlur={() => commitCapacity(capacityDraft)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitCapacity(capacityDraft);
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setCapacityDraft(
                              capacityHours == null ? "" : String(capacityHours)
                            );
                            setEditingCapacity(false);
                          }
                        }}
                        className="w-10 border-0 bg-transparent p-0 text-right text-caption tabular-nums text-text-primary focus:outline-none disabled:opacity-50"
                      />
                      <span className="text-caption text-text-tertiary">h</span>
                    </label>
                  ) : canPlanScope ? (
                    <button
                      type="button"
                      disabled={pending}
                      aria-label={
                        capacityHours == null
                          ? "Set capacity"
                          : `Capacity ${formatWorkHours(capacityHours)}`
                      }
                      title={
                        capacityHours == null
                          ? "Set capacity"
                          : `Capacity ${formatWorkHours(capacityHours)} · click to edit`
                      }
                      onClick={() => setEditingCapacity(true)}
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-caption tabular-nums transition-colors disabled:opacity-50 ${
                        capacityHours == null
                          ? "text-text-tertiary hover:bg-bg-muted hover:text-text-secondary"
                          : "bg-bg-muted text-text-secondary hover:bg-border-subtle hover:text-text-primary"
                      }`}
                    >
                      {capacityHours == null
                        ? "Capacity"
                        : formatWorkHours(capacityHours)}
                    </button>
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-bg-muted px-1.5 py-0.5 text-caption tabular-nums text-text-secondary">
                      {capacityHours == null
                        ? "—"
                        : formatWorkHours(capacityHours)}
                    </span>
                  )}
                </div>
              ) : null}
              {!current ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setPlanStartsOn(new Date().toISOString().slice(0, 10));
                    setPlanLengthWeeks(2);
                    setPlanTitleDraft("");
                    setPlanCapacityDraft("");
                    setLengthDialog("start");
                  }}
                >
                  Start sprint
                </Button>
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
            titleEditable={
              viewing && canPlanScope
                ? {
                    number: viewing.number,
                    draft: titleDraft,
                    savedTitle: viewing.title,
                    editing: editingTitle,
                    disabled: pending,
                    onEditingChange: setEditingTitle,
                    onDraftChange: setTitleDraft,
                    onCommit: commitSprintTitle,
                  }
                : undefined
            }
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

      {lengthDialog && (lengthDialog === "start" || current) ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-bg-default p-5 shadow-lg">
            <h3 className="text-heading-s text-text-primary">
              {lengthDialog === "start"
                ? "Start sprint"
                : upcomingSprints.length > 0
                  ? "Plan another sprint"
                  : "Plan next sprint"}
            </h3>
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
                onClick={() => setLengthDialog(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={pending || planLengthWeeks < 1 || !planStartsOn}
                onClick={() => {
                  const mode = lengthDialog;
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
                  setLengthDialog(null);
                  run(async () => {
                    if (mode === "start") {
                      const result = await createWorkSprintAction(board.id, {
                        as: "current",
                        startsOn,
                        lengthDays: planLengthWeeks * 7,
                        capacityHours: capacity,
                        title,
                      });
                      if (!result.ok) return result;
                      onSprintsChange([result.sprint, ...sprints]);
                      setViewingId(result.sprint.id);
                      return { ok: true };
                    }
                    if (!current) {
                      return { ok: false, error: "No current sprint" };
                    }
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
                {lengthDialog === "start" ? "Start sprint" : "Create sprint"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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
  titleEditable,
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
  titleEditable?: {
    number: number;
    draft: string;
    savedTitle: string;
    editing: boolean;
    disabled?: boolean;
    onEditingChange: (editing: boolean) => void;
    onDraftChange: (value: string) => void;
    onCommit: (value: string) => void;
  };
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
  onOpenIssue: (issueId: string) => void;
  onEstimateChange: (issueId: string, value: number | null) => void;
  onTypeChange: (issueId: string, issueType: WorkIssueType) => void;
  onSetOwner: (issueId: string, person: WorkPerson | null) => void;
  onAddAssignee: (issueId: string, person: WorkPerson) => void;
  onRemoveAssignee: (issueId: string, person: WorkPerson) => void;
  onError: (message: string) => void;
  warnBlocked?: WorkIssue[];
  board?: WorkBoardView;
  onDragStart: (event: DragEvent, issueId: string) => void;
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

  function renderIssue(issue: WorkIssue, key: string) {
    // Keep grip mounted whenever the column supports drag so pending transitions
    // don't remove it and make rows jump.
    const showGrip = draggableCards;
    const canDrag = draggableCards && !pending;
    return (
      <li
        key={key}
        className="flex items-stretch gap-0.5 rounded-lg border border-border-subtle bg-bg-default"
      >
        {showGrip ? (
          <span
            draggable={canDrag}
            title={canDrag ? "Drag to move" : undefined}
            aria-label={canDrag ? `Drag ${issue.key}` : undefined}
            aria-hidden={!canDrag}
            onDragStart={
              canDrag
                ? (event) => {
                    const row = event.currentTarget.closest("li");
                    if (row instanceof HTMLElement) {
                      event.dataTransfer.setDragImage(row, 16, 16);
                    }
                    onDragStart(event, issue.id);
                  }
                : undefined
            }
            onDragEnd={canDrag ? onDragEnd : undefined}
            className={`inline-flex w-6 shrink-0 items-center justify-center px-1 text-text-tertiary ${
              canDrag
                ? "cursor-grab hover:text-text-secondary active:cursor-grabbing"
                : "pointer-events-none opacity-40"
            }`}
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden />
          </span>
        ) : null}
        <div
          className={`flex min-w-0 flex-1 items-center gap-1 py-2 ${
            showGrip ? "pr-1 pl-0.5" : "pl-2 pr-1"
          }`}
        >
          <WorkCardTypeBadge
            issueType={issue.issueType}
            disabled={estimateDisabled}
            onChange={(issueType) => onTypeChange(issue.id, issueType)}
          />
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => onOpenIssue(issue.id)}
          >
            <span className="flex min-w-0 items-center gap-2 text-sm leading-6 text-text-primary">
              <span className="shrink-0 tabular-nums text-text-tertiary">
                {issue.key}
              </span>
              <WorkCardPreDeployHint actions={issue.preDeployActions} />
              <span className="min-w-0 flex-1 truncate">{issue.title}</span>
            </span>
            {blockedIds.has(issue.id) ? (
              <span className="mt-0.5 block text-caption leading-snug text-danger">
                Blocked by work outside this sprint or not done
              </span>
            ) : null}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 py-2 pr-2">
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
          {board?.showTime !== false ? (
            <div className="flex w-14 shrink-0 justify-end">
              <WorkCardEstimate
                estimateHours={issue.estimateHours}
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
      className={`flex min-h-0 flex-col transition-colors ${
        embedded
          ? `min-h-0 bg-bg-default ${
              dropActive ? "bg-accent-primary-subtle/40" : ""
            }`
          : `rounded-xl border bg-bg-muted/40 ${
              dropActive
                ? "border-brand-signal bg-accent-primary-subtle/40"
                : "border-border-subtle"
            }`
      }`}
      onDragOver={(event) => {
        if (!canDrop) return;
        onDragOver(event);
      }}
      onDragLeave={onDragLeave}
      onDrop={(event) => {
        if (!canDrop) return;
        onDrop(event);
      }}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2">
        {titleEditable ? (
          <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span className="shrink-0 text-sm font-medium text-text-primary">
              Sprint {titleEditable.number}
            </span>
            {titleEditable.editing ? (
              <input
                type="text"
                autoFocus
                disabled={titleEditable.disabled}
                value={titleEditable.draft}
                maxLength={WORK_SPRINT_TITLE_MAX_LENGTH}
                aria-label="Sprint name"
                placeholder="Name"
                onChange={(event) =>
                  titleEditable.onDraftChange(event.target.value)
                }
                onBlur={() => titleEditable.onCommit(titleEditable.draft)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    titleEditable.onCommit(titleEditable.draft);
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    titleEditable.onDraftChange(titleEditable.savedTitle);
                    titleEditable.onEditingChange(false);
                  }
                }}
                className="min-w-0 flex-1 rounded-md border border-border-subtle bg-bg-default px-1.5 py-0.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-signal disabled:opacity-50"
              />
            ) : (
              <button
                type="button"
                disabled={titleEditable.disabled}
                title="Rename sprint"
                onClick={() => titleEditable.onEditingChange(true)}
                className={`min-w-0 truncate text-left text-sm font-medium disabled:opacity-50 ${
                  titleEditable.draft.trim()
                    ? "text-text-primary hover:text-text-secondary"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                {titleEditable.draft.trim()
                  ? `· ${titleEditable.draft.trim()}`
                  : "· Add name"}
              </button>
            )}
          </div>
        ) : (
          <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
            {title}
          </h3>
        )}
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
                    showTime={board?.showTime}
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
