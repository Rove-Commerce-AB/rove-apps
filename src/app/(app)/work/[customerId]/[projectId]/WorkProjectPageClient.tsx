"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type DragEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import {
  GripVertical,
  Link2,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import {
  Button,
  ConfirmModal,
  Dialog,
  IconButton,
  Input,
  Select,
  SideDrawer,
} from "@/components/ui";
import { SetWorkTrail } from "@/components/WorkTrailContext";
import { workBoardHref, workCustomerHref, workIssueHref } from "@/lib/routes";
import type {
  WorkIssue,
  WorkBoardView,
  WorkIssueType,
  WorkPerson,
  WorkSprint,
} from "@/lib/workTypes";
import type { WorkBoardStatus, WorkIssueStatus } from "@/lib/workStatuses";
import {
  clearOptimisticIssuePatch,
  mergeIssuesFromServer,
  noteOptimisticIssuePatch,
  type OptimisticIssuePatches,
  type WorkIssueOptimisticPatch,
} from "@/lib/workIssueMerge";
import {
  addWorkBoardMemberAction,
  addWorkIssueAssigneeAction,
  removeWorkIssueAssigneeAction,
  archiveWorkBoardAction,
  createWorkBoardStatusAction,
  createWorkIssueAction,
  deleteWorkBoardStatusAction,
  createWorkComponentAction,
  deleteWorkComponentAction,
  renameWorkComponentAction,
  moveWorkIssueAction,
  renameWorkBoardAction,
  renameWorkBoardStatusAction,
  removeWorkBoardMemberAction,
  reorderWorkBoardStatusesAction,
  reorderWorkIssuesInStatusAction,
  linkWorkProjectToPlannerProjectAction,
  setWorkProjectEstimateUnitAction,
  hideDoneIssuesFromBoardAction,
  unhideHiddenIssuesFromBoardAction,
  setWorkProjectPreferredViewAction,
  updateWorkIssueEstimateAction,
  updateWorkIssueOwnerAction,
  updateWorkIssueTypeAction,
} from "../../actions";
import { formatWorkEstimate } from "@/lib/workEstimate";
import type { WorkEstimateUnit } from "@/lib/workEstimate";
import type { BillingCurrency } from "@/lib/currency";
import {
  workStatusAccent,
  workStatusColumnBackground,
  workStatusToneById,
} from "@/lib/workStatusColors";
import {
  startWorkCardDragGhost,
  waitForPaint,
  type WorkCardDragGhost,
} from "@/lib/workCardDragGhost";
import {
  collectBoardComponents,
  collectOwnerFilterPeople,
  columnIssueGroups,
  sortWorkIssuesForColumn,
  visibleWorkIssueIds,
  workColumnSortLabel,
  type WorkBoardGroupBy,
  type WorkBoardPriorityFilterId,
  type WorkColumnSortBy,
} from "@/lib/workBoardView";
import {
  issueScrollElFromPoint,
  startDragAutoScroll,
  type DragAutoScrollController,
} from "@/lib/workDragAutoScroll";
import { WorkBoardMembers } from "./WorkBoardMembers";
import {
  WorkBoardViewControls,
  WorkCardComponent,
  WorkCardLabels,
  WorkCardPreDeployHint,
  WorkCardTypeBadge,
  WorkColumnGroupHeader,
} from "./WorkBoardViewControls";
import { WorkCardPeople, WorkIssueDrawer } from "./WorkIssueDrawer";
import { WorkIssueTypePicker } from "./WorkIssueTypeIcon";
import {
  WorkProjectSettingsDrawer,
  type WorkProjectSettingsTab,
} from "./WorkProjectSettingsDrawer";
import { WorkJiraImportDialog } from "./WorkJiraImportDialog";
import { WorkCardEstimate } from "./WorkCardEstimate";
import { WorkSprintPicker } from "./WorkSprintPicker";
import { WorkSprintView } from "./WorkSprintView";
import { WorkTimelineView } from "./WorkTimelineView";
import { WorkTimeGraph } from "./WorkTimeGraph";
import { isIssueBlocked } from "@/lib/workIssueRelations";

type BoardMode = "board" | "sprint" | "timeline";

function NewIssueTitleField({
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onSubmit();
        }
      }}
      placeholder="Title"
      aria-label="New issue title"
      autoFocus
      className="box-border min-h-[2.25rem] min-w-0 flex-1 resize-none overflow-hidden rounded-lg border border-form bg-bg-default px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-brand-signal focus:outline-none focus:ring-1 focus:ring-inset focus:ring-brand-signal"
    />
  );
}

type Props = {
  board: WorkBoardView;
  initialView?: BoardMode;
};

const renameFieldClass =
  "min-w-0 -mx-1 rounded-md bg-bg-default px-1 text-text-primary outline-none focus:ring-2 focus:ring-inset focus:ring-brand-signal/20";

function issuesInStatus(issues: WorkIssue[], status: WorkIssueStatus) {
  return issues
    .filter((issue) => issue.status === status)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.number - b.number);
}

function computeMove(
  issues: WorkIssue[],
  issueId: string,
  status: WorkIssueStatus,
  beforeIssueId: string | null,
  visibleIds: Set<string>,
  options?: { prependOnEnter?: boolean }
): { issues: WorkIssue[]; orderedIds: string[] } | null {
  const moving = issues.find((issue) => issue.id === issueId);
  if (!moving) return null;
  const rest = issues
    .filter((issue) => issue.id !== issueId)
    .map((issue) => ({ ...issue }));
  const inStatus = issuesInStatus(rest, status).filter((issue) =>
    visibleIds.has(issue.id)
  );
  // Hidden Done cards stay in DB but must not affect insert position.
  const column = inStatus.filter((issue) => !issue.hiddenFromBoard);
  const hiddenInColumn = inStatus.filter((issue) => issue.hiddenFromBoard);
  const enteringColumn = moving.status !== status;
  const insertAt = beforeIssueId
    ? Math.max(
        0,
        column.findIndex((issue) => issue.id === beforeIssueId)
      )
    : enteringColumn && options?.prependOnEnter
      ? 0
      : column.length;
  const safeIndex = insertAt < 0 ? column.length : insertAt;
  const moved = {
    ...moving,
    status,
    sortOrder: safeIndex,
    hiddenFromBoard: false,
  };
  const orderedIds = [
    ...column.slice(0, safeIndex),
    moved,
    ...column.slice(safeIndex),
    ...hiddenInColumn,
  ].map((issue) => issue.id);
  if (moving.status === status) {
    const previousIds = [
      ...column.map((issue) => issue.id),
      ...hiddenInColumn.map((issue) => issue.id),
    ];
    if (
      previousIds.length === orderedIds.length &&
      previousIds.every((id, index) => id === orderedIds[index])
    ) {
      return null;
    }
  }
  return {
    orderedIds,
    issues: [...rest, moved].map((issue) => {
      const index = orderedIds.indexOf(issue.id);
      if (issue.id === issueId) return { ...moved, sortOrder: index };
      if (index >= 0) return { ...issue, status, sortOrder: index };
      return issue;
    }),
  };
}



