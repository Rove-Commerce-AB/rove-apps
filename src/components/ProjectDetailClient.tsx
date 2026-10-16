"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Plus } from "lucide-react";
import {
  updateProject,
  getUniqueJiraAndDevopsProjects,
  type IntegrationProjectOption,
} from "@/lib/projectsClient";
import { deleteProjectAction } from "@/app/(app)/projects/actions";
import { getCustomers } from "@/lib/customersClient";
import { getConsultantsList } from "@/lib/consultantsClient";
import { ROUTES, customerHref } from "@/lib/routes";
import { moneyLabel } from "@/lib/currency";
import { getProjectAllocationData } from "@/app/(app)/allocation/actions";
import type {
  ProjectBillingType,
  ProjectWithDetails,
  ProjectType,
} from "@/types";
import type { AllocationPageData } from "@/lib/allocationPageTypes";
import { DetailPageDeleteFooter } from "./detail/DetailPageDeleteFooter";
import {
  Button,
  ConfirmModal,
  Dialog,
  DetailPageHeader,
  FieldLabel,
  FieldValue,
  InlineEditFieldContainer,
  InlineEditStatus,
  InlineEditTrigger,
  Input,
  IconButton,
  OptionSegments,
  Panel,
  PanelSectionTitle,
  PageLoading,
  Select,
  SAVED_DURATION_MS,
  editInputClass,
  editTriggerClass,
} from "@/components/ui";
import { moveEntireBookingAction } from "@/app/(app)/projects/[id]/actions";
import { ProjectRatesTab } from "./ProjectRatesTab";
import { AddProjectRateModal } from "./AddProjectRateModal";
import { isInlineEditValueChanged } from "@/lib/inlineEdit";

const AllocationPageClient = dynamic(
  () =>
    import("./AllocationPageClient").then((m) => ({
      default: m.AllocationPageClient,
    })),
  { ssr: false }
);

/** Same as Allocation page: week column 29px; left col 180px, two Tot cols 64px each in embed. Used to fit as many weeks as possible in planning panel. */
const PLANNING_LEFT_COL_WIDTH = 180;
const PLANNING_TOT_COLS_WIDTH = 64 * 2; // two Tot columns
const PLANNING_MIN_WEEK_WIDTH = 29;
const PLANNING_EXTRA_PADDING = 56;
const PLANNING_MIN_WEEKS = 8;
const PLANNING_MAX_WEEKS = 52;
const PLANNING_VIEWPORT_DEBOUNCE_MS = 100;

const tableBorder = "border-panel";

const PROBABILITY_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;
type EditField =
  | "name"
  | "customerId"
  | "projectManagerId"
  | "integration"
  | "budgetHours"
  | "budgetMoney"
  | "startDate"
  | "endDate"
  | "probability"
  | null;

type Props = {
  project: ProjectWithDetails;
  allocationData: AllocationPageData | null;
  allocationError: string | null;
  allocationYear: number;
  allocationWeekFrom: number;
  allocationWeekTo: number;
  currentYear: number;
  currentWeek: number;
  /** Role ID -> rate per hour in the customer's billing currency. */
  allocationRates?: Record<string, number>;
  isAdmin?: boolean;
};

