"use client";

import {
  useState,
  Fragment,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addWeeksToYearWeek, getMonthSpansForWeeks } from "@/lib/dateUtils";
import type { AllocationPageData } from "@/lib/allocationPageTypes";
import { TO_PLAN_CONSULTANT_ID } from "@/lib/allocationPageTypes";
import { PageHeader, Dialog, Button } from "@/components/ui";
import { AllocationViewControls } from "@/components/AllocationViewControls";
import { AllocationWeekNav } from "@/components/allocation/AllocationWeekNav";
import { useAllocationHeaderPan } from "@/components/allocation/useAllocationHeaderPan";
import {
  createAllocation,
  updateAllocation,
} from "@/lib/allocationsClient";
import {
  revalidateAllocationPage,
  getAllocationHistory,
  logAllocationHistoryCreate,
  logAllocationHistoryUpdate,
  deleteAllocationWithHistory,
  deleteAllocationsWithHistory,
} from "@/app/(app)/allocation/actions";
import type { AllocationHistoryEntry } from "@/types";
import { AllocationHistoryTable } from "@/components/AllocationHistoryTable";
import {
  buildPerConsultantView,
  buildPerCustomerView,
  buildPerProjectView,
  getProjectProbabilityMap,
  getDisplayHours,
  type ProbabilityDisplay,
  type ProjectVisibility,
} from "@/lib/allocationPageView";
import { allocationCellKey } from "@/lib/allocationCellKey";
import { allocationIdentityKey } from "@/lib/billingItem";
import {
  formatAllocationWeekLabel,
  getAllocationCellBgClass,
} from "@/lib/allocationPageDisplay";
import { useAllocationWeekNavigation } from "@/lib/hooks/useAllocationWeekNavigation";
import { useAllocationFilteredData } from "@/lib/hooks/useAllocationFilteredData";
import { AllocationConsultantTables } from "@/components/allocation/AllocationConsultantTables";
import {
  TimeGridColumnHighlightProvider,
  useTimeGridColumnHighlight,
} from "@/components/TimeGridColumnHighlight";
import type { PlannerView } from "@/lib/routes";
import {
  allocationFiltersKey,
  buildAllocationSearch,
  readAllocationFilters,
  type AllocationFilterParams,
  type AllocationFiltersState,
} from "@/lib/allocationUrl";

export type {
  ProbabilityDisplay,
  ProjectVisibility,
} from "@/lib/allocationPageView";

const AddAllocationModal = dynamic(
  () => import("./AddAllocationModal").then((m) => ({ default: m.AddAllocationModal })),
  { ssr: false }
);

const EditAllocationModal = dynamic(
  () => import("./EditAllocationModal").then((m) => ({ default: m.EditAllocationModal })),
  { ssr: false }
);

const EditAllocationRangeModal = dynamic(
  () =>
    import("./EditAllocationRangeModal").then((m) => ({
      default: m.EditAllocationRangeModal,
    })),
  { ssr: false }
);

/** Customer and project tab content loaded on demand to reduce initial bundle. */
const AllocationCustomerProjectTabs = dynamic(
  () =>
    import("./AllocationCustomerProjectTabs").then((m) => ({
      default: m.AllocationCustomerProjectTabs,
    })),
  { ssr: false }
);

const ENABLE_PERF_DEBUG = process.env.NEXT_PUBLIC_DEBUG_PERF === "1";

type Props = {
  data: AllocationPageData | null;
  error: string | null;
  year: number;
  weekFrom: number;
  weekTo: number;
  /** Passed from server so first paint matches hydration (avoids jump from current-week highlight). */
  currentYear: number;
  currentWeek: number;
  /** When set, show only the Per consultant table with no header, tabs, or filters (e.g. project detail planning panel). */
  embedMode?: {
    projectId: string;
    rates?: Record<string, number>;
    budgetHours?: number;
    budgetMoney?: number;
  };
  /** When set (embed), week arrows call this instead of router.push for client-side nav without full reload. */
  onWeekRangeChange?: (year: number, weekFrom: number, weekTo: number) => void | Promise<void>;
  /** When true (embed), show loading state on week nav (e.g. disabled arrows or spinner). */
  embedWeekNavLoading?: boolean;
  /** In embed mode (e.g. project Planning panel), show team filter above the table — same behavior as full Allocation page. */
  embedShowTeamFilter?: boolean;
  /** Planner sidebar page: consultant, customer, project, or history. */
  view?: PlannerView;
  /**
   * Snapshot of URL filters from the server so SSR and the first client render match.
   * Do not read useSearchParams during render for filter-dependent table output.
   */
  initialFilters?: AllocationFiltersState;
};

export function AllocationPageClient(props: Props) {
  return (
    <TimeGridColumnHighlightProvider>
      <AllocationPageClientImpl {...props} />
    </TimeGridColumnHighlightProvider>
  );
}