export function WorkBoardPageClient({
  board,
  initialView = "board",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedIssueId = pathname.split("/").filter(Boolean)[3] ?? null;
  const selectedIssueTab = searchParams.get("tab") ?? "details";
  const [pending, startTransition] = useTransition();
  const [issues, setIssues] = useState(board.issues);
  const [sprints, setSprints] = useState<WorkSprint[]>(board.sprints);
  const [boardMode, setBoardMode] = useState<BoardMode>(initialView);
  const [search, setSearch] = useState("");
  const [ownerFilterIds, setOwnerFilterIds] = useState<string[]>([]);
  const [typeFilterIds, setTypeFilterIds] = useState<WorkIssueType[]>([]);
  const [componentFilterIds, setComponentFilterIds] = useState<string[]>([]);
  const [priorityFilterIds, setPriorityFilterIds] = useState<
    WorkBoardPriorityFilterId[]
  >([]);
  const [sprintFilterIds, setSprintFilterIds] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<WorkBoardGroupBy>("none");
  const [components, setComponents] = useState(board.components);
  const [dragOverStatus, setDragOverStatus] = useState<WorkIssueStatus | null>(
    null
  );
  const [issueDropBefore, setIssueDropBefore] = useState<{
    status: WorkIssueStatus;
    beforeIssueId: string | null;
  } | null>(null);
  const [landingIssueId, setLandingIssueId] = useState<string | null>(null);
  const dragIssueIdRef = useRef<string | null>(null);
  const dragGhostRef = useRef<WorkCardDragGhost | null>(null);
  const dragSourceRef = useRef<HTMLElement | null>(null);
  const dragSourceStatusRef = useRef<WorkIssueStatus | null>(null);
  const skipCardClickRef = useRef(false);
  const dropTargetRef = useRef<{
    issueId: string;
    status: WorkIssueStatus;
    beforeIssueId: string | null;
  } | null>(null);
  const issuesRef = useRef(board.issues);
  const optimisticPatchesRef = useRef<OptimisticIssuePatches>(new Map());
  const [addingStatus, setAddingStatus] = useState<WorkIssueStatus | null>(
    null
  );
  const [draftTitle, setDraftTitle] = useState("");
  const [draftIssueType, setDraftIssueType] = useState<WorkIssueType>("issue");
  const addIssueFormRef = useRef<HTMLFormElement>(null);

  function cancelAddingIssue() {
    setAddingStatus(null);
    setDraftTitle("");
    setDraftIssueType("issue");
  }

  useEffect(() => {
    if (addingStatus == null) return;

    function onPointerDown(event: PointerEvent) {
      const form = addIssueFormRef.current;
      if (
        form &&
        event.target instanceof Node &&
        form.contains(event.target)
      ) {
        return;
      }
      cancelAddingIssue();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancelAddingIssue();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [addingStatus]);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState(board.members);
  const [statuses, setStatuses] = useState(board.statuses);
  const [addingColumn, setAddingColumn] = useState(false);
  const [columnDraft, setColumnDraft] = useState("");
  const [deletingStatus, setDeletingStatus] = useState<WorkBoardStatus | null>(
    null
  );
  const [moveToStatusId, setMoveToStatusId] = useState("");
  const [statusMenu, setStatusMenu] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const [boardTitle, setBoardTitle] = useState(board.title);
  const [plannerProjectId, setPlannerProjectId] = useState(
    board.plannerProjectId
  );
  const [plannerProjectName, setPlannerProjectName] = useState(
    board.plannerProjectName
  );
  const [estimateUnit, setEstimateUnit] = useState<WorkEstimateUnit>(
    board.estimateUnit
  );
  const [billingCurrency, setBillingCurrency] = useState<BillingCurrency>(
    board.billingCurrency
  );
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] =
    useState<WorkProjectSettingsTab>("details");
  const [jiraImportOpen, setJiraImportOpen] = useState(false);
  const [doneCardMotion, setDoneCardMotion] = useState<{
    mode: "hiding" | "showing";
    ids: string[];
  } | null>(null);
  const doneCardMotionTimerRef = useRef<number | null>(null);
  const [renamingStatusId, setRenamingStatusId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [draggingStatusId, setDraggingStatusId] = useState<string | null>(null);
  const [statusInsertBeforeId, setStatusInsertBeforeId] = useState<
    string | null | undefined
  >(undefined);
  const statusesRef = useRef(board.statuses);
  const draggingStatusIdRef = useRef<string | null>(null);
  const statusInsertBeforeRef = useRef<string | null>(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const dragAutoScrollRef = useRef<DragAutoScrollController | null>(null);
  const spacePanRef = useRef({
    spaceDown: false,
    panning: false,
    startX: 0,
    startScrollLeft: 0,
  });
  const [spacePanCursor, setSpacePanCursor] = useState<
    "grab" | "grabbing" | null
  >(null);

  function stopDragAutoScroll() {
    dragAutoScrollRef.current?.stop();
    dragAutoScrollRef.current = null;
  }

  function ensureDragAutoScroll() {
    if (!dragAutoScrollRef.current) {
      dragAutoScrollRef.current = startDragAutoScroll();
    }
    return dragAutoScrollRef.current;
  }

  function updateDragAutoScroll(
    clientX: number,
    clientY: number,
    mode: "issue" | "status"
  ) {
    const controller = ensureDragAutoScroll();
    controller.setPointer(clientX, clientY);
    const targets: { el: HTMLElement; axis: "x" | "y" }[] = [];
    const boardEl = boardScrollRef.current;
    if (boardEl) targets.push({ el: boardEl, axis: "x" });
    if (mode === "issue") {
      const columnScroll = issueScrollElFromPoint(clientX, clientY);
      if (columnScroll) targets.push({ el: columnScroll, axis: "y" });
    }
    controller.setTargets(targets);
  }

  useEffect(() => {
    return () => stopDragAutoScroll();
  }, []);

  useEffect(() => {
    if (boardMode !== "board") {
      spacePanRef.current.spaceDown = false;
      spacePanRef.current.panning = false;
      setSpacePanCursor(null);
      return;
    }

    function isEditableTarget(target: EventTarget | null) {
      if (!(target instanceof Element)) return false;
      return (
        target.closest(
          "input, textarea, select, [contenteditable='true'], [role='textbox']"
        ) != null
      );
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space" && event.key !== " ") return;
      if (event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      spacePanRef.current.spaceDown = true;
      setSpacePanCursor((current) =>
        current === "grabbing" ? current : "grab"
      );
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.code !== "Space" && event.key !== " ") return;
      spacePanRef.current.spaceDown = false;
      setSpacePanCursor(spacePanRef.current.panning ? "grabbing" : null);
    }

    function onWindowBlur() {
      spacePanRef.current.spaceDown = false;
      if (!spacePanRef.current.panning) setSpacePanCursor(null);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [boardMode]);

  useEffect(() => {
    setIssues((current) => {
      const next = mergeIssuesFromServer(
        current,
        board.issues,
        optimisticPatchesRef.current
      );
      issuesRef.current = next;
      return next;
    });
  }, [board.issues]);

  useEffect(() => {
    setComponents(board.components);
  }, [board.components]);

  useEffect(() => {
    setSprints(board.sprints);
  }, [board.sprints]);

  useEffect(() => {
    const valid = new Set(sprints.map((sprint) => sprint.id));
    setSprintFilterIds((ids) => {
      const next = ids.filter((id) => valid.has(id));
      return next.length === ids.length ? ids : next;
    });
  }, [sprints]);

  useEffect(() => {
    setMembers(board.members);
  }, [board.members]);

  useEffect(() => {
    statusesRef.current = board.statuses;
    setStatuses(board.statuses);
  }, [board.statuses]);

  useEffect(() => {
    setEstimateUnit(board.estimateUnit);
    setBillingCurrency(board.billingCurrency);
  }, [board.estimateUnit, board.billingCurrency]);

  useEffect(() => {
    setBoardTitle(board.title);
  }, [board.title]);

  useEffect(() => {
    setPlannerProjectId(board.plannerProjectId);
    setPlannerProjectName(board.plannerProjectName);
  }, [board.plannerProjectId, board.plannerProjectName]);

  useEffect(() => {
    if (!statusMenu) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-status-menu]")) {
        return;
      }
      setStatusMenu(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [statusMenu]);

  const selected = issues.find((issue) => issue.id === selectedIssueId) ?? null;
  const deletingIssueCount = deletingStatus
    ? issues.filter((issue) => issue.status === deletingStatus.id).length
    : 0;
  const ownerPeople = useMemo(
    () => collectOwnerFilterPeople(board.people, issues),
    [board.people, issues]
  );
  const filterComponents = useMemo(
    () => collectBoardComponents(components, issues),
    [components, issues]
  );
  const orderedSprints = useMemo(
    () => sprints.slice().sort((a, b) => a.number - b.number),
    [sprints]
  );

  const visibleIds = useMemo(
    () =>
      visibleWorkIssueIds(issues, search, {
        ownerIds: ownerFilterIds,
        typeIds: typeFilterIds,
        componentIds: componentFilterIds,
        priorityIds: priorityFilterIds,
        sprintIds: sprintFilterIds,
      }),
    [
      issues,
      search,
      ownerFilterIds,
      typeFilterIds,
      componentFilterIds,
      priorityFilterIds,
      sprintFilterIds,
    ]
  );

  const statusTones = useMemo(
    () => workStatusToneById(board.customerColor, statuses),
    [board.customerColor, statuses]
  );

  function clearDoneCardMotionTimer() {
    if (doneCardMotionTimerRef.current != null) {
      window.clearTimeout(doneCardMotionTimerRef.current);
      doneCardMotionTimerRef.current = null;
    }
  }

  function doneCardMotionDurationMs(
    mode: "hiding" | "showing",
    count: number
  ) {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return 0;
    }
    const stagger = mode === "hiding" ? 35 : 40;
    const base = mode === "hiding" ? 260 : 300;
    return base + Math.max(0, count - 1) * stagger;
  }

  function hideDoneIssuesFromBoard(status: WorkIssueStatus) {
    if (doneCardMotion) return;
    const ids = issuesRef.current
      .filter(
        (issue) =>
          issue.status === status &&
          visibleIds.has(issue.id) &&
          !issue.hiddenFromBoard
      )
      .map((issue) => issue.id);
    if (ids.length === 0) return;

    clearDoneCardMotionTimer();
    setDoneCardMotion({ mode: "hiding", ids });
    setError(null);
    void hideDoneIssuesFromBoardAction(board.id).then((result) => {
      if (result.ok) return;
      clearDoneCardMotionTimer();
      setDoneCardMotion(null);
      setError(result.error);
      router.refresh();
    });

    doneCardMotionTimerRef.current = window.setTimeout(() => {
      doneCardMotionTimerRef.current = null;
      setIssues((current) => {
        const next = current.map((issue) =>
          ids.includes(issue.id) ? { ...issue, hiddenFromBoard: true } : issue
        );
        issuesRef.current = next;
        return next;
      });
      setDoneCardMotion(null);
      router.refresh();
    }, doneCardMotionDurationMs("hiding", ids.length));
  }

  function showHiddenDoneIssuesFromBoard() {
    if (doneCardMotion) return;
    const ids = issuesRef.current
      .filter((issue) => issue.hiddenFromBoard && visibleIds.has(issue.id))
      .map((issue) => issue.id);
    if (ids.length === 0) return;

    clearDoneCardMotionTimer();
    setIssues((current) => {
      const next = current.map((issue) =>
        ids.includes(issue.id) ? { ...issue, hiddenFromBoard: false } : issue
      );
      issuesRef.current = next;
      return next;
    });
    setDoneCardMotion({ mode: "showing", ids });
    setError(null);
    void unhideHiddenIssuesFromBoardAction(board.id).then((result) => {
      if (result.ok) {
        router.refresh();
        return;
      }
      setError(result.error);
      router.refresh();
    });

    doneCardMotionTimerRef.current = window.setTimeout(() => {
      doneCardMotionTimerRef.current = null;
      setDoneCardMotion(null);
    }, doneCardMotionDurationMs("showing", ids.length));
  }

  useEffect(() => {
    return () => clearDoneCardMotionTimer();
  }, []);

  function openIssue(issueId: string, options?: { tab?: string }) {
    router.push(
      workIssueHref(board.customerId, board.id, issueId, options),
      { scroll: false }
    );
  }

  function closeIssue() {
    // Ensure drawer field blur handlers (estimate, title, …) flush before unmount.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    router.push(workBoardHref(board.customerId, board.id), { scroll: false });
  }

  function moveIssue(
    issueId: string,
    status: WorkIssueStatus,
    beforeIssueId: string | null
  ) {
    const targetIsDone =
      statuses.find((column) => column.id === status)?.isDone ?? false;
    const result = computeMove(
      issuesRef.current,
      issueId,
      status,
      beforeIssueId,
      visibleIds,
      { prependOnEnter: targetIsDone }
    );
    if (!result) return;
    const nextIssues = targetIsDone
      ? result.issues
      : result.issues.map((issue) =>
          issue.id === issueId ? { ...issue, hiddenFromBoard: false } : issue
        );
    issuesRef.current = nextIssues;
    setIssues(nextIssues);
    setError(null);
    void moveWorkIssueAction({
      boardId: board.id,
      issueId,
      status,
      issueIds: result.orderedIds,
    }).then((actionResult) => {
      if (actionResult.ok) return;
      issuesRef.current = board.issues;
      setError(actionResult.error);
      setIssues(board.issues);
    });
  }

  function sortStatusColumn(status: WorkIssueStatus, sortBy: WorkColumnSortBy) {
    setStatusMenu(null);
    const columnIssues = issuesInStatus(issuesRef.current, status);
    if (columnIssues.length < 2) return;
    const sorted = sortWorkIssuesForColumn(columnIssues, sortBy);
    const orderedIds = sorted.map((issue) => issue.id);
    const unchanged = orderedIds.every(
      (id, index) => columnIssues[index]?.id === id
    );
    if (unchanged) return;
    const orderById = new Map(orderedIds.map((id, index) => [id, index]));
    const next = issuesRef.current.map((issue) => {
      const sortOrder = orderById.get(issue.id);
      return sortOrder == null ? issue : { ...issue, sortOrder };
    });
    const previous = issuesRef.current;
    issuesRef.current = next;
    setIssues(next);
    setError(null);
    void reorderWorkIssuesInStatusAction({
      boardId: board.id,
      status,
      issueIds: orderedIds,
    }).then((actionResult) => {
      if (actionResult.ok) return;
      issuesRef.current = previous;
      setIssues(previous);
      setError(actionResult.error);
    });
  }

  function moveStatus(statusId: string, beforeStatusId: string | null) {
    if (statusId === beforeStatusId) return;
    const list = statusesRef.current;
    const current = list.find((status) => status.id === statusId);
    if (!current) return;
    const rest = list.filter((status) => status.id !== statusId);
    const insertAt = beforeStatusId
      ? rest.findIndex((status) => status.id === beforeStatusId)
      : rest.length;
    const safeIndex = insertAt < 0 ? rest.length : insertAt;
    const next = [
      ...rest.slice(0, safeIndex),
      current,
      ...rest.slice(safeIndex),
    ].map((status, index) => ({ ...status, sortOrder: index }));
    if (next.every((status, index) => status.id === list[index]?.id)) return;
    statusesRef.current = next;
    setStatuses(next);
    void reorderWorkBoardStatusesAction(
      board.id,
      next.map((status) => status.id)
    ).then((result) => {
      if (result.ok) return;
      statusesRef.current = board.statuses;
      setStatuses(board.statuses);
      setError(result.error);
    });
  }

  function clearStatusDrag() {
    draggingStatusIdRef.current = null;
    statusInsertBeforeRef.current = null;
    setDraggingStatusId(null);
    setStatusInsertBeforeId(undefined);
    stopDragAutoScroll();
  }

  function setStatusInsertHint(beforeId: string | null) {
    statusInsertBeforeRef.current = beforeId;
    setStatusInsertBeforeId((current) =>
      current === beforeId ? current : beforeId
    );
  }

  function statusInsertBeforeFromPoint(
    columnId: string,
    clientX: number,
    columnEl: HTMLElement
  ) {
    const rect = columnEl.getBoundingClientRect();
    const after = clientX > rect.left + rect.width / 2;
    const ids = statusesRef.current.map((status) => status.id);
    const index = ids.indexOf(columnId);
    if (!after) return columnId;
    return ids[index + 1] ?? null;
  }

  function handleStatusDragOver(
    event: DragEvent,
    columnId: string | null
  ) {
    if (!draggingStatusIdRef.current) return false;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    updateDragAutoScroll(event.clientX, event.clientY, "status");
    if (columnId == null) {
      setStatusInsertHint(null);
      return true;
    }
    const columnEl =
      event.currentTarget instanceof HTMLElement
        ? event.currentTarget.closest("section")
        : null;
    if (!(columnEl instanceof HTMLElement)) {
      setStatusInsertHint(columnId);
      return true;
    }
    setStatusInsertHint(
      statusInsertBeforeFromPoint(columnId, event.clientX, columnEl)
    );
    return true;
  }

  function handleStatusDrop(event: DragEvent) {
    const dragged =
      event.dataTransfer.getData("application/x-work-status") ||
      draggingStatusIdRef.current;
    if (
      !dragged ||
      !statusesRef.current.some((status) => status.id === dragged)
    ) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    const beforeId = statusInsertBeforeRef.current;
    clearStatusDrag();
    moveStatus(dragged, beforeId);
    return true;
  }

  async function submitNewColumn() {
    const trimmed = columnDraft.trim();
    if (!trimmed) {
      setAddingColumn(false);
      return;
    }
    const result = await createWorkBoardStatusAction(board.id, trimmed);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStatuses((current) => {
      const next = [...current, result.status];
      statusesRef.current = next;
      return next;
    });
    setColumnDraft("");
    setAddingColumn(false);
  }

  function openDeleteStatus(column: WorkBoardStatus) {
    const index = statuses.findIndex((status) => status.id === column.id);
    const fallback = statuses[index - 1] ?? statuses[index + 1];
    setStatusMenu(null);
    setDeletingStatus(column);
    setMoveToStatusId(fallback?.id ?? "");
  }

  function startRenameStatus(column: WorkBoardStatus) {
    setStatusMenu(null);
    setRenamingStatusId(column.id);
    setRenameDraft(column.name);
  }

  async function applyBoardRename(nextTitle: string): Promise<boolean> {
    const trimmed = nextTitle.trim();
    if (!trimmed || trimmed === boardTitle) return true;
    const previous = boardTitle;
    setBoardTitle(trimmed);
    const result = await renameWorkBoardAction(board.id, trimmed);
    if (result.ok) {
      setBoardTitle(result.title);
      return true;
    }
    setBoardTitle(previous);
    setError(result.error);
    return false;
  }

  function openProjectSettings(tab: WorkProjectSettingsTab = "details") {
    if (selectedIssueId) closeIssue();
    setSettingsTab(
      board.viewerRole === "customer" && tab === "danger" ? "details" : tab
    );
    setSettingsOpen(true);
  }

  async function confirmArchiveBoard() {
    setArchiveOpen(false);
    setSettingsOpen(false);
    setError(null);
    const result = await archiveWorkBoardAction(board.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(workCustomerHref(result.customerId));
  }

  async function submitRenameStatus() {
    const statusId = renamingStatusId;
    if (!statusId) return;
    const trimmed = renameDraft.trim();
    setRenamingStatusId(null);
    if (!trimmed) return;
    const current = statusesRef.current.find((status) => status.id === statusId);
    if (!current || current.name === trimmed) return;
    const previous = current.name;
    setStatuses((list) => {
      const next = list.map((status) =>
        status.id === statusId ? { ...status, name: trimmed } : status
      );
      statusesRef.current = next;
      return next;
    });
    const result = await renameWorkBoardStatusAction(
      board.id,
      statusId,
      trimmed
    );
    if (result.ok) return;
    setStatuses((list) => {
      const next = list.map((status) =>
        status.id === statusId ? { ...status, name: previous } : status
      );
      statusesRef.current = next;
      return next;
    });
    setError(result.error);
  }

  async function submitDeleteStatus() {
    if (!deletingStatus) return;
    const fromId = deletingStatus.id;
    const issueCount = issues.filter((issue) => issue.status === fromId).length;
    const destination = issueCount > 0 ? moveToStatusId : null;
    if (issueCount > 0 && !destination) {
      setError("Choose a status to move issues to");
      return;
    }
    const result = await deleteWorkBoardStatusAction(
      board.id,
      fromId,
      destination
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const nextStatuses = statusesRef.current
      .filter((status) => status.id !== fromId)
      .map((status, index) => ({ ...status, sortOrder: index }));
    statusesRef.current = nextStatuses;
    setStatuses(nextStatuses);
    if (destination) {
      setIssues((current) => {
        const destMax = current
          .filter((issue) => issue.status === destination)
          .reduce((max, issue) => Math.max(max, issue.sortOrder), -1);
        let nextOrder = destMax + 1;
        const next = current.map((issue) => {
          if (issue.status !== fromId) return issue;
          const moved = { ...issue, status: destination, sortOrder: nextOrder };
          nextOrder += 1;
          return moved;
        });
        issuesRef.current = next;
        return next;
      });
    }
    setDeletingStatus(null);
    setError(null);
  }

  function draggedIssueId(event: DragEvent) {
    const data =
      event.dataTransfer.getData("text/plain") || dragIssueIdRef.current;
    if (!data || data.startsWith("status:")) return null;
    return data;
  }

  function dropOnColumn(
    event: DragEvent,
    status: WorkIssueStatus,
    beforeIssueId: string | null
  ) {
    event.preventDefault();
    event.stopPropagation();
    const issueId = draggedIssueId(event);
    if (!issueId || issueId === beforeIssueId) {
      dropTargetRef.current = null;
      return;
    }
    dropTargetRef.current = { issueId, status, beforeIssueId };
  }

  function previewIssueDrop(
    event: DragEvent,
    status: WorkIssueStatus,
    beforeIssueId: string | null
  ) {
    if (draggingStatusIdRef.current || !dragIssueIdRef.current) return false;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    updateDragAutoScroll(event.clientX, event.clientY, "issue");
    const issueId = dragIssueIdRef.current;
    const nextTarget =
      issueId === beforeIssueId
        ? null
        : { issueId, status, beforeIssueId };
    dropTargetRef.current = nextTarget;
    const showLine =
      nextTarget != null &&
      computeMove(
        issuesRef.current,
        issueId,
        status,
        beforeIssueId,
        visibleIds
      ) != null;
    setIssueDropBefore((current) => {
      if (!showLine) return current == null ? current : null;
      if (
        current?.status === status &&
        current.beforeIssueId === beforeIssueId
      ) {
        return current;
      }
      return { status, beforeIssueId };
    });
    if (status !== dragSourceStatusRef.current && dragOverStatus !== status) {
      setDragOverStatus(status);
    }
    return true;
  }

  function insertBeforeFromPoint(listEl: HTMLElement | null, clientY: number) {
    if (!listEl) return null;
    const cards = listEl.querySelectorAll<HTMLElement>(":scope > [data-issue-id]");
    for (const card of cards) {
      const id = card.dataset.issueId;
      if (!id) continue;
      const rect = card.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return id;
    }
    return null;
  }

  function issueListFromEvent(event: DragEvent): HTMLElement | null {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return null;
    if (target.matches("[data-issue-list]")) return target;
    const list =
      target.closest("[data-issue-list]") ??
      target.querySelector("[data-issue-list]");
    return list instanceof HTMLElement ? list : null;
  }

  function finishDrag() {
    const target = dropTargetRef.current;
    const source = dragSourceRef.current;
    const ghost = dragGhostRef.current;
    const issueId = dragIssueIdRef.current;
    dropTargetRef.current = null;
    dragIssueIdRef.current = null;
    dragSourceRef.current = null;
    dragSourceStatusRef.current = null;
    dragGhostRef.current = null;
    stopDragAutoScroll();
    setDragOverStatus(null);
    setIssueDropBefore(null);

    void (async () => {
      if (target && issueId) {
        setLandingIssueId(issueId);
        moveIssue(target.issueId, target.status, target.beforeIssueId);
        await waitForPaint(2);
        const landed = document.querySelector<HTMLElement>(
          `[data-issue-id="${CSS.escape(issueId)}"] [data-issue-card]`
        );
        if (ghost && landed) {
          const rect = landed.getBoundingClientRect();
          await ghost.landAt({
            left: rect.left,
            top: rect.top,
            width: rect.width,
          });
        } else if (ghost) {
          await ghost.dispose();
        }
        setLandingIssueId(null);
        if (source) source.style.opacity = "";
        return;
      }

      if (ghost && source?.isConnected) {
        const rect = source.getBoundingClientRect();
        await ghost.landAt({
          left: rect.left,
          top: rect.top,
          width: rect.width,
        });
        source.style.opacity = "";
        return;
      }

      if (ghost) await ghost.dispose();
      if (source) source.style.opacity = "";
    })();
  }

  async function submitNewIssue(status: WorkIssueStatus, title: string) {
    const trimmed = title.trim();
    if (!trimmed || !status) return;
    setError(null);
    const result = await createWorkIssueAction({
      boardId: board.id,
      title: trimmed,
      status,
      issueType: draftIssueType,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraftTitle("");
    setDraftIssueType("issue");
    setAddingStatus(null);
    router.refresh();
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <SetWorkTrail
        customerName={board.customerName}
        boardTitle={boardTitle}
        issueKey={selected?.key}
      />
      <header className="mb-6 flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="min-w-0 truncate text-heading-xl text-text-primary">
            {boardTitle}
          </h1>
          <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[13px]">
            {plannerProjectId ? (
              <button
                type="button"
                onClick={() => openProjectSettings("details")}
                className="inline-flex min-w-0 items-center gap-1.5 text-left text-text-secondary hover:text-text-primary"
                title="Open project settings"
              >
                <Link2
                  className="h-3.5 w-3.5 shrink-0 text-text-tertiary"
                  aria-hidden
                />
                <span className="min-w-0 truncate">
                  <span className="text-text-tertiary">Project · </span>
                  {plannerProjectName?.trim() || "Linked"}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openProjectSettings("details")}
                className="inline-flex items-center gap-1.5 text-text-tertiary hover:text-text-secondary"
                title="Link this Work project to a project"
              >
                <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Not linked to a project
              </button>
            )}
          </p>
        </div>
        <div className="mt-1 flex shrink-0 items-center gap-2">
          <div
            className="inline-flex rounded-md border border-border-subtle p-0.5"
            role="tablist"
            aria-label="Board view"
          >
            {(
              [
                ["board", "Board"],
                ["sprint", "Planning"],
                ["timeline", "Timeline"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={boardMode === mode}
                className={`rounded px-2.5 py-1 text-[13px] transition-colors ${
                  boardMode === mode
                    ? "bg-accent-primary-subtle text-accent-primary-text"
                    : "text-text-secondary hover:text-text-primary"
                }`}
                onClick={() => {
                  setBoardMode(mode);
                  void setWorkProjectPreferredViewAction(board.id, mode);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <IconButton
            aria-label="Project settings"
            title="Project settings"
            onClick={() => openProjectSettings()}
          >
            <Settings className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
      </header>

      <div className="mb-4 flex shrink-0 items-center gap-3">
        <WorkBoardMembers
          members={members}
          people={board.people}
          layout="summary"
          onOpenSettings={() => openProjectSettings("access")}
        />
        <div className="relative w-44 shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <Input
            type="search"
            size="compact"
            placeholder="Search…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search issues"
            className="h-7 py-0 pl-8 text-[13px]"
          />
        </div>
      </div>

      {error ? (
        <p className="mb-3 shrink-0 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {boardMode === "board" ? (
        <div className="mb-1.5 flex shrink-0 items-center gap-3">
          {orderedSprints.length > 0 ? (
            <WorkSprintPicker
              sprints={orderedSprints}
              selectedIds={sprintFilterIds}
              onChange={setSprintFilterIds}
              multi
            />
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            <WorkBoardViewControls
              people={ownerPeople}
              components={filterComponents}
              ownerFilterIds={ownerFilterIds}
              onOwnerFilterChange={setOwnerFilterIds}
              typeFilterIds={typeFilterIds}
              onTypeFilterChange={setTypeFilterIds}
              componentFilterIds={componentFilterIds}
              onComponentFilterChange={setComponentFilterIds}
              priorityFilterIds={priorityFilterIds}
              onPriorityFilterChange={setPriorityFilterIds}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
            />
          </div>
        </div>
      ) : null}

      {boardMode === "sprint" ? (
        <WorkSprintView
          board={{
            ...board,
            issues,
            sprints,
            estimateUnit,
            billingCurrency,
          }}
          issues={issues}
          sprints={sprints}
          doneStatusIds={new Set(statuses.filter((s) => s.isDone).map((s) => s.id))}
          onIssuesChange={(next) => {
            issuesRef.current = next;
            setIssues(next);
          }}
          onOptimisticIssuePatch={(issueId, patch) => {
            noteOptimisticIssuePatch(
              optimisticPatchesRef.current,
              issueId,
              patch
            );
          }}
          onSprintsChange={setSprints}
          onOpenIssue={(issueId, options) => openIssue(issueId, options)}
          onError={setError}
          onChanged={() => router.refresh()}
        />
      ) : boardMode === "timeline" ? (
        <WorkTimelineView
          board={{
            ...board,
            issues,
            sprints,
            estimateUnit,
            billingCurrency,
          }}
          issues={issues}
          sprints={sprints}
          onIssuesChange={(next) => {
            issuesRef.current = next;
            setIssues(next);
          }}
          onOpenIssue={(issueId, options) => openIssue(issueId, options)}
          onError={setError}
          onChanged={() => router.refresh()}
        />
      ) : (
      <div
        ref={boardScrollRef}
        data-work-board-scroll
        style={
          {
            "--work-customer-color": board.customerColor,
          } as CSSProperties
        }
        className={`flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto overflow-y-hidden ${
          spacePanCursor === "grabbing"
            ? "cursor-grabbing select-none [&_*]:!cursor-grabbing"
            : spacePanCursor === "grab"
              ? "cursor-grab [&_*]:!cursor-grab"
              : ""
        }`}
        onPointerDown={(event) => {
          if (!spacePanRef.current.spaceDown) return;
          if (event.button !== 0) return;
          if (dragIssueIdRef.current || draggingStatusIdRef.current) return;
          const el = boardScrollRef.current;
          if (!el) return;
          event.preventDefault();
          event.stopPropagation();
          spacePanRef.current.panning = true;
          spacePanRef.current.startX = event.clientX;
          spacePanRef.current.startScrollLeft = el.scrollLeft;
          el.setPointerCapture(event.pointerId);
          setSpacePanCursor("grabbing");
        }}
        onPointerMove={(event) => {
          if (!spacePanRef.current.panning) return;
          const el = boardScrollRef.current;
          if (!el) return;
          el.scrollLeft =
            spacePanRef.current.startScrollLeft -
            (event.clientX - spacePanRef.current.startX);
        }}
        onPointerUp={(event) => {
          if (!spacePanRef.current.panning) return;
          spacePanRef.current.panning = false;
          const el = boardScrollRef.current;
          if (el?.hasPointerCapture(event.pointerId)) {
            el.releasePointerCapture(event.pointerId);
          }
          setSpacePanCursor(spacePanRef.current.spaceDown ? "grab" : null);
        }}
        onPointerCancel={(event) => {
          if (!spacePanRef.current.panning) return;
          spacePanRef.current.panning = false;
          const el = boardScrollRef.current;
          if (el?.hasPointerCapture(event.pointerId)) {
            el.releasePointerCapture(event.pointerId);
          }
          setSpacePanCursor(spacePanRef.current.spaceDown ? "grab" : null);
        }}
        onDragOver={(event) => {
          if (draggingStatusIdRef.current) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            updateDragAutoScroll(event.clientX, event.clientY, "status");
            // Gap / padding left of the first column: treat as insert at start.
            const firstSection = event.currentTarget.querySelector("section");
            if (firstSection instanceof HTMLElement) {
              const firstId = statusesRef.current[0]?.id ?? null;
              if (
                firstId &&
                firstId !== draggingStatusIdRef.current &&
                event.clientX < firstSection.getBoundingClientRect().left + 16
              ) {
                setStatusInsertHint(firstId);
              }
            }
            return;
          }
          if (dragIssueIdRef.current) {
            event.preventDefault();
            updateDragAutoScroll(event.clientX, event.clientY, "issue");
          }
        }}
      >
        {statuses.map((column, columnIndex) => {
          const status = column.id;
          const allColumnIssues = issuesInStatus(issues, status).filter(
            (issue) => visibleIds.has(issue.id)
          );
          const isDone = column.isDone;
          const visibleColumnIssues = isDone
            ? allColumnIssues.filter((issue) => !issue.hiddenFromBoard)
            : allColumnIssues;
          const hiddenDoneCount = isDone
            ? allColumnIssues.filter((issue) => issue.hiddenFromBoard).length
            : 0;
          const columnIssues = visibleColumnIssues;
          const issueGroups = columnIssueGroups(columnIssues, groupBy);
          const columnEstimateSum = visibleColumnIssues.reduce(
            (sum, issue) => sum + (issue.estimateHours ?? 0),
            0
          );
          const isDragOver = dragOverStatus === status && !draggingStatusId;
          const isFirstColumn = columnIndex === 0;
          const isLastColumn = columnIndex === statuses.length - 1;
          const showInsertBefore =
            draggingStatusId != null &&
            statusInsertBeforeId === status &&
            draggingStatusId !== status;
          const showInsertAfter =
            draggingStatusId != null &&
            statusInsertBeforeId === null &&
            isLastColumn;
          const statusTone = statusTones[status] ?? {
            color: board.customerColor,
            mix: 14,
          };
          const statusAccent = workStatusAccent(statusTone);
          return (
            <section
              key={status}
              data-work-status-id={status}
              style={
                {
                  "--work-status-color": statusTone.color,
                  "--work-status-mix": String(statusTone.mix),
                  background: isDragOver
                    ? undefined
                    : workStatusColumnBackground(statusTone),
                } as CSSProperties
              }
              className={`relative flex h-full min-h-0 w-72 shrink-0 flex-col rounded-xl transition-colors ${
                draggingStatusId === status ? "opacity-40" : ""
              } ${
                isDragOver
                  ? "bg-brand-signal/10 ring-2 ring-inset ring-brand-signal"
                  : ""
              }`}
              onDragOver={(event) => {
                if (handleStatusDragOver(event, status)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                updateDragAutoScroll(event.clientX, event.clientY, "issue");
                if (status === dragSourceStatusRef.current) {
                  if (dragOverStatus != null) setDragOverStatus(null);
                  return;
                }
                if (dragOverStatus !== status) setDragOverStatus(status);
              }}
              onDragLeave={(event) => {
                const next = event.relatedTarget;
                if (next instanceof Node && event.currentTarget.contains(next)) {
                  return;
                }
                if (dragOverStatus === status) setDragOverStatus(null);
              }}
              onDrop={(event) => {
                if (handleStatusDrop(event)) return;
                dropOnColumn(event, status, null);
              }}
            >
              {showInsertBefore ? (
                <span
                  className={`pointer-events-none absolute top-2 bottom-2 w-1 rounded-full bg-brand-signal ${
                    // First column: keep indicator inside so overflow-x doesn't clip it.
                    isFirstColumn ? "left-1" : "-left-2"
                  }`}
                  aria-hidden
                />
              ) : null}
              {showInsertAfter ? (
                <span
                  className={`pointer-events-none absolute top-2 bottom-2 w-1 rounded-full bg-brand-signal ${
                    isLastColumn ? "right-1" : "-right-2"
                  }`}
                  aria-hidden
                />
              ) : null}
              <header
                className={`flex items-center justify-between rounded-t-xl px-3 py-2 text-label-l ${
                  isDone
                    ? "bg-text-primary text-bg-default"
                    : isDragOver
                      ? "text-brand-signal"
                      : "text-text-primary"
                }`}
                style={
                  isDone
                    ? {
                        boxShadow: `inset 0 -2px 0 ${statusAccent}`,
                      }
                    : {
                        borderBottom: `2px solid ${statusAccent}`,
                      }
                }
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {!isDone ? (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: statusAccent }}
                      aria-hidden
                    />
                  ) : null}
                  <span
                    draggable
                    tabIndex={0}
                    aria-label={`Reorder ${column.name}`}
                    title="Move status"
                    className="inline-flex shrink-0 select-none !cursor-move items-center text-current/45 hover:text-current"
                    onDragStart={(event) => {
                      event.stopPropagation();
                      event.dataTransfer.setData(
                        "application/x-work-status",
                        status
                      );
                      event.dataTransfer.setData("text/plain", `status:${status}`);
                      event.dataTransfer.effectAllowed = "move";
                      draggingStatusIdRef.current = status;
                      setDraggingStatusId(status);
                      updateDragAutoScroll(
                        event.clientX,
                        event.clientY,
                        "status"
                      );
                      const columnEl = event.currentTarget.closest("section");
                      if (columnEl instanceof HTMLElement) {
                        event.dataTransfer.setDragImage(columnEl, 24, 16);
                      }
                    }}
                    onDragEnd={() => {
                      window.setTimeout(() => {
                        clearStatusDrag();
                      }, 0);
                    }}
                  >
                    <GripVertical className="pointer-events-none h-4 w-4" aria-hidden />
                  </span>
                  {renamingStatusId === status ? (
                    <form
                      className="min-w-0 flex-1"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void submitRenameStatus();
                      }}
                    >
                      <input
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onBlur={() => {
                          void submitRenameStatus();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setRenamingStatusId(null);
                          }
                        }}
                        aria-label={`Rename ${column.name}`}
                        autoFocus
                        className={`${renameFieldClass} w-full text-label-l`}
                      />
                    </form>
                  ) : (
                    <span className="truncate">{column.name}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {board.showEstimates && columnEstimateSum > 0 ? (
                    <span
                      className="tabular-nums text-caption text-current/55"
                      title={`Total estimate ${formatWorkEstimate(columnEstimateSum, estimateUnit, billingCurrency)}`}
                    >
                      {formatWorkEstimate(
                        columnEstimateSum,
                        estimateUnit,
                        billingCurrency
                      )}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    data-status-menu
                    aria-label={`Status options for ${column.name}`}
                    aria-expanded={statusMenu?.id === status}
                    aria-haspopup="menu"
                    title="Status options"
                    className="inline-flex shrink-0 items-center rounded-sm p-0.5 text-current/45 hover:bg-current/10 hover:text-current"
                    onClick={(event) => {
                      if (statusMenu?.id === status) {
                        setStatusMenu(null);
                        return;
                      }
                      const rect = event.currentTarget.getBoundingClientRect();
                      const width = 176;
                      setStatusMenu({
                        id: status,
                        top: rect.bottom + 4,
                        left: Math.min(
                          rect.right - width,
                          window.innerWidth - width - 8
                        ),
                      });
                    }}
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </button>
                </span>
              </header>

              <div
                data-issue-scroll
                className="flex min-h-0 flex-1 flex-col overflow-y-auto"
                onDragOver={(event) => {
                  if (handleStatusDragOver(event, status)) return;
                  previewIssueDrop(
                    event,
                    status,
                    insertBeforeFromPoint(
                      issueListFromEvent(event),
                      event.clientY
                    )
                  );
                }}
                onDrop={(event) => {
                  if (handleStatusDrop(event)) return;
                  dropOnColumn(
                    event,
                    status,
                    insertBeforeFromPoint(
                      issueListFromEvent(event),
                      event.clientY
                    )
                  );
                }}
              >
              <ul data-issue-list className="relative flex flex-col gap-2 px-2 pt-2 pb-6">
                {isDone &&
                visibleColumnIssues.length === 0 &&
                hiddenDoneCount > 0 ? (
                  <li className="work-done-empty-hint px-1 py-6 text-center">
                    <button
                      type="button"
                      disabled={doneCardMotion != null}
                      className="text-sm text-text-secondary underline-offset-2 hover:text-text-primary hover:underline disabled:opacity-40"
                      onClick={() => showHiddenDoneIssuesFromBoard()}
                    >
                      {hiddenDoneCount} hidden · Show
                    </button>
                  </li>
                ) : null}
                {issueGroups.map((group, groupIndex) => (
                  <Fragment key={group.key}>
                    {groupBy !== "none" ? (
                      <li>
                        <WorkColumnGroupHeader
                          groupBy={groupBy}
                          group={group}
                          showEstimates={board.showEstimates}
                          showReportedTime={board.showReportedTime}
                          estimateUnit={estimateUnit}
                          billingCurrency={billingCurrency}
                          className={groupIndex === 0 ? "" : "mt-1"}
                        />
                      </li>
                    ) : null}
                    {group.issues.map((issue) => {
                  const showInsertBefore =
                    issueDropBefore?.status === status &&
                    issueDropBefore.beforeIssueId === issue.id &&
                    dragIssueIdRef.current !== issue.id;
                  const motionIndex =
                    isDone && doneCardMotion
                      ? doneCardMotion.ids.indexOf(issue.id)
                      : -1;
                  const isHidingCard =
                    doneCardMotion?.mode === "hiding" && motionIndex >= 0;
                  const isShowingCard =
                    doneCardMotion?.mode === "showing" && motionIndex >= 0;
                  return (
                  <li
                    key={`${group.key}-${issue.id}`}
                    data-issue-id={issue.id}
                    className={
                      isDone
                        ? `work-done-card-motion relative${
                            isHidingCard ? " is-hiding" : ""
                          }${isShowingCard ? " is-showing" : ""}`
                        : "relative"
                    }
                    style={
                      motionIndex >= 0
                        ? ({ "--done-i": motionIndex } as CSSProperties)
                        : undefined
                    }
                    onDragOver={(event) => {
                      if (handleStatusDragOver(event, status)) return;
                      previewIssueDrop(
                        event,
                        status,
                        insertBeforeFromPoint(
                          issueListFromEvent(event),
                          event.clientY
                        )
                      );
                    }}
                    onDrop={(event) => {
                      if (handleStatusDrop(event)) return;
                      dropOnColumn(
                        event,
                        status,
                        insertBeforeFromPoint(
                          issueListFromEvent(event),
                          event.clientY
                        )
                      );
                    }}
                  >
                    <div className={isDone ? "work-done-card-motion-inner" : undefined}>
                    {showInsertBefore ? (
                      <span
                        className="pointer-events-none absolute -top-1.5 right-0 left-0 h-0.5 rounded-full bg-brand-signal"
                        aria-hidden
                      />
                    ) : null}
                    <article
                      draggable
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${issue.key}`}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openIssue(issue.id);
                        }
                      }}
                      onClick={() => {
                        if (skipCardClickRef.current) return;
                        openIssue(issue.id);
                      }}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", issue.id);
                        event.dataTransfer.effectAllowed = "move";
                        dragGhostRef.current?.remove();
                        dragGhostRef.current = startWorkCardDragGhost(event, {
                          rotateDeg: 3,
                        });
                        dragIssueIdRef.current = issue.id;
                        dragSourceStatusRef.current = status;
                        const source = event.currentTarget;
                        dragSourceRef.current = source;
                        dropTargetRef.current = null;
                        skipCardClickRef.current = true;
                        updateDragAutoScroll(
                          event.clientX,
                          event.clientY,
                          "issue"
                        );
                        requestAnimationFrame(() => {
                          requestAnimationFrame(() => {
                            if (dragSourceRef.current === source) {
                              source.style.opacity = "0";
                            }
                          });
                        });
                      }}
                      onDragEnd={() => {
                        finishDrag();
                        window.setTimeout(() => {
                          skipCardClickRef.current = false;
                        }, 0);
                      }}
                      data-issue-card
                      className={`relative cursor-pointer select-none overflow-hidden rounded-lg border bg-bg-default p-3 shadow-sm ${
                        selectedIssueId === issue.id
                          ? "border-accent-primary"
                          : "border-border-subtle hover:border-border-default"
                      } ${landingIssueId === issue.id ? "opacity-0" : ""}`}
                    >
                      <div className="text-left">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5 truncate text-label-s text-text-tertiary">
                            <WorkCardTypeBadge
                              issueType={issue.issueType}
                              onChange={(issueType) => {
                                setIssues((current) => {
                                  const next = current.map((row) =>
                                    row.id === issue.id
                                      ? { ...row, issueType }
                                      : row
                                  );
                                  issuesRef.current = next;
                                  return next;
                                });
                                void updateWorkIssueTypeAction(
                                  board.id,
                                  issue.id,
                                  issueType
                                ).then((result) => {
                                  if (result.ok) return;
                                  setError(result.error);
                                  issuesRef.current = board.issues;
                                  setIssues(board.issues);
                                });
                              }}
                            />
                            <span className="min-w-0 truncate">{issue.key}</span>
                            <WorkCardPreDeployHint
                              actions={issue.preDeployActions}
                              onOpen={() =>
                                openIssue(issue.id, { tab: "pre-deploy" })
                              }
                            />
                            {isIssueBlocked(issue.relations) ? (
                              <span className="text-caption">Blocked</span>
                            ) : null}
                          </span>
                          <WorkCardPeople
                            owner={issue.owner}
                            assignees={issue.assignees}
                            people={members}
                            onSetOwner={(person) => {
                              setIssues((current) => {
                                const next = current.map((row) =>
                                  row.id === issue.id
                                    ? { ...row, owner: person }
                                    : row
                                );
                                issuesRef.current = next;
                                return next;
                              });
                              void updateWorkIssueOwnerAction(
                                board.id,
                                issue.id,
                                person?.id ?? null,
                                person?.name ?? ""
                              ).then((result) => {
                                if (result.ok) return;
                                setError(result.error);
                                issuesRef.current = board.issues;
                                setIssues(board.issues);
                              });
                            }}
                            onAddAssignee={(person) => {
                              setIssues((current) => {
                                const next = current.map((row) => {
                                  if (row.id !== issue.id) return row;
                                  if (
                                    row.assignees.some(
                                      (assignee) => assignee.id === person.id
                                    )
                                  ) {
                                    return row;
                                  }
                                  return {
                                    ...row,
                                    assignees: [...row.assignees, person],
                                  };
                                });
                                issuesRef.current = next;
                                return next;
                              });
                              void addWorkIssueAssigneeAction(
                                board.id,
                                issue.id,
                                person.id,
                                person.name
                              ).then((result) => {
                                if (result.ok) return;
                                setError(result.error);
                                issuesRef.current = board.issues;
                                setIssues(board.issues);
                              });
                            }}
                            onRemoveAssignee={(person) => {
                              setIssues((current) => {
                                const next = current.map((row) =>
                                  row.id === issue.id
                                    ? {
                                        ...row,
                                        assignees: row.assignees.filter(
                                          (assignee) =>
                                            assignee.id !== person.id
                                        ),
                                      }
                                    : row
                                );
                                issuesRef.current = next;
                                return next;
                              });
                              void removeWorkIssueAssigneeAction(
                                board.id,
                                issue.id,
                                person.id,
                                person.name
                              ).then((result) => {
                                if (result.ok) return;
                                setError(result.error);
                                issuesRef.current = board.issues;
                                setIssues(board.issues);
                              });
                            }}
                          />
                        </div>
                        <p className="mt-2 text-body-m text-text-primary">
                          {issue.title}
                        </p>
                        <WorkCardComponent component={issue.component} />
                        <WorkCardLabels labels={issue.labels} />
                        {board.showEstimates ? (
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <WorkCardEstimate
                              estimateHours={issue.estimateHours}
                              estimateUnit={estimateUnit}
                              billingCurrency={billingCurrency}
                              onError={setError}
                              onChange={(value) => {
                                noteOptimisticIssuePatch(
                                  optimisticPatchesRef.current,
                                  issue.id,
                                  { estimateHours: value }
                                );
                                setIssues((current) => {
                                  const next = current.map((row) =>
                                    row.id === issue.id
                                      ? { ...row, estimateHours: value }
                                      : row
                                  );
                                  issuesRef.current = next;
                                  return next;
                                });
                                void updateWorkIssueEstimateAction(
                                  board.id,
                                  issue.id,
                                  value == null ? "" : String(value)
                                ).then((result) => {
                                  if (result.ok) return;
                                  setError(result.error);
                                  clearOptimisticIssuePatch(
                                    optimisticPatchesRef.current,
                                    issue.id
                                  );
                                  issuesRef.current = board.issues;
                                  setIssues(board.issues);
                                });
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                      {board.showReportedTime ? (
                        <WorkTimeGraph
                          estimateHours={
                            board.showEstimates ? issue.estimateHours : null
                          }
                          loggedHours={issue.loggedHours}
                          estimateUnit={estimateUnit}
                          billingCurrency={billingCurrency}
                        />
                      ) : null}
                    </article>
                    </div>
                  </li>
                  );
                    })}
                  </Fragment>
                ))}
                {issueDropBefore?.status === status &&
                issueDropBefore.beforeIssueId == null ? (
                  <span
                    className="pointer-events-none absolute bottom-3 left-2 right-2 h-0.5 rounded-full bg-brand-signal"
                    aria-hidden
                  />
                ) : null}
              </ul>

              {addingStatus === status ? (
                <form
                  ref={addIssueFormRef}
                  className="space-y-2 px-2 pb-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    startTransition(() => void submitNewIssue(status, draftTitle));
                  }}
                >
                  <div className="flex items-start gap-2">
                    <WorkIssueTypePicker
                      name={`New issue type ${status}`}
                      value={draftIssueType}
                      onChange={setDraftIssueType}
                      size="sm"
                    />
                    <NewIssueTitleField
                      value={draftTitle}
                      onChange={setDraftTitle}
                      onCancel={cancelAddingIssue}
                      onSubmit={() => {
                        startTransition(() =>
                          void submitNewIssue(status, draftTitle)
                        );
                      }}
                    />
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  className="mx-2 mb-3 flex items-center gap-1 rounded-md px-2 py-1.5 text-left text-body-m text-text-secondary hover:bg-bg-muted hover:text-text-primary"
                  onClick={() => {
                    setAddingStatus(status);
                    setDraftTitle("");
                    setDraftIssueType("issue");
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add issue
                </button>
              )}
              </div>
            </section>
          );
        })}
        <div
          className="flex w-72 shrink-0 flex-col self-start"
          onDragOver={(event) => {
            handleStatusDragOver(event, null);
          }}
          onDrop={(event) => {
            handleStatusDrop(event);
          }}
        >
          {addingColumn ? (
            <form
              className="rounded-xl bg-surface-subtle px-3 py-2"
              onSubmit={(event) => {
                event.preventDefault();
                startTransition(() => void submitNewColumn());
              }}
            >
              <Input
                value={columnDraft}
                onChange={(event) => setColumnDraft(event.target.value)}
                placeholder="Status name"
                aria-label="New status name"
                autoFocus
                onBlur={() => {
                  if (!columnDraft.trim()) setAddingColumn(false);
                }}
              />
            </form>
          ) : (
            <button
              type="button"
              className="flex items-center gap-1 rounded-xl px-3 py-2 text-left text-body-m text-text-secondary hover:bg-bg-muted hover:text-text-primary"
              onClick={() => {
                setAddingColumn(true);
                setColumnDraft("");
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add status
            </button>
          )}
        </div>
      </div>
      )}

      <WorkProjectSettingsDrawer
        projectId={board.id}
        agentsMd={board.agentsMd}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialTab={settingsTab}
        title={boardTitle}
        customerId={board.customerId}
        customerName={board.customerName}
        plannerProjectId={plannerProjectId}
        plannerProjectName={plannerProjectName}
        members={members}
        people={board.people}
        components={components}
        estimateUnit={estimateUnit}
        billingCurrency={billingCurrency}
        showDangerTab={board.viewerRole !== "customer"}
        onSetEstimateUnit={async (unit) => {
          const previousUnit = estimateUnit;
          setEstimateUnit(unit);
          if (unit !== previousUnit) {
            setIssues((current) => {
              const next = current.map((issue) => ({
                ...issue,
                estimateHours: null,
              }));
              issuesRef.current = next;
              return next;
            });
          }
          const result = await setWorkProjectEstimateUnitAction(board.id, unit);
          if (!result.ok) {
            setEstimateUnit(previousUnit);
            setError(result.error);
            router.refresh();
            return false;
          }
          setEstimateUnit(result.estimateUnit);
          router.refresh();
          return true;
        }}
        onRename={applyBoardRename}
        onLinkPlannerProject={async (nextPlannerProjectId) => {
          const result = await linkWorkProjectToPlannerProjectAction(
            board.id,
            nextPlannerProjectId
          );
          if (!result.ok) {
            setError(result.error);
            return null;
          }
          setPlannerProjectId(result.plannerProjectId);
          setPlannerProjectName(result.plannerProjectName);
          router.refresh();
          return {
            plannerProjectId: result.plannerProjectId,
            plannerProjectName: result.plannerProjectName,
          };
        }}
        onAddMember={(person) => {
          setMembers((current) =>
            current.some((row) => row.id === person.id)
              ? current
              : [...current, person]
          );
          void addWorkBoardMemberAction(board.id, person.id).then((result) => {
            if (result.ok) return;
            setMembers(board.members);
            setError(result.error);
          });
        }}
        onRemoveMember={(person) => {
          if (members.length <= 1) {
            setError("A project needs at least one person");
            return;
          }
          setMembers((current) =>
            current.filter((row) => row.id !== person.id)
          );
          void removeWorkBoardMemberAction(board.id, person.id).then(
            (result) => {
              if (result.ok) {
                if (person.id === board.currentUser.id) {
                  router.push(workCustomerHref(board.customerId));
                }
                return;
              }
              setMembers(board.members);
              setError(result.error);
            }
          );
        }}
        onCreateComponent={async (name) => {
          const trimmed = name.trim();
          if (
            components.some(
              (row) => row.name.toLowerCase() === trimmed.toLowerCase()
            )
          ) {
            setError("A component with that name already exists");
            return null;
          }
          const result = await createWorkComponentAction(board.id, trimmed);
          if (!result.ok) {
            setError(result.error);
            return null;
          }
          setComponents((current) => {
            if (current.some((row) => row.id === result.component.id)) {
              return current;
            }
            return [...current, result.component].sort((a, b) =>
              a.name.localeCompare(b.name)
            );
          });
          router.refresh();
          return result.component;
        }}
        onRenameComponent={async (component, name) => {
          const result = await renameWorkComponentAction(
            board.id,
            component.id,
            name
          );
          if (!result.ok) {
            setError(result.error);
            return null;
          }
          setComponents((current) =>
            current
              .map((row) =>
                row.id === result.component.id ? result.component : row
              )
              .sort((a, b) => a.name.localeCompare(b.name))
          );
          setIssues((current) => {
            const next = current.map((issue) =>
              issue.component?.id === result.component.id
                ? { ...issue, component: result.component }
                : issue
            );
            issuesRef.current = next;
            return next;
          });
          router.refresh();
          return result.component;
        }}
        onDeleteComponent={async (component) => {
          const result = await deleteWorkComponentAction(
            board.id,
            component.id
          );
          if (!result.ok) {
            setError(result.error);
            return false;
          }
          setComponents((current) =>
            current.filter((row) => row.id !== component.id)
          );
          setIssues((current) => {
            const next = current.map((issue) =>
              issue.component?.id === component.id
                ? { ...issue, component: null }
                : issue
            );
            issuesRef.current = next;
            return next;
          });
          setComponentFilterIds((current) =>
            current.filter((id) => id !== component.id)
          );
          router.refresh();
          return true;
        }}
        onArchive={() => {
          setSettingsOpen(false);
          setArchiveOpen(true);
        }}
        onImportFromJira={() => {
          setSettingsOpen(false);
          setJiraImportOpen(true);
        }}
      />

      <WorkJiraImportDialog
        open={jiraImportOpen}
        onOpenChange={setJiraImportOpen}
        boardId={board.id}
        columns={statuses}
        members={members}
      />

      <ConfirmModal
        isOpen={archiveOpen}
        title="Archive project"
        message="This project will be hidden from Rove Work. Issues are kept."
        confirmLabel="Archive"
        variant="danger"
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => confirmArchiveBoard()}
      />

      {statusMenu
        ? createPortal(
            (() => {
              const menuColumn = statuses.find(
                (status) => status.id === statusMenu.id
              );
              const menuDoneIssues = menuColumn?.isDone
                ? issuesInStatus(issues, statusMenu.id).filter((issue) =>
                    visibleIds.has(issue.id)
                  )
                : [];
              const menuVisibleDone = menuDoneIssues.filter(
                (issue) => !issue.hiddenFromBoard
              ).length;
              const menuHiddenDone = menuDoneIssues.filter(
                (issue) => issue.hiddenFromBoard
              ).length;
              const canHideDone =
                Boolean(menuColumn?.isDone) &&
                menuVisibleDone > 0 &&
                doneCardMotion?.mode !== "hiding";
              const canShowDone =
                Boolean(menuColumn?.isDone) &&
                menuHiddenDone > 0 &&
                doneCardMotion?.mode !== "showing";
              return (
            <div
              data-status-menu
              role="menu"
              className="fixed z-50 min-w-44 rounded-lg border border-border-subtle bg-bg-default py-1 shadow-lg"
              style={{ top: statusMenu.top, left: statusMenu.left }}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-3 py-1.5 text-left text-body-m text-text-primary hover:bg-bg-muted"
                onClick={() => {
                  if (menuColumn) startRenameStatus(menuColumn);
                }}
              >
                Rename
              </button>
              {canHideDone || canShowDone ? (
                <>
                  <div
                    className="my-1 border-t border-border-subtle"
                    role="separator"
                  />
                  {canHideDone ? (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={doneCardMotion != null}
                      className="flex w-full px-3 py-1.5 text-left text-body-m text-text-primary hover:bg-bg-muted disabled:opacity-40"
                      onClick={() => {
                        setStatusMenu(null);
                        hideDoneIssuesFromBoard(statusMenu.id);
                      }}
                    >
                      Hide all in Done
                    </button>
                  ) : null}
                  {canShowDone ? (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={doneCardMotion != null}
                      className="flex w-full px-3 py-1.5 text-left text-body-m text-text-primary hover:bg-bg-muted disabled:opacity-40"
                      onClick={() => {
                        setStatusMenu(null);
                        showHiddenDoneIssuesFromBoard();
                      }}
                    >
                      Show {menuHiddenDone} hidden
                    </button>
                  ) : null}
                </>
              ) : null}
              <div
                className="my-1 border-t border-border-subtle"
                role="separator"
              />
              <p className="px-3 py-1 text-caption text-text-tertiary">
                Sort by
              </p>
              {(
                [
                  "priority",
                  "key",
                  "title",
                  ...(board.showEstimates ? (["estimate"] as const) : []),
                  "owner",
                  "created",
                  "updated",
                ] as WorkColumnSortBy[]
              ).map((sortBy) => (
                <button
                  key={sortBy}
                  type="button"
                  role="menuitem"
                  className="flex w-full px-3 py-1.5 text-left text-body-m text-text-primary hover:bg-bg-muted"
                  onClick={() => sortStatusColumn(statusMenu.id, sortBy)}
                >
                  {workColumnSortLabel(sortBy)}
                </button>
              ))}
              {statuses.length > 1 ? (
                <>
                  <div
                    className="my-1 border-t border-border-subtle"
                    role="separator"
                  />
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full px-3 py-1.5 text-left text-body-m text-danger hover:bg-danger/10"
                    onClick={() => {
                      const column = statuses.find(
                        (status) => status.id === statusMenu.id
                      );
                      if (column) openDeleteStatus(column);
                    }}
                  >
                    Remove
                  </button>
                </>
              ) : null}
            </div>
              );
            })(),
            document.body
          )
        : null}

      <Dialog
        open={deletingStatus != null}
        onOpenChange={(open) => {
          if (!open) setDeletingStatus(null);
        }}
        title={
          deletingStatus ? `Delete ${deletingStatus.name}` : "Delete status"
        }
        contentClassName="max-w-md"
      >
        <form
          className="modal-form-discreet mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(() => void submitDeleteStatus());
          }}
        >
          {deletingStatus && deletingIssueCount > 0 ? (
              <>
                <p className="text-sm text-text-secondary">
                  Move {deletingIssueCount}{" "}
                  {deletingIssueCount === 1 ? "issue" : "issues"} to another
                  status.
                </p>
                <Select
                  label="Move issues to"
                  variant="modal"
                  value={moveToStatusId}
                  onValueChange={setMoveToStatusId}
                  options={statuses
                    .filter((status) => status.id !== deletingStatus.id)
                    .map((status) => ({
                      value: status.id,
                      label: status.name,
                    }))}
                />
              </>
            ) : (
              <p className="text-sm text-text-secondary">
                This status has no issues.
              </p>
            )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeletingStatus(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={
                pending || (deletingIssueCount > 0 && !moveToStatusId)
              }
            >
              Delete status
            </Button>
          </div>
        </form>
      </Dialog>

      <SideDrawer
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) closeIssue();
        }}
        title={selected?.key ?? "Issue"}
        bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      >
        {selected ? (
          <WorkIssueDrawer
            key={selected.id}
            board={{
              ...board,
              members,
              components,
              issues,
              plannerProjectId,
              plannerProjectName,
              estimateUnit,
              billingCurrency,
            }}
            issue={selected}
            initialTab={selectedIssueTab}
            onStatus={(status) => {
              moveIssue(selected.id, status, null);
            }}
            onChanged={() => {
              setError(null);
              router.refresh();
            }}
            onError={(message) => {
              setError(message);
              issuesRef.current = board.issues;
              setIssues(board.issues);
              setComponents(board.components);
            }}
            onIssuePatch={(patch) => {
              if (
                patch.component &&
                !components.some((row) => row.id === patch.component!.id)
              ) {
                setComponents((current) =>
                  [...current, patch.component!].sort((a, b) =>
                    a.name.localeCompare(b.name)
                  )
                );
              }
              noteOptimisticIssuePatch(
                optimisticPatchesRef.current,
                selected.id,
                patch as WorkIssueOptimisticPatch
              );
              setIssues((current) => {
                const next = current.map((issue) =>
                  issue.id === selected.id ? { ...issue, ...patch } : issue
                );
                issuesRef.current = next;
                return next;
              });
            }}
            onDeleted={() => {
              const deletedId = selected.id;
              clearOptimisticIssuePatch(
                optimisticPatchesRef.current,
                deletedId
              );
              setIssues((current) => {
                const next = current.filter((issue) => issue.id !== deletedId);
                issuesRef.current = next;
                return next;
              });
              setError(null);
              closeIssue();
              router.refresh();
            }}
          />
        ) : null}
      </SideDrawer>
    </div>
  );
}

export { WorkBoardPageClient as WorkProjectPageClient };