export function ProjectDetailClient({
  project: initial,
  allocationData,
  allocationError,
  allocationYear,
  allocationWeekFrom,
  allocationWeekTo,
  currentYear,
  currentWeek,
  allocationRates,
  isAdmin = false,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [customerId, setCustomerId] = useState(initial.customer_id);
  const [projectManagerId, setProjectManagerId] = useState<string>(
    initial.projectManagerId ?? ""
  );
  const [projectManagerName, setProjectManagerName] = useState<string | null>(
    initial.projectManagerName ?? null
  );
  const [isActive, setIsActive] = useState(initial.isActive);
  const [type, setType] = useState<ProjectType>(initial.type);
  const [billingType, setBillingType] = useState<ProjectBillingType>(
    initial.billingType ?? "hourly"
  );
  const [startDate, setStartDate] = useState(initial.startDate ?? "");
  const [endDate, setEndDate] = useState(initial.endDate ?? "");
  const [probability, setProbability] = useState(initial.probability ?? 100);
  const [budgetHours, setBudgetHours] = useState<number | null>(
    initial.budgetHours != null ? Number(initial.budgetHours) : null
  );
  const [budgetMoney, setBudgetMoney] = useState<number | null>(
    initial.budgetMoney != null ? Number(initial.budgetMoney) : null
  );
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [projectManagerOptions, setProjectManagerOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [ratesRefreshKey, setRatesRefreshKey] = useState(0);
  const [addRateModalOpen, setAddRateModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<EditField>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [showSaved, setShowSaved] = useState(false);
  const originalEditValueRef = useRef<string>("");
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedFieldRef = useRef<EditField>(null);
  const [integrationOptions, setIntegrationOptions] = useState<
    IntegrationProjectOption[]
  >([]);
  const [planningData, setPlanningData] = useState<AllocationPageData | null>(allocationData);
  const [planningError, setPlanningError] = useState<string | null>(allocationError);
  const [planningYear, setPlanningYear] = useState(allocationYear);
  const [planningWeekFrom, setPlanningWeekFrom] = useState(allocationWeekFrom);
  const [planningWeekTo, setPlanningWeekTo] = useState(allocationWeekTo);
  const [planningLoading, setPlanningLoading] = useState(false);
  const [showMoveBookingModal, setShowMoveBookingModal] = useState(false);
  const [moveWeeks, setMoveWeeks] = useState("1");
  const [moveForward, setMoveForward] = useState(true);
  const [moveBookingError, setMoveBookingError] = useState<string | null>(null);
  const [moveBookingSubmitting, setMoveBookingSubmitting] = useState(false);
  const planningContainerRef = useRef<HTMLDivElement>(null);
  const [planningViewportReady, setPlanningViewportReady] = useState(false);
  const planningViewportReadySetRef = useRef(false);

  useEffect(() => {
    setPlanningData(allocationData);
    setPlanningError(allocationError);
    setPlanningYear(allocationYear);
    setPlanningWeekFrom(allocationWeekFrom);
    setPlanningWeekTo(allocationWeekTo);
  }, [allocationData, allocationError, allocationYear, allocationWeekFrom, allocationWeekTo]);

  const handleWeekRangeChange = useCallback(
    async (year: number, weekFrom: number, weekTo: number) => {
      setPlanningLoading(true);
      try {
        const { data, error } = await getProjectAllocationData(
          initial.id,
          initial.customer_id ?? "",
          year,
          weekFrom,
          weekTo
        );
        setPlanningData(data);
        setPlanningError(error);
        setPlanningYear(year);
        setPlanningWeekFrom(weekFrom);
        setPlanningWeekTo(weekTo);
        const q = `year=${year}&from=${weekFrom}&to=${weekTo}`;
        router.replace(`/projects/${initial.id}?${q}`, { scroll: false });
      } finally {
        setPlanningLoading(false);
        setPlanningViewportReady(true);
      }
    },
    [initial.id, initial.customer_id, router]
  );

  useEffect(() => {
    const el = planningContainerRef.current;
    if (!el) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const updateWeeks = () => {
      const w = el.clientWidth;
      if (w < 100) return;
      const available = w - PLANNING_LEFT_COL_WIDTH - PLANNING_TOT_COLS_WIDTH - PLANNING_EXTRA_PADDING;
      const visibleWeeks = Math.floor(available / PLANNING_MIN_WEEK_WIDTH);
      if (visibleWeeks < PLANNING_MIN_WEEKS) return;

      const clamped = Math.min(PLANNING_MAX_WEEKS, visibleWeeks);
      const currentSpan =
        planningWeekFrom <= planningWeekTo
          ? planningWeekTo - planningWeekFrom + 1
          : 52 - planningWeekFrom + 1 + planningWeekTo;

      if (clamped === currentSpan) {
        if (!planningViewportReadySetRef.current) {
          planningViewportReadySetRef.current = true;
          setPlanningViewportReady(true);
        }
        return;
      }

      const newFrom = planningWeekFrom;
      const newTo =
        planningWeekFrom + clamped - 1 <= 52
          ? planningWeekFrom + clamped - 1
          : planningWeekFrom + clamped - 1 - 52;

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleWeekRangeChange(planningYear, newFrom, newTo);
      }, PLANNING_VIEWPORT_DEBOUNCE_MS);
    };

    const ro = new ResizeObserver(updateWeeks);
    ro.observe(el);
    updateWeeks();

    return () => {
      ro.disconnect();
      clearTimeout(timeoutId);
    };
  }, [planningYear, planningWeekFrom, planningWeekTo, handleWeekRangeChange]);

  const syncFromInitial = useCallback(() => {
    setName(initial.name);
    setCustomerId(initial.customer_id);
    setProjectManagerId(initial.projectManagerId ?? "");
    setProjectManagerName(initial.projectManagerName ?? null);
    setIsActive(initial.isActive);
    setType(initial.type);
    setBillingType(initial.billingType ?? "hourly");
    setStartDate(initial.startDate ?? "");
    setEndDate(initial.endDate ?? "");
    setProbability(initial.probability ?? 100);
    setBudgetHours(initial.budgetHours != null ? Number(initial.budgetHours) : null);
    setBudgetMoney(initial.budgetMoney != null ? Number(initial.budgetMoney) : null);
  }, [initial]);

  useEffect(() => {
    syncFromInitial();
  }, [syncFromInitial]);

  useEffect(() => {
    getCustomers()
      .then((c) => setCustomers(c))
      .catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    getConsultantsList()
      .then((rows) =>
        setProjectManagerOptions(
          rows.map((r) => ({ value: r.id, label: r.name }))
        )
      )
      .catch(() => setProjectManagerOptions([]));
  }, []);

  useEffect(() => {
    const label = projectManagerId
      ? projectManagerOptions.find((o) => o.value === projectManagerId)?.label ??
        null
      : null;
    setProjectManagerName(label);
  }, [projectManagerId, projectManagerOptions]);

  useEffect(() => {
    getUniqueJiraAndDevopsProjects()
      .then(setIntegrationOptions)
      .catch(() => setIntegrationOptions([{ value: "", label: "—" }]));
  }, []);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  const saveField = async (field: EditField, value: string) => {
    if (field == null) return;
    setError(null);
    const trimmed = value.trim();
    if (field === "name" && !trimmed) {
      setError("Project name is required");
      return;
    }
    if (field === "customerId" && !trimmed) {
      setError("Customer is required");
      return;
    }
    if (field === "probability") {
      const num = parseInt(trimmed, 10);
      if (Number.isNaN(num) || num < 10 || num > 100 || num % 10 !== 0) {
        setError("Probability must be 10, 20, … 100");
        return;
      }
    }
    if (field === "budgetHours" && trimmed !== "") {
      const num = parseInt(trimmed, 10);
      if (num === null || Number.isNaN(num) || num < 0) {
        setError("Enter a positive integer or leave empty");
        return;
      }
    }
    if (field === "budgetMoney" && trimmed !== "") {
      const num = parseInt(trimmed, 10);
      if (num === null || Number.isNaN(num) || num < 0) {
        setError(`Enter a positive integer (${moneyLabel(initial.billingCurrency)}) or leave empty`);
        return;
      }
    }
    switch (field) {
      case "name": setName(trimmed); break;
      case "customerId": setCustomerId(trimmed); break;
      case "projectManagerId": {
        const id = trimmed === "" ? "" : trimmed;
        setProjectManagerId(id);
        const label = id
          ? projectManagerOptions.find((o) => o.value === id)?.label ?? null
          : null;
        setProjectManagerName(label);
        break;
      }
      case "startDate": setStartDate(trimmed); break;
      case "endDate": setEndDate(trimmed); break;
      case "probability": setProbability(parseInt(trimmed, 10)); break;
      case "budgetHours":
        setBudgetHours(trimmed === "" ? null : parseInt(trimmed, 10));
        break;
      case "budgetMoney":
        setBudgetMoney(trimmed === "" ? null : parseInt(trimmed, 10));
        break;
      default: break;
    }
    lastSavedFieldRef.current = field;
    setEditingField(null);
    setShowSaved(true);
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    savedTimeoutRef.current = setTimeout(() => {
      lastSavedFieldRef.current = null;
      setShowSaved(false);
      savedTimeoutRef.current = null;
    }, SAVED_DURATION_MS);
    setSubmitting(true);
    try {
      switch (field) {
        case "name":
          await updateProject(initial.id, { name: trimmed });
          break;
        case "customerId":
          await updateProject(initial.id, { customer_id: trimmed });
          break;
        case "projectManagerId":
          await updateProject(initial.id, {
            project_manager_id: trimmed === "" ? null : trimmed,
          });
          break;
        case "startDate":
          await updateProject(initial.id, { start_date: trimmed || null });
          break;
        case "endDate":
          await updateProject(initial.id, { end_date: trimmed || null });
          break;
        case "probability":
          await updateProject(initial.id, { probability: parseInt(trimmed, 10) });
          break;
        case "integration":
          if (trimmed === "") {
            await updateProject(initial.id, {
              jira_project_key: null,
              devops_project: null,
              clickup_project_id: null,
            });
          } else if (trimmed.startsWith("jira:")) {
            await updateProject(initial.id, {
              jira_project_key: trimmed.slice(5),
              devops_project: null,
              clickup_project_id: null,
            });
          } else if (trimmed.startsWith("devops:")) {
            await updateProject(initial.id, {
              jira_project_key: null,
              devops_project: trimmed.slice(7),
              clickup_project_id: null,
            });
          } else if (trimmed.startsWith("clickup:")) {
            await updateProject(initial.id, {
              jira_project_key: null,
              devops_project: null,
              clickup_project_id: trimmed.slice(8),
            });
          }
          break;
        case "budgetHours":
          await updateProject(initial.id, {
            budget_hours: trimmed === "" ? null : parseInt(trimmed, 10),
          });
          break;
        case "budgetMoney":
          await updateProject(initial.id, {
            budget_money: trimmed === "" ? null : parseInt(trimmed, 10),
          });
          break;
        default:
          break;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
      setShowSaved(false);
      lastSavedFieldRef.current = null;
      switch (field) {
        case "name": setName(initial.name); break;
        case "customerId": setCustomerId(initial.customer_id); break;
        case "projectManagerId":
          setProjectManagerId(initial.projectManagerId ?? "");
          setProjectManagerName(initial.projectManagerName ?? null);
          break;
        case "startDate": setStartDate(initial.startDate ?? ""); break;
        case "endDate": setEndDate(initial.endDate ?? ""); break;
        case "probability": setProbability(initial.probability ?? 100); break;
        case "budgetHours":
          setBudgetHours(initial.budgetHours != null ? Number(initial.budgetHours) : null);
          break;
        case "budgetMoney":
          setBudgetMoney(initial.budgetMoney != null ? Number(initial.budgetMoney) : null);
          break;
        default: break;
      }
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (field: EditField, value: string) => {
    setError(null);
    originalEditValueRef.current = value;
    setEditValue(value);
    setEditingField(field);
  };

  const cancelEdit = () => {
    setEditValue(originalEditValueRef.current);
    setEditingField(null);
    setError(null);
  };

  const commitEdit = (overrideValue?: string) => {
    if (editingField == null) return;
    const val = overrideValue ?? editValue;
    if (!isInlineEditValueChanged(originalEditValueRef.current, val)) {
      setEditingField(null);
      return;
    }
    saveField(editingField, val);
  };

  const inlineEditStatus =
    submitting ? "saving" : showSaved ? "saved" : error ? "error" : "idle";

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      await deleteProjectAction(initial.id, initial.customer_id);
      setShowDeleteConfirm(false);
      const customerId = initial.customer_id;
      if (customerId) {
        router.push(customerHref(customerId));
      } else {
        router.push(ROUTES.customers);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const setActive = async (next: boolean) => {
    if (next === isActive) return;
    setError(null);
    setSubmitting(true);
    try {
      await updateProject(initial.id, { is_active: next });
      setIsActive(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSubmitting(false);
    }
  };

  const setProjectType = async (next: ProjectType) => {
    if (next === type) return;
    setError(null);
    setSubmitting(true);
    try {
      const patch: { type: ProjectType; billing_type?: ProjectBillingType } = {
        type: next,
      };
      if (next !== "customer" && billingType !== "hourly") {
        patch.billing_type = "hourly";
      }
      await updateProject(initial.id, patch);
      setType(next);
      if (patch.billing_type) setBillingType(patch.billing_type);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSubmitting(false);
    }
  };

  const setProjectBillingType = async (next: ProjectBillingType) => {
    if (next === billingType) return;
    setError(null);
    setSubmitting(true);
    try {
      await updateProject(initial.id, { billing_type: next });
      setBillingType(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMoveBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const weeks = Math.max(1, Math.floor(Number(moveWeeks.replace(",", ".")) || 1));
    const delta = moveForward ? weeks : -weeks;
    setMoveBookingError(null);
    setMoveBookingSubmitting(true);
    try {
      const result = await moveEntireBookingAction(initial.id, delta);
      if (result.ok) {
        setShowMoveBookingModal(false);
        setMoveWeeks("1");
        setMoveForward(true);
        router.refresh();
        if (planningData) {
          setPlanningLoading(true);
          const { data, error } = await getProjectAllocationData(
            initial.id,
            initial.customer_id ?? "",
            planningYear,
            planningWeekFrom,
            planningWeekTo
          );
          setPlanningData(data);
          setPlanningError(error);
          setPlanningLoading(false);
        }
      } else {
        setMoveBookingError(result.error ?? "Failed to move");
      }
    } finally {
      setMoveBookingSubmitting(false);
    }
  };

  const projectInitials = initial.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const customerOptions = (() => {
    const base = customers.map((c) => ({ value: c.id, label: c.name }));
    if (
      customerId &&
      initial.customerName &&
      !customers.some((c) => c.id === customerId)
    ) {
      return [{ value: customerId, label: initial.customerName }, ...base];
    }
    return base;
  })();

  return (
    <>
      <div className="w-full max-w-3xl">
        <DetailPageHeader
          backHref={customerHref(initial.customer_id)}
          backLabel={`Back to ${initial.customerName ?? "Customer"}`}
          avatar={
            <div
              className="flex h-full w-full items-center justify-center rounded-full"
              style={{ backgroundColor: initial.color }}
              aria-hidden
            >
              <span className="text-xs font-semibold text-white">
                {projectInitials}
              </span>
            </div>
          }
          title={name}
          subtitle={initial.customerName}
        />

        {error && (
          <p className="mb-4 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-5">
        {/* GENERAL INFORMATION */}
        <Panel>
          <PanelSectionTitle>GENERAL INFORMATION</PanelSectionTitle>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 p-3 sm:grid-cols-2">
            <div className="min-w-0">
              <FieldLabel>Project name</FieldLabel>
              <div className="mt-0.5">
                <InlineEditFieldContainer
                  isEditing={editingField === "name"}
                  onRequestClose={commitEdit}
                  showSavedIndicator={showSaved && lastSavedFieldRef.current === "name"}
                  displayContent={
                    <InlineEditTrigger onClick={() => startEdit("name", name)}>
                      <FieldValue>{name}</FieldValue>
                    </InlineEditTrigger>
                  }
                  editContent={
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => commitEdit()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      className={editInputClass}
                      placeholder="Website redesign"
                      autoFocus
                    />
                  }
                  statusContent={<InlineEditStatus status={inlineEditStatus} message={error} />}
                />
              </div>
            </div>

            <div className="min-w-0">
              <FieldLabel>Jira / DevOps / ClickUp project</FieldLabel>
              <div className="mt-0.5">
                <InlineEditFieldContainer
                  isEditing={editingField === "integration"}
                  onRequestClose={commitEdit}
                  showSavedIndicator={showSaved && lastSavedFieldRef.current === "integration"}
                  displayContent={
                    <InlineEditTrigger
                      onClick={() => {
                        const val = initial.jiraProjectKey
                          ? `jira:${initial.jiraProjectKey}`
                          : initial.devopsProject
                            ? `devops:${initial.devopsProject}`
                            : initial.clickupProjectId
                              ? `clickup:${initial.clickupProjectId}`
                            : "";
                        startEdit("integration", val);
                      }}
                    >
                      {initial.jiraProjectKey || initial.devopsProject || initial.clickupProjectId ? (
                        <FieldValue>
                          {(() => {
                            const integrationValue = initial.jiraProjectKey
                              ? `jira:${initial.jiraProjectKey}`
                              : initial.devopsProject
                                ? `devops:${initial.devopsProject}`
                                : `clickup:${initial.clickupProjectId}`;
                            const option = integrationOptions.find(
                              (o) => o.value === integrationValue
                            );
                            if (option?.label) return option.label;
                            if (initial.jiraProjectKey)
                              return `Jira: ${initial.jiraProjectKey}`;
                            if (initial.devopsProject)
                              return `DevOps: ${initial.devopsProject}`;
                            return `ClickUp: ${initial.clickupProjectId}`;
                          })()}
                        </FieldValue>
                      ) : (
                        <span className="text-sm text-text-primary opacity-60">—</span>
                      )}
                    </InlineEditTrigger>
                  }
                  editContent={
                    <Select
                      value={editValue}
                      onValueChange={(v) => {
                        setEditValue(v);
                        commitEdit(v);
                      }}
                      onBlur={() => commitEdit()}
                      variant="inlineEdit"
                      options={integrationOptions}
                      placeholder="Select project"
                      className="min-w-0 flex-1 w-full"
                      triggerClassName={editTriggerClass}
                    />
                  }
                  statusContent={<InlineEditStatus status={inlineEditStatus} message={error} />}
                />
              </div>
            </div>

            <div className="min-w-0">
              <FieldLabel>Project manager</FieldLabel>
              <div className="mt-0.5">
                <InlineEditFieldContainer
                  isEditing={editingField === "projectManagerId"}
                  onRequestClose={commitEdit}
                  showSavedIndicator={
                    showSaved && lastSavedFieldRef.current === "projectManagerId"
                  }
                  displayContent={
                    <InlineEditTrigger
                      onClick={() =>
                        startEdit("projectManagerId", projectManagerId ?? "")
                      }
                    >
                      {projectManagerName ? (
                        <FieldValue>{projectManagerName}</FieldValue>
                      ) : (
                        <span className="text-sm text-text-primary opacity-60">
                          —
                        </span>
                      )}
                    </InlineEditTrigger>
                  }
                  editContent={
                    <Select
                      value={editValue}
                      onValueChange={(v) => {
                        setEditValue(v);
                        commitEdit(v);
                      }}
                      onBlur={() => commitEdit()}
                      variant="inlineEdit"
                      options={[
                        { value: "", label: "—" },
                        ...projectManagerOptions,
                      ]}
                      placeholder="Select"
                      className="min-w-0 flex-1 w-full"
                      triggerClassName={editTriggerClass}
                    />
                  }
                  statusContent={
                    <InlineEditStatus status={inlineEditStatus} message={error} />
                  }
                />
              </div>
            </div>

            <div className="min-w-0">
              <FieldLabel>Budget (hours)</FieldLabel>
              <div className="mt-0.5">
                <InlineEditFieldContainer
                  isEditing={editingField === "budgetHours"}
                  onRequestClose={commitEdit}
                  showSavedIndicator={showSaved && lastSavedFieldRef.current === "budgetHours"}
                  displayContent={
                    <InlineEditTrigger
                      onClick={() =>
                        startEdit("budgetHours", budgetHours != null ? String(budgetHours) : "")
                      }
                    >
                      {budgetHours != null ? (
                        <FieldValue>{budgetHours} h</FieldValue>
                      ) : (
                        <span className="text-sm text-text-primary opacity-60">—</span>
                      )}
                    </InlineEditTrigger>
                  }
                  editContent={
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => commitEdit()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      placeholder="—"
                      className={editInputClass}
                      autoFocus
                    />
                  }
                  statusContent={<InlineEditStatus status={inlineEditStatus} message={error} />}
                />
              </div>
            </div>

            <div className="min-w-0">
              <FieldLabel>
                {billingType === "fixed"
                  ? `Contract value (${moneyLabel(initial.billingCurrency)})`
                  : `Budget (${moneyLabel(initial.billingCurrency)})`}
              </FieldLabel>
              <div className="mt-0.5">
                <InlineEditFieldContainer
                  isEditing={editingField === "budgetMoney"}
                  onRequestClose={commitEdit}
                  showSavedIndicator={showSaved && lastSavedFieldRef.current === "budgetMoney"}
                  displayContent={
                    <InlineEditTrigger
                      onClick={() =>
                        startEdit(
                          "budgetMoney",
                          budgetMoney != null ? String(budgetMoney) : ""
                        )
                      }
                    >
                      {budgetMoney != null ? (
                        <FieldValue>
                          {String(budgetMoney).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0")} {moneyLabel(initial.billingCurrency)}
                        </FieldValue>
                      ) : (
                        <span className="text-sm text-text-primary opacity-60">—</span>
                      )}
                    </InlineEditTrigger>
                  }
                  editContent={
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => commitEdit()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      placeholder="—"
                      className={editInputClass}
                      autoFocus
                    />
                  }
                  statusContent={<InlineEditStatus status={inlineEditStatus} message={error} />}
                />
              </div>
            </div>

            <div className="min-w-0">
              <FieldLabel>Start date</FieldLabel>
              <div className="mt-0.5">
                <InlineEditFieldContainer
                  isEditing={editingField === "startDate"}
                  onRequestClose={commitEdit}
                  showSavedIndicator={showSaved && lastSavedFieldRef.current === "startDate"}
                  displayContent={
                    <InlineEditTrigger onClick={() => startEdit("startDate", startDate)}>
                      {startDate ? (
                        <FieldValue>{startDate}</FieldValue>
                      ) : (
                        <span className="text-sm text-text-primary opacity-60">—</span>
                      )}
                    </InlineEditTrigger>
                  }
                  editContent={
                    <input
                      type="date"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => commitEdit()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      className={editInputClass}
                      autoFocus
                    />
                  }
                  statusContent={<InlineEditStatus status={inlineEditStatus} message={error} />}
                />
              </div>
            </div>

            <div className="min-w-0">
              <FieldLabel>End date</FieldLabel>
              <div className="mt-0.5">
                <InlineEditFieldContainer
                  isEditing={editingField === "endDate"}
                  onRequestClose={commitEdit}
                  showSavedIndicator={showSaved && lastSavedFieldRef.current === "endDate"}
                  displayContent={
                    <InlineEditTrigger onClick={() => startEdit("endDate", endDate)}>
                      {endDate ? (
                        <FieldValue>{endDate}</FieldValue>
                      ) : (
                        <span className="text-sm text-text-primary opacity-60">—</span>
                      )}
                    </InlineEditTrigger>
                  }
                  editContent={
                    <input
                      type="date"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => commitEdit()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      className={editInputClass}
                      autoFocus
                    />
                  }
                  statusContent={<InlineEditStatus status={inlineEditStatus} message={error} />}
                />
              </div>
            </div>

            <div className="min-w-0">
              <FieldLabel>Type</FieldLabel>
              <div className="mt-0.5">
                <OptionSegments
                  name="Type"
                  value={type}
                  onChange={(value) => void setProjectType(value as ProjectType)}
                  disabled={submitting}
                  options={[
                    { value: "customer", label: "Customer" },
                    { value: "internal", label: "Internal" },
                    { value: "absence", label: "Absence" },
                  ]}
                />
              </div>
            </div>

            <div className="min-w-0">
              <FieldLabel>Billing</FieldLabel>
              <div className="mt-0.5">
                <OptionSegments
                  name="Billing"
                  value={billingType}
                  onChange={(value) =>
                    void setProjectBillingType(value as ProjectBillingType)
                  }
                  disabled={submitting || type !== "customer"}
                  options={[
                    { value: "hourly", label: "Hourly" },
                    { value: "fixed", label: "Fixed price" },
                  ]}
                />
              </div>
            </div>

            <div className="min-w-0">
              <FieldLabel>Probability</FieldLabel>
              <div className="mt-0.5">
                <InlineEditFieldContainer
                  isEditing={editingField === "probability"}
                  onRequestClose={commitEdit}
                  showSavedIndicator={showSaved && lastSavedFieldRef.current === "probability"}
                  displayContent={
                    <InlineEditTrigger
                      onClick={() => startEdit("probability", String(probability))}
                    >
                      <FieldValue>{probability}%</FieldValue>
                    </InlineEditTrigger>
                  }
                  editContent={
                    <Select
                      value={editValue}
                      onValueChange={(v) => {
                        setEditValue(v);
                        commitEdit(v);
                      }}
                      onBlur={() => commitEdit()}
                      variant="inlineEdit"
                      options={PROBABILITY_OPTIONS.map((n) => ({
                        value: String(n),
                        label: `${n}%`,
                      }))}
                      placeholder="Select"
                      className="min-w-0 flex-1 w-full"
                      triggerClassName={editTriggerClass}
                    />
                  }
                  statusContent={<InlineEditStatus status={inlineEditStatus} message={error} />}
                />
              </div>
            </div>

            <div className="min-w-0">
              <FieldLabel>Status</FieldLabel>
              <div className="mt-0.5">
                <OptionSegments
                  name="Status"
                  value={isActive ? "active" : "inactive"}
                  onChange={(value) => void setActive(value === "active")}
                  disabled={submitting}
                  options={[
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                />
              </div>
            </div>
          </div>
        </Panel>

        {/* RATES/TASKS */}
        <Panel>
          <PanelSectionTitle
            action={
              <IconButton
                aria-label="Add rate"
                onClick={() => setAddRateModalOpen(true)}
                className="text-text-muted hover:text-text-primary"
              >
                <Plus className="h-4 w-4" />
              </IconButton>
            }
          >
            RATES/TASKS
          </PanelSectionTitle>
          <p className="px-3 pb-2 text-sm text-text-primary opacity-70">
            {billingType === "fixed"
              ? "Tasks/roles for time reporting and planning. On fixed-price projects hourly rates are not billed (Standard report Income = 0)."
              : "Rates set here override customer rates for this project when both exist."}
          </p>
          <div className="p-3 pt-0">
            {ratesError && (
              <p className="mb-4 text-sm text-danger">{ratesError}</p>
            )}
            <ProjectRatesTab
              projectId={initial.id}
              billingCurrency={initial.billingCurrency}
              onError={setRatesError}
              showDescription={false}
              refreshTrigger={ratesRefreshKey}
            />
          </div>
        </Panel>
        </div>
      </div>

      {/* PLANNING – full width; viewport adapter fits as many weeks as possible (29px per week, same as Allocation page) */}
      <div ref={planningContainerRef} className="mt-3 w-full">
      <Panel>
        <PanelSectionTitle
          action={
            <button
              type="button"
              onClick={() => {
                setMoveBookingError(null);
                setMoveWeeks("1");
                setMoveForward(true);
                setShowMoveBookingModal(true);
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-text-primary opacity-80 transition-opacity hover:opacity-100 hover:bg-bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-offset-1"
              aria-label="Move entire booking"
            >
              <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>Move entire booking</span>
            </button>
          }
          >
            PLANNING
          </PanelSectionTitle>
        <div className="p-2 min-h-[200px]">
          {planningViewportReady ? (
          <Suspense fallback={<div className="flex items-center justify-center py-12"><PageLoading /></div>}>
          <AllocationPageClient
            data={planningData}
            error={planningError}
            year={planningYear}
            weekFrom={planningWeekFrom}
            weekTo={planningWeekTo}
            currentYear={currentYear}
            currentWeek={currentWeek}
            embedMode={{ projectId: initial.id, rates: allocationRates, budgetHours: budgetHours ?? undefined, budgetMoney: budgetMoney ?? undefined }}
            onWeekRangeChange={handleWeekRangeChange}
            embedWeekNavLoading={planningLoading}
            embedShowTeamFilter
          />
          </Suspense>
          ) : (
            <div className="flex items-center justify-center py-12">
              <PageLoading />
            </div>
          )}
        </div>
      </Panel>
      </div>

      {isAdmin && (
        <DetailPageDeleteFooter
          className="w-full max-w-3xl pt-4"
          onRequestDelete={() => setShowDeleteConfirm(true)}
          disabled={submitting || deleting}
          label="Delete project"
        />
      )}

      <AddProjectRateModal
        isOpen={addRateModalOpen}
        onClose={() => setAddRateModalOpen(false)}
        onSuccess={() => {
          setRatesRefreshKey((k) => k + 1);
          router.refresh();
        }}
        projectId={initial.id}
        billingCurrency={initial.billingCurrency}
      />

      {isAdmin && (
        <ConfirmModal
          isOpen={showDeleteConfirm}
          title="Delete project"
          message={`Delete ${name}? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
        />
      )}

      <Dialog
        open={showMoveBookingModal}
        onOpenChange={(open) => {
          if (!open) setMoveBookingError(null);
          setShowMoveBookingModal(open);
        }}
        title="Move entire booking"
      >
        <form onSubmit={handleMoveBookingSubmit} className="mt-4 space-y-4">
          {moveBookingError && (
            <p className="text-sm text-danger" role="alert">
              {moveBookingError}
            </p>
          )}
          <div>
            <label
              htmlFor="move-booking-weeks"
              className="block text-sm font-medium text-text-primary"
            >
              Number of weeks
            </label>
            <Input
              id="move-booking-weeks"
              type="number"
              min={1}
              value={moveWeeks}
              onChange={(e) => setMoveWeeks(e.target.value || "1")}
              className="mt-1 w-24"
            />
          </div>
          <div>
            <span className="block text-sm font-medium text-text-primary mb-2">
              Direction
            </span>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="move-direction"
                  checked={moveForward}
                  onChange={() => setMoveForward(true)}
                  className="rounded-full border-form text-brand-signal focus:ring-brand-signal"
                />
                <span className="text-text-primary">Forward</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="move-direction"
                  checked={!moveForward}
                  onChange={() => setMoveForward(false)}
                  className="rounded-full border-form text-brand-signal focus:ring-brand-signal"
                />
                <span className="text-text-primary">Backward</span>
              </label>
            </div>
          </div>
          <p className="text-xs text-text-primary opacity-70">
            All allocations for this project (all people) will be moved by the chosen number of weeks.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowMoveBookingModal(false)}
              disabled={moveBookingSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={moveBookingSubmitting}>
              {moveBookingSubmitting ? "Moving…" : "Move"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