function AllocationPageClientImpl({
  data,
  error,
  year,
  weekFrom,
  weekTo,
  currentYear: currentYearProp,
  currentWeek: currentWeekProp,
  embedMode,
  onWeekRangeChange,
  embedWeekNavLoading = false,
  embedShowTeamFilter = false,
  view = "consultant",
  initialFilters,
}: Props) {
  const { highlightedColumnIndex } = useTimeGridColumnHighlight();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { shiftWeeks, getShiftUrl } =
    useAllocationWeekNavigation(
      router,
      year,
      weekFrom,
      weekTo,
      embedMode,
      onWeekRangeChange
    );
  const {
    panning,
    panWeeks,
    gridPanStyle,
    headerPanClassName,
    headerPanHandlers,
  } = useAllocationHeaderPan({
    embedMode: Boolean(embedMode),
    onShiftWeeks: shiftWeeks,
    rangeKey: `${year}-${weekFrom}-${weekTo}`,
    disabled: Boolean(embedMode && embedWeekNavLoading),
  });
  const [mounted, setMounted] = useState(false);
  const allocationTablesRef = useRef<HTMLDivElement>(null);
  const activeTab: PlannerView = embedMode ? "consultant" : view;
  const [historyEntries, setHistoryEntries] = useState<AllocationHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addInitialParams, setAddInitialParams] = useState<{
    consultantId?: string;
    consultantName?: string;
    week?: number;
    weekFrom?: number;
    weekTo?: number;
    year: number;
    projectId?: string;
    projectLabel?: string;
  } | null>(null);
  const [cellDragConsultant, setCellDragConsultant] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [cellDragWeekStart, setCellDragWeekStart] = useState<number | null>(null);
  const [cellDragWeekEnd, setCellDragWeekEnd] = useState<number | null>(null);
  const [editingAllocation, setEditingAllocation] = useState<{
    id: string;
    consultantName: string;
    projectName: string;
    customerName: string;
    week: number;
    year: number;
    hours: number;
    roleId: string | null;
    roleName: string;
  } | null>(null);
  const [expandedConsultants, setExpandedConsultants] = useState<Set<string>>(
    new Set()
  );
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(
    new Set()
  );
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set()
  );
  const [filters, setFilters] = useState<AllocationFiltersState>(
    () =>
      initialFilters ?? {
        team: null,
        role: null,
        prob: "weighted",
        projects: "all",
        unbooked: false,
      }
  );
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const [embedTeamFilterId, setEmbedTeamFilterId] = useState<string | null>(null);
  const [embedDefaultRoleFilterId, setEmbedDefaultRoleFilterId] = useState<
    string | null
  >(null);
  const [embedProbabilityDisplay, setEmbedProbabilityDisplay] =
    useState<ProbabilityDisplay>("weighted");
  const [embedProjectVisibility, setEmbedProjectVisibility] =
    useState<ProjectVisibility>("all");
  const [embedShowProjectsWithoutBooking, setEmbedShowProjectsWithoutBooking] =
    useState(false);

  // After mount / when the URL changes (shortcuts, week nav), adopt URL filters.
  // Skip during the first render so SSR and hydration share `initialFilters`.
  useEffect(() => {
    if (embedMode) return;
    const fromUrl = readAllocationFilters(searchParams);
    setFilters((prev) =>
      allocationFiltersKey(prev) === allocationFiltersKey(fromUrl)
        ? prev
        : fromUrl
    );
  }, [embedMode, searchParams]);

  const teamFilterId = embedMode ? embedTeamFilterId : filters.team;
  const defaultRoleFilterId = embedMode
    ? embedDefaultRoleFilterId
    : filters.role;
  const probabilityDisplay = embedMode
    ? embedProbabilityDisplay
    : filters.prob;
  const projectVisibility = embedMode
    ? embedProjectVisibility
    : filters.projects;
  const showProjectsWithoutBooking = embedMode
    ? embedShowProjectsWithoutBooking
    : filters.unbooked;

  const replaceAllocationFilters = useCallback(
    (patch: AllocationFilterParams) => {
      if (embedMode) {
        if (patch.team !== undefined) setEmbedTeamFilterId(patch.team);
        if (patch.role !== undefined) setEmbedDefaultRoleFilterId(patch.role);
        if (patch.prob !== undefined && patch.prob) {
          setEmbedProbabilityDisplay(patch.prob);
        }
        if (patch.projects !== undefined && patch.projects) {
          setEmbedProjectVisibility(patch.projects);
        }
        if (patch.unbooked !== undefined) {
          setEmbedShowProjectsWithoutBooking(Boolean(patch.unbooked));
        }
        return;
      }
      const prev = filtersRef.current;
      const nextState: AllocationFiltersState = {
        team: patch.team !== undefined ? patch.team : prev.team,
        role: patch.role !== undefined ? patch.role : prev.role,
        prob:
          patch.prob !== undefined && patch.prob != null
            ? patch.prob
            : prev.prob,
        projects:
          patch.projects !== undefined && patch.projects != null
            ? patch.projects
            : prev.projects,
        unbooked:
          patch.unbooked !== undefined
            ? Boolean(patch.unbooked)
            : prev.unbooked,
      };
      setFilters(nextState);
      const q = buildAllocationSearch(
        { year, from: weekFrom, to: weekTo },
        nextState
      );
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [embedMode, pathname, router, year, weekFrom, weekTo]
  );

  const setTeamFilterId = useCallback(
    (value: string | null) => replaceAllocationFilters({ team: value }),
    [replaceAllocationFilters]
  );
  const setDefaultRoleFilterId = useCallback(
    (value: string | null) => replaceAllocationFilters({ role: value }),
    [replaceAllocationFilters]
  );
  const setProbabilityDisplay = useCallback(
    (value: ProbabilityDisplay) => replaceAllocationFilters({ prob: value }),
    [replaceAllocationFilters]
  );
  const setProjectVisibility = useCallback(
    (value: ProjectVisibility) =>
      replaceAllocationFilters({ projects: value }),
    [replaceAllocationFilters]
  );
  const setShowProjectsWithoutBooking = useCallback(
    (value: boolean) => replaceAllocationFilters({ unbooked: value }),
    [replaceAllocationFilters]
  );

  const [editingCell, setEditingCell] = useState<{
    customerId: string;
    consultantId: string;
    roleId: string | null;
    weekIndex: number;
    week: number;
    year: number;
    allocationId: string | null;
    otherAllocationIds: string[];
    projectId: string;
    currentHours: number;
  } | null>(null);
  const [editingCellValue, setEditingCellValue] = useState("");
  const [savingCell, setSavingCell] = useState(false);
  const [cellError, setCellError] = useState<string | null>(null);
  const [editingCellConsultant, setEditingCellConsultant] = useState<{
    consultantId: string;
    projectId: string;
    roleId: string | null;
    weekIndex: number;
    week: number;
    year: number;
    allocationId: string | null;
    currentHours: number;
  } | null>(null);
  const [editingCellConsultantValue, setEditingCellConsultantValue] =
    useState("");
  const [savingCellConsultant, setSavingCellConsultant] = useState(false);

  type DeleteBookingItem = { allocationId: string; year: number; week: number };
  const [deleteBookingDialog, setDeleteBookingDialog] = useState<{
    consultantId: string;
    consultantName: string;
    projectId: string;
    projectLabel: string;
    allocations: DeleteBookingItem[];
    selectedAllocationIds: Set<string>;
  } | null>(null);
  const [deletingBooking, setDeletingBooking] = useState(false);
  const [loadingDeleteBooking, setLoadingDeleteBooking] = useState(false);
  const [optimisticCellHours, setOptimisticCellHours] = useState<Record<string, number>>({});
  const preventNextCellClickRef = useRef(false);
  const [projectRowDrag, setProjectRowDrag] = useState<{
    consultantId: string;
    projectId: string;
    roleId: string | null;
    consultantName: string;
    projectLabel: string;
    roleName?: string;
    weekIndexStart: number;
    weekIndexEnd: number;
  } | null>(null);
  const [projectRowDragMoved, setProjectRowDragMoved] = useState(false);
  const [editRangeModalParams, setEditRangeModalParams] = useState<{
    consultantId: string;
    consultantName: string;
    projectId: string;
    projectLabel: string;
    roleId: string | null;
    roleName?: string;
    weeks: { year: number; week: number; allocationId: string | null; currentHours: number }[];
    availableHoursByWeek: number[];
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const weekCount = data?.weeks?.length ?? 0;
  const hasBudgetTotal = Boolean(embedMode && data?.consultantTotalHours != null);
  const allocationNameColWidth = embedMode ? "72px" : "300px";
  const allocationActionsColWidth =
    !embedMode && activeTab === "consultant" ? "1.5rem" : "0px";
  const allocationTrailingTotalsWidth = hasBudgetTotal ? "9rem" : "4.5rem";
  // Pure CSS: week cols share leftover space on first paint — no measure/jump.
  const allocationWeekColWidth =
    weekCount > 0
      ? `calc((100% - ${allocationNameColWidth} - ${allocationActionsColWidth} - ${allocationTrailingTotalsWidth}) / ${weekCount})`
      : "1.75rem";

  useEffect(() => {
    if (!data?.allocations) return;
    setOptimisticCellHours((prev) => {
      const next = { ...prev };
      const allocs = data.allocations ?? [];
      for (const key of Object.keys(next)) {
        const parts = key.split("|");
        if (parts.length !== 5) continue;
        const [consultantId, projectId, roleIdPart, yearStr, weekStr] = parts;
        const year = parseInt(yearStr, 10);
        const week = parseInt(weekStr, 10);
        const roleId = roleIdPart === "" ? null : roleIdPart;
        const match = allocs.find(
          (a) =>
            (consultantId === TO_PLAN_CONSULTANT_ID
              ? a.consultant_id == null
              : a.consultant_id === consultantId) &&
            a.project_id === projectId &&
            (allocationIdentityKey(a) || null) === roleId &&
            a.year === year &&
            a.week === week
        );
        if (match && Number(match.hours) === next[key]) {
          delete next[key];
        }
      }
      return next;
    });
  }, [data]);

  useEffect(() => {
    if (activeTab !== "history") return;
    setHistoryLoading(true);
    getAllocationHistory(100)
      .then(setHistoryEntries)
      .catch(() => setHistoryEntries([]))
      .finally(() => setHistoryLoading(false));
  }, [activeTab]);

  const filteredData = useAllocationFilteredData(
    data,
    teamFilterId,
    defaultRoleFilterId
  );

  const handleSuccess = async () => {
    await revalidateAllocationPage();
    router.refresh();
  };

  const saveCellHours = useCallback(
    async (cell: NonNullable<typeof editingCell>, value: string) => {
      const hours = parseFloat(value.replace(",", "."));
      if (isNaN(hours) || hours < 0) return;
      setCellError(null);
      setSavingCell(true);
      try {
        if (cell.allocationId) {
          if (hours === 0) {
            await deleteAllocationWithHistory(cell.allocationId);
            for (const id of cell.otherAllocationIds) {
              await deleteAllocationWithHistory(id);
            }
          } else {
            await updateAllocation(cell.allocationId, { hours });
            logAllocationHistoryUpdate(cell.allocationId, hours).catch(() => {});
            for (const id of cell.otherAllocationIds) {
              await deleteAllocationWithHistory(id);
            }
          }
        } else {
          if (hours > 0) {
            const created = await createAllocation({
              consultant_id: cell.consultantId,
              project_id: cell.projectId,
              role_id: cell.roleId ?? undefined,
              year: cell.year,
              week: cell.week,
              hours,
            });
            logAllocationHistoryCreate(created.id).catch(() => {});
          }
        }
        await revalidateAllocationPage();
        router.refresh();
        setEditingCell(null);
      } catch (e) {
        setCellError(e instanceof Error ? e.message : "Failed to save");
      } finally {
        setSavingCell(false);
      }
    },
    [router]
  );

  const handleCellInputBlur = useCallback(() => {
    if (!editingCell) return;
    if (editingCellValue.trim() === "") {
      setEditingCell(null);
      return;
    }
    saveCellHours(editingCell, editingCellValue);
  }, [editingCell, editingCellValue, saveCellHours]);

  const handleCellInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (editingCell) {
          saveCellHours(editingCell, editingCellValue);
        }
      }
      if (e.key === "Escape") {
        setEditingCell(null);
      }
    },
    [editingCell, editingCellValue, saveCellHours]
  );

  const saveCellHoursConsultant = useCallback(
    async (
      cell: NonNullable<typeof editingCellConsultant>,
      value: string
    ) => {
      const hours = parseFloat(value.replace(",", "."));
      if (isNaN(hours) || hours < 0) return;
      const cellKey = allocationCellKey(
        cell.consultantId,
        cell.projectId,
        cell.roleId,
        cell.year,
        cell.week
      );
      setOptimisticCellHours((prev) => ({ ...prev, [cellKey]: hours }));
      setEditingCellConsultant(null);
      setSavingCellConsultant(true);
      try {
        if (cell.allocationId) {
          if (hours === 0) {
            await deleteAllocationWithHistory(cell.allocationId);
          } else {
            await updateAllocation(cell.allocationId, { hours });
            logAllocationHistoryUpdate(cell.allocationId, hours).catch(() => {});
          }
        } else {
          if (hours > 0) {
            const created = await createAllocation({
              consultant_id: cell.consultantId === TO_PLAN_CONSULTANT_ID ? null : cell.consultantId,
              project_id: cell.projectId,
              role_id: cell.roleId ?? undefined,
              year: cell.year,
              week: cell.week,
              hours,
            });
            logAllocationHistoryCreate(created.id).catch(() => {});
          }
        }
        await revalidateAllocationPage();
        router.refresh();
        setEditingCellConsultant(null);
      } catch {
        setOptimisticCellHours((prev) => {
          const next = { ...prev };
          delete next[cellKey];
          return next;
        });
      } finally {
        setSavingCellConsultant(false);
      }
    },
    [router]
  );

  const handleCellConsultantInputBlur = useCallback(() => {
    if (!editingCellConsultant) return;
    if (editingCellConsultantValue.trim() === "") {
      setEditingCellConsultant(null);
      return;
    }
    saveCellHoursConsultant(editingCellConsultant, editingCellConsultantValue);
  }, [editingCellConsultant, editingCellConsultantValue, saveCellHoursConsultant]);

  const handleCellConsultantInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (editingCellConsultant) {
          saveCellHoursConsultant(
            editingCellConsultant,
            editingCellConsultantValue
          );
        }
      }
      if (e.key === "Escape") {
        setEditingCellConsultant(null);
      }
    },
    [
      editingCellConsultant,
      editingCellConsultantValue,
      saveCellHoursConsultant,
    ]
  );

  const toggleConsultant = useCallback((id: string) => {
    setExpandedConsultants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleCustomer = useCallback((id: string) => {
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleProject = useCallback((id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  type PerConsultantRow = ReturnType<typeof buildPerConsultantView>[number];
  const internalRowsRef = useRef<PerConsultantRow[]>([]);

  const handleCellDragEnd = useCallback(() => {
    if (
      cellDragConsultant === null ||
      cellDragWeekStart === null ||
      cellDragWeekEnd === null ||
      !data
    )
      return;
    const internalRows = internalRowsRef.current;
    const fromIdx = Math.min(cellDragWeekStart, cellDragWeekEnd);
    const toIdx = Math.max(cellDragWeekStart, cellDragWeekEnd);
    const wFrom = data.weeks[fromIdx];
    const wTo = data.weeks[toIdx];
    if (wFrom && wTo) {
      const project =
        embedMode && data.projects.length > 0 ? data.projects[0] : null;
      setAddInitialParams({
        consultantId: cellDragConsultant.id,
        consultantName: cellDragConsultant.name,
        year: wFrom.year,
        weekFrom: wFrom.week,
        weekTo: wTo.week,
        projectId: project?.id,
        projectLabel: project
          ? `${project.customerName} - ${project.name}`
          : undefined,
      });
      setAddModalOpen(true);
    }
    setCellDragConsultant(null);
    setCellDragWeekStart(null);
    setCellDragWeekEnd(null);
  }, [cellDragConsultant, cellDragWeekStart, cellDragWeekEnd, data, embedMode]);

  useEffect(() => {
    if (cellDragConsultant === null) return;
    const onMouseUp = () => handleCellDragEnd();
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "crosshair";
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [cellDragConsultant, handleCellDragEnd]);

  const handleProjectRowDragEnd = useCallback(() => {
    if (projectRowDrag === null || !data || !projectRowDragMoved) {
      setProjectRowDrag(null);
      setProjectRowDragMoved(false);
      return;
    }
    const internalRows = internalRowsRef.current;
    const row = internalRows.find((r) => r.consultant.id === projectRowDrag.consultantId);
    const pr = row?.projectRows.find((p) => {
      if (p.projectId !== projectRowDrag.projectId) return false;
      const rowRoleId =
        p.weeks.find((week) => week.cell?.roleId)?.cell?.roleId ?? null;
      return rowRoleId === projectRowDrag.roleId;
    });
    if (!row || !pr) {
      setProjectRowDrag(null);
      setProjectRowDragMoved(false);
      return;
    }
    const lo = Math.min(projectRowDrag.weekIndexStart, projectRowDrag.weekIndexEnd);
    const hi = Math.max(projectRowDrag.weekIndexStart, projectRowDrag.weekIndexEnd);
    const weeks: { year: number; week: number; allocationId: string | null; currentHours: number }[] = [];
    const availableHoursByWeek: number[] = [];
    for (let idx = lo; idx <= hi; idx++) {
      const wk = data.weeks[idx];
      if (!wk) continue;
      weeks.push({
        year: wk.year,
        week: wk.week,
        allocationId: pr.weeks[idx]?.cell?.id ?? null,
        currentHours: pr.weeks[idx]?.cell?.hours ?? 0,
      });
      availableHoursByWeek.push(row.consultant.availableHoursByWeek[idx] ?? 0);
    }
    if (weeks.length > 0) {
      preventNextCellClickRef.current = true;
      setEditRangeModalParams({
        consultantId: projectRowDrag.consultantId,
        consultantName: projectRowDrag.consultantName,
        projectId: projectRowDrag.projectId,
        projectLabel: projectRowDrag.projectLabel,
        roleId: projectRowDrag.roleId,
        roleName: projectRowDrag.roleName,
        weeks,
        availableHoursByWeek,
      });
    }
    setProjectRowDrag(null);
    setProjectRowDragMoved(false);
  }, [projectRowDrag, projectRowDragMoved, data]);

  useEffect(() => {
    if (projectRowDrag === null) return;
    const onMouseUp = () => handleProjectRowDragEnd();
    document.addEventListener("mouseup", onMouseUp);
    document.body.classList.add("allocation-project-row-dragging");
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.body.classList.remove("allocation-project-row-dragging");
    };
  }, [projectRowDrag, handleProjectRowDragEnd]);

  const currentYearNum = currentYearProp;
  const currentWeekNum = currentWeekProp;
  const isCurrentWeekHeader = (w: { year: number; week: number }) =>
    mounted && w.year === currentYearNum && w.week === currentWeekNum;

  // Header labels follow the pan immediately; body columns CSS-translate to match.
  const headerWeeks = useMemo(() => {
    const weeks = data?.weeks ?? [];
    if (panWeeks === 0) return weeks;
    return weeks.map((w) => addWeeksToYearWeek(w.year, w.week, panWeeks));
  }, [data?.weeks, panWeeks]);

  const headerMonthSpans = useMemo(
    () => getMonthSpansForWeeks(headerWeeks),
    [headerWeeks]
  );

  const renderWeekHeaderCells = useCallback(
    (tableKey: string, borderClass = "border-border-subtle") =>
      headerWeeks.map((w, idx) => (
        <th
          key={`${tableKey}-${idx}-${w.year}-${w.week}`}
          {...headerPanHandlers}
          className={`border-r ${borderClass} px-0.5 py-1 text-center text-[10px] font-medium tabular-nums text-text-secondary ${headerPanClassName} ${
            isCurrentWeekHeader(w)
              ? "current-week-header bg-accent-primary-subtle text-accent-primary-text border-l border-r"
              : ""
          } ${highlightedColumnIndex === idx ? "time-grid-header-column-active" : ""}`}
        >
          v{w.week}
        </th>
      )),
    [
      headerWeeks,
      isCurrentWeekHeader,
      highlightedColumnIndex,
      headerPanHandlers,
      headerPanClassName,
    ]
  );

  const renderMonthHeaderCells = useCallback(
    (borderClass = "border-border-subtle") =>
      headerMonthSpans.map((span, i) => (
        <th
          key={i}
          colSpan={span.colSpan}
          {...headerPanHandlers}
          title={span.label}
          className={`overflow-hidden border-r ${borderClass} px-1.5 py-1 text-left text-[11px] font-medium uppercase tracking-wide text-text-secondary ${headerPanClassName}`}
        >
          <span className="block truncate">{span.label}</span>
        </th>
      )),
    [headerMonthSpans, headerPanHandlers, headerPanClassName]
  );

  if (error) {
    return (
      <div>
        {!embedMode && (
          <h1 className="text-heading-xl text-text-primary">Allocation</h1>
        )}
        <p className={embedMode ? "text-danger" : "mt-4 text-danger"}>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={embedMode ? "py-4" : ""}>
        <div className="mb-6 h-8 w-48 animate-pulse rounded bg-bg-muted" />
        <div className="mb-4 h-4 w-64 animate-pulse rounded bg-bg-muted" />
        <div className="h-64 animate-pulse rounded-lg border border-border bg-bg-default" />
      </div>
    );
  }

  const projectProbabilityMap = useMemo(
    () =>
      data && filteredData
        ? getProjectProbabilityMap(filteredData.projects)
        : new Map<string, number>(),
    [data, filteredData]
  );
  /** On project detail (embed) we always show raw hours and ignore probability. */
  const effectiveProbabilityDisplay = embedMode ? "none" : probabilityDisplay;
  const getOptimisticDisplayHours = useCallback(
    (consultantId: string, projectId: string, roleId: string | null, yearValue: number, weekValue: number) => {
      const key = allocationCellKey(consultantId, projectId, roleId, yearValue, weekValue);
      const raw = optimisticCellHours[key];
      if (raw == null) return undefined;
      const { displayHours } = getDisplayHours(
        raw,
        projectId,
        effectiveProbabilityDisplay,
        projectVisibility,
        projectProbabilityMap
      );
      return displayHours;
    },
    [
      optimisticCellHours,
      effectiveProbabilityDisplay,
      projectVisibility,
      projectProbabilityMap,
    ]
  );
  const perConsultant = useMemo(
    () =>
      filteredData && data
        ? buildPerConsultantView(
            filteredData,
            effectiveProbabilityDisplay,
            projectVisibility,
            projectProbabilityMap,
            getOptimisticDisplayHours
          )
        : [],
    [
      filteredData,
      data,
      effectiveProbabilityDisplay,
      projectVisibility,
      projectProbabilityMap,
      getOptimisticDisplayHours,
    ]
  );
  const shouldComputeCustomerView = !embedMode && activeTab === "customer";
  const shouldComputeProjectView = !embedMode && activeTab === "project";
  const perCustomer = useMemo(
    () =>
      shouldComputeCustomerView && filteredData && data
        ? buildPerCustomerView(
            filteredData,
            effectiveProbabilityDisplay,
            projectVisibility,
            projectProbabilityMap
          )
        : [],
    [
      shouldComputeCustomerView,
      filteredData,
      data,
      effectiveProbabilityDisplay,
      projectVisibility,
      projectProbabilityMap,
    ]
  );
  const perProject = useMemo(
    () =>
      shouldComputeProjectView && data && filteredData
        ? buildPerProjectView(
            filteredData,
            effectiveProbabilityDisplay,
            projectVisibility,
            projectProbabilityMap
          )
        : [],
    [
      shouldComputeProjectView,
      data,
      filteredData,
      effectiveProbabilityDisplay,
      projectVisibility,
      projectProbabilityMap,
    ]
  );
  const perProjectFiltered = useMemo(
    () =>
      showProjectsWithoutBooking
        ? perProject
        : perProject.filter((r) => r.consultantRows.length > 0),
    [showProjectsWithoutBooking, perProject]
  );
  const perConsultantInternal = useMemo(
    () => perConsultant.filter((r) => !r.consultant.isExternal),
    [perConsultant]
  );
  internalRowsRef.current = perConsultant;
  const perConsultantExternal = useMemo(
    () => perConsultant.filter((r) => r.consultant.isExternal),
    [perConsultant]
  );
  const expandableConsultantIds = useMemo(
    () =>
      new Set(
        perConsultant.filter((r) => r.projectRows.length > 0).map((r) => r.consultant.id)
      ),
    [perConsultant]
  );
  const expandableProjectIds = useMemo(
    () =>
      new Set(
        perProjectFiltered
          .filter((r) => r.consultantRows.length > 0)
          .map((r) => r.project.id)
      ),
    [perProjectFiltered]
  );
  const expandableCustomerIds = useMemo(
    () =>
      new Set(
        perCustomer
          .filter((r) => r.projectGroups.length > 0)
          .map((r) => r.customer.id)
      ),
    [perCustomer]
  );
  const currentWeek = currentWeekProp;
  const currentYear = currentYearProp;
  const monthSpans = useMemo(() => getMonthSpansForWeeks(data.weeks), [data.weeks]);
  const isCurrentWeek = (w: { year: number; week: number }) =>
    mounted && w.year === currentYear && w.week === currentWeek;

  const showConsultantView = !!embedMode || activeTab === "consultant";

  /** Consultants to show in embed mode (To plan row hidden on project detail only). */
  const perConsultantDisplay = useMemo(
    () => perConsultant.filter((r) => r.consultant.id !== TO_PLAN_CONSULTANT_ID),
    [perConsultant]
  );
  const perConsultantInternalDisplay = useMemo(
    () => perConsultantInternal.filter((r) => r.consultant.id !== TO_PLAN_CONSULTANT_ID),
    [perConsultantInternal]
  );
  /** Week totals (hours) for footer; only used in embed mode. */
  const weekTotalsHours = useMemo(
    () =>
      data.weeks.length > 0
        ? data.weeks.map((_, i) =>
            (embedMode ? perConsultantDisplay : perConsultantInternalDisplay).reduce(
              (sum, row) => sum + (row.percentDetailsByWeek?.[i]?.total ?? 0),
              0
            )
          )
        : [],
    [data.weeks, embedMode, perConsultantDisplay, perConsultantInternalDisplay]
  );
  const grandTotalHours = useMemo(
    () => weekTotalsHours.reduce((a, b) => a + b, 0),
    [weekTotalsHours]
  );

  /** Week revenue in each row's rate currency when embedMode has rates. */
  const weekTotalsMoney = useMemo(() => {
    if (!embedMode?.rates || !data) return null;
    const rates = embedMode.rates;
    const rowsForMoney = embedMode ? perConsultantDisplay : perConsultantInternalDisplay;
    return data.weeks.map((_, weekIndex) => {
      let sum = 0;
      for (const row of rowsForMoney) {
        for (const pr of row.projectRows) {
          const w = pr.weeks[weekIndex];
          const weekKey = data.weeks[weekIndex];
          if (!weekKey || !w) continue;
          const roleId =
            w.cell?.roleId ??
            pr.weeks.find((x) => x.cell?.roleId)?.cell?.roleId ??
            null;
          const cellKey = allocationCellKey(
            row.consultant.id,
            pr.projectId,
            roleId,
            weekKey.year,
            w.week
          );
          const hours =
            optimisticCellHours[cellKey] != null
              ? optimisticCellHours[cellKey]
              : (w.cell?.displayHours ?? 0);
          const rate = rates[roleId ?? ""] ?? 0;
          sum += hours * rate;
        }
      }
      return sum;
    });
  }, [embedMode, data, perConsultantDisplay, perConsultantInternalDisplay, optimisticCellHours]);
  const grandTotalMoney = useMemo(
    () => (weekTotalsMoney ? weekTotalsMoney.reduce((a, b) => a + b, 0) : 0),
    [weekTotalsMoney]
  );

  useEffect(() => {
    if (!ENABLE_PERF_DEBUG || !data) return;
    const start = performance.now();
    const ms = Math.round((performance.now() - start) * 100) / 100;
    fetch("http://127.0.0.1:7377/ingest/142286f1-190a-49b6-8e1e-854ceb792769", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "97edeb",
      },
      body: JSON.stringify({
        sessionId: "97edeb",
        runId: "perf-scan-1",
        hypothesisId: "H1",
        location: "AllocationPageClient.tsx",
        message: "allocation view build timing",
        data: {
          ms,
          weeks: data.weeks.length,
          consultants: data.consultants.length,
          allocations: data.allocations.length,
          perConsultantRows: perConsultant.length,
          perCustomerRows: shouldComputeCustomerView ? perCustomer.length : 0,
          perProjectRows: shouldComputeProjectView ? perProject.length : 0,
          activeTab,
          embedMode: Boolean(embedMode),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, [
    data,
    perConsultant.length,
    perCustomer.length,
    perProject.length,
    shouldComputeCustomerView,
    shouldComputeProjectView,
    activeTab,
    embedMode,
  ]);

  return (
    <div
      className={
        embedMode
          ? "flex min-h-0 flex-col"
          : "flex min-h-0 flex-1 flex-col"
      }
    >
      {!embedMode && (
        <PageHeader
          title={
            activeTab === "consultant"
              ? "Consultant"
              : activeTab === "customer"
                ? "Customer"
                : activeTab === "project"
                  ? "Project"
                  : "Allocation history"
          }
          description={
            activeTab === "history"
              ? undefined
              : "Manage allocations per week"
          }
          className="mb-3 shrink-0"
        />
      )}

      {data && activeTab !== "history" ? (
        <div
          className={`flex shrink-0 items-center justify-end gap-1 ${
            embedMode ? "mb-1.5 px-1" : "mb-1.5 px-2"
          }`}
        >
          <div className="flex items-center gap-1">
            {(!embedMode || embedShowTeamFilter) &&
            (data.teams.length > 0 ||
              data.roles.length > 0 ||
              (!embedMode && activeTab === "project")) ? (
              <AllocationViewControls
                teams={data.teams}
                roles={data.roles}
                teamFilterId={teamFilterId}
                onTeamFilterChange={setTeamFilterId}
                roleFilterId={defaultRoleFilterId}
                onRoleFilterChange={setDefaultRoleFilterId}
                showUnbookedToggle={!embedMode && activeTab === "project"}
                showProjectsWithoutBooking={showProjectsWithoutBooking}
                onShowProjectsWithoutBookingChange={
                  setShowProjectsWithoutBooking
                }
                showView={!embedMode}
                probabilityDisplay={probabilityDisplay}
                onProbabilityDisplayChange={setProbabilityDisplay}
                projectVisibility={projectVisibility}
                onProjectVisibilityChange={setProjectVisibility}
              />
            ) : null}
            <AllocationWeekNav
              onShift={shiftWeeks}
              disabled={Boolean(embedMode && embedWeekNavLoading)}
              getUrl={
                embedMode && onWeekRangeChange ? undefined : getShiftUrl
              }
              prefetch={
                embedMode && onWeekRangeChange
                  ? undefined
                  : router.prefetch.bind(router)
              }
            />
          </div>
        </div>
      ) : null}

      <div
        ref={allocationTablesRef}
        className={`allocation-tables flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-default ${
          panning ? "allocation-tables-panning" : ""
        }`}
        style={{
          ...gridPanStyle,
          ["--allocation-name-col-width" as string]: allocationNameColWidth,
          ["--allocation-actions-col-width" as string]:
            allocationActionsColWidth,
          ["--allocation-week-col-width" as string]: allocationWeekColWidth,
          ["--allocation-week-col-width-embed" as string]:
            allocationWeekColWidth,
        }}
      >
          {showConsultantView && (
            <AllocationConsultantTables
              embedMode={embedMode}
              data={data}
              monthSpans={monthSpans}
              renderMonthHeaderCells={renderMonthHeaderCells}
              renderWeekHeaderCells={renderWeekHeaderCells}
              perConsultantDisplay={perConsultantDisplay}
              perConsultantInternal={perConsultantInternal}
              perConsultantExternal={perConsultantExternal}
              expandableConsultantIds={expandableConsultantIds}
              onExpandAll={() =>
                setExpandedConsultants(new Set(expandableConsultantIds))
              }
              onCollapseAll={() => setExpandedConsultants(new Set())}
              expandedConsultants={expandedConsultants}
              toggleConsultant={toggleConsultant}
              cellDragConsultant={cellDragConsultant}
              setCellDragConsultant={setCellDragConsultant}
              cellDragWeekStart={cellDragWeekStart}
              setCellDragWeekStart={setCellDragWeekStart}
              cellDragWeekEnd={cellDragWeekEnd}
              setCellDragWeekEnd={setCellDragWeekEnd}
              getAllocationCellBgClassFn={getAllocationCellBgClass}
              isCurrentWeek={isCurrentWeek}
              editingCellConsultant={editingCellConsultant}
              setEditingCellConsultant={setEditingCellConsultant}
              editingCellConsultantValue={editingCellConsultantValue}
              setEditingCellConsultantValue={setEditingCellConsultantValue}
              handleCellConsultantInputBlur={handleCellConsultantInputBlur}
              handleCellConsultantInputKeyDown={handleCellConsultantInputKeyDown}
              savingCellConsultant={savingCellConsultant}
              optimisticCellHours={optimisticCellHours}
              projectRowDrag={projectRowDrag}
              setProjectRowDrag={setProjectRowDrag}
              setProjectRowDragMoved={setProjectRowDragMoved}
              preventNextCellClickRef={preventNextCellClickRef}
              loadingDeleteBooking={loadingDeleteBooking}
              setLoadingDeleteBooking={setLoadingDeleteBooking}
              setDeleteBookingDialog={setDeleteBookingDialog}
              weekTotalsHours={weekTotalsHours}
              grandTotalHours={grandTotalHours}
              weekTotalsMoney={weekTotalsMoney}
              grandTotalMoney={grandTotalMoney}
            />
          )}
          {activeTab === "history" && (
            <div className="min-h-0 flex-1 overflow-auto p-2">
              <AllocationHistoryTable
                entries={historyEntries}
                loading={historyLoading}
              />
            </div>
          )}
          {(activeTab === "customer" || activeTab === "project") && (
            <AllocationCustomerProjectTabs
              tab={activeTab}
              data={data}
              monthSpans={monthSpans}
              isCurrentWeek={isCurrentWeek}
              renderMonthHeaderCells={renderMonthHeaderCells}
              renderWeekHeaderCells={renderWeekHeaderCells}
              expandedCustomers={expandedCustomers}
              toggleCustomer={toggleCustomer}
              perCustomer={perCustomer}
              expandedProjects={expandedProjects}
              toggleProject={toggleProject}
              expandableCustomerIds={expandableCustomerIds}
              onExpandAllCustomers={() =>
                setExpandedCustomers(new Set(expandableCustomerIds))
              }
              onCollapseAllCustomers={() => setExpandedCustomers(new Set())}
              expandableProjectIds={expandableProjectIds}
              onExpandAllProjects={() =>
                setExpandedProjects(new Set(expandableProjectIds))
              }
              onCollapseAllProjects={() => setExpandedProjects(new Set())}
              perProject={perProjectFiltered}
              editingCell={editingCell}
              setEditingCell={setEditingCell}
              editingCellValue={editingCellValue}
              setEditingCellValue={setEditingCellValue}
              handleCellInputBlur={handleCellInputBlur}
              handleCellInputKeyDown={handleCellInputKeyDown}
              savingCell={savingCell}
              cellError={cellError}
              setAddModalOpen={setAddModalOpen}
              setAddInitialParams={setAddInitialParams}
              editingCellConsultant={editingCellConsultant}
              setEditingCellConsultant={setEditingCellConsultant}
              editingCellConsultantValue={editingCellConsultantValue}
              setEditingCellConsultantValue={setEditingCellConsultantValue}
              saveCellHoursConsultant={saveCellHoursConsultant}
              handleCellConsultantInputBlur={handleCellConsultantInputBlur}
              handleCellConsultantInputKeyDown={handleCellConsultantInputKeyDown}
              savingCellConsultant={savingCellConsultant}
              formatWeekLabel={formatAllocationWeekLabel}
              openConsultantWeekRangeEdit={(params) => setEditRangeModalParams(params)}
            />
          )}
      </div>

      <AddAllocationModal
        isOpen={addModalOpen}
        onClose={() => {
          setAddModalOpen(false);
          setAddInitialParams(null);
        }}
        onSuccess={handleSuccess}
        year={year}
        weekFrom={weekFrom}
        weekTo={weekTo}
        initialConsultantId={addInitialParams?.consultantId}
        initialConsultantName={addInitialParams?.consultantName}
        initialWeek={addInitialParams?.week}
        initialYear={addInitialParams?.year}
        initialWeekFrom={addInitialParams?.weekFrom}
        initialWeekTo={addInitialParams?.weekTo}
        initialProjectId={addInitialParams?.projectId}
        initialProjectLabel={addInitialParams?.projectLabel}
      />

      <Dialog
        open={deleteBookingDialog !== null}
        onOpenChange={(open) => !open && setDeleteBookingDialog(null)}
        title="Remove booking"
      >
        {deleteBookingDialog && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-text-primary">
              Remove booking for <strong>{deleteBookingDialog.consultantName}</strong> on{" "}
              <strong>{deleteBookingDialog.projectLabel}</strong>?
            </p>
            <div className="flex flex-col gap-2">
              <Button
                variant="danger"
                disabled={deletingBooking}
                onClick={async () => {
                  setDeletingBooking(true);
                  try {
                    const ids = deleteBookingDialog.allocations.map((a) => a.allocationId);
                    await deleteAllocationsWithHistory(ids);
                    handleSuccess();
                    setDeleteBookingDialog(null);
                  } finally {
                    setDeletingBooking(false);
                  }
                }}
              >
                Remove entire booking
              </Button>
              <div className="border-t border-panel pt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-primary opacity-70">
                  Or select weeks to remove
                </p>
                <div className="ds-dropdown-list-scroll max-h-48 space-y-1.5">
                  {deleteBookingDialog.allocations.map((a) => (
                    <label
                      key={a.allocationId}
                      className="flex cursor-pointer items-center gap-2 text-sm text-text-primary"
                    >
                      <input
                        type="checkbox"
                        checked={deleteBookingDialog.selectedAllocationIds.has(a.allocationId)}
                        onChange={() => {
                          setDeleteBookingDialog((prev) => {
                            if (!prev) return null;
                            const next = new Set(prev.selectedAllocationIds);
                            if (next.has(a.allocationId)) next.delete(a.allocationId);
                            else next.add(a.allocationId);
                            return { ...prev, selectedAllocationIds: next };
                          });
                        }}
                        className="rounded border-form"
                      />
                      <span>{formatAllocationWeekLabel(a.week, a.year)}</span>
                    </label>
                  ))}
                </div>
                <Button
                  variant="secondary"
                  className="mt-2 border-danger text-danger hover:bg-danger/10"
                  disabled={deletingBooking || deleteBookingDialog.selectedAllocationIds.size === 0}
                  onClick={async () => {
                    const idsToDelete = deleteBookingDialog.allocations
                      .filter((a) => deleteBookingDialog.selectedAllocationIds.has(a.allocationId))
                      .map((a) => a.allocationId);
                    setDeletingBooking(true);
                    try {
                      await deleteAllocationsWithHistory(idsToDelete);
                      handleSuccess();
                      setDeleteBookingDialog(null);
                    } finally {
                      setDeletingBooking(false);
                    }
                  }}
                >
                  Remove selected ({deleteBookingDialog.selectedAllocationIds.size})
                </Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      <EditAllocationModal
        allocation={editingAllocation}
        isOpen={editingAllocation !== null}
        onClose={() => setEditingAllocation(null)}
        onSuccess={handleSuccess}
      />

      {editRangeModalParams && (
        <EditAllocationRangeModal
          isOpen={true}
          onClose={() => setEditRangeModalParams(null)}
          onSuccess={(savedHours) => {
            const params = editRangeModalParams;
            if (params) {
              setOptimisticCellHours((prev) => {
                const next = { ...prev };
                if (typeof savedHours === "number") {
                  for (const w of params.weeks) {
                    const key = allocationCellKey(
                      params.consultantId,
                      params.projectId,
                      params.roleId,
                      w.year,
                      w.week
                    );
                    if (savedHours > 0) next[key] = savedHours;
                    else delete next[key];
                  }
                } else {
                  for (const { year, week, hours } of savedHours) {
                    const key = allocationCellKey(
                      params.consultantId,
                      params.projectId,
                      params.roleId,
                      year,
                      week
                    );
                    if (hours > 0) next[key] = hours;
                    else delete next[key];
                  }
                }
                return next;
              });
            }
            router.refresh();
          }}
          consultantId={editRangeModalParams.consultantId}
          consultantName={editRangeModalParams.consultantName}
          projectId={editRangeModalParams.projectId}
          projectLabel={editRangeModalParams.projectLabel}
          roleId={editRangeModalParams.roleId}
          roleName={editRangeModalParams.roleName}
          weeks={editRangeModalParams.weeks}
          availableHoursByWeek={editRangeModalParams.availableHoursByWeek}
        />
      )}
    </div>
  );
}
