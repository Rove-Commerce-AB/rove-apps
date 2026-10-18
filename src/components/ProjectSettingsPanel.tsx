"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Briefcase, CalendarCheck, Plus } from "lucide-react";
import {
  updateProject,
  getUniqueJiraAndDevopsProjects,
  type IntegrationProjectOption,
} from "@/lib/projectsClient";
import { deleteProjectAction } from "@/app/(app)/projects/actions";
import { getWorkProjectByPlannerProjectIdAction } from "@/app/(app)/work/actions";
import { getConsultantsList } from "@/lib/consultantsClient";
import { moneyLabel } from "@/lib/currency";
import { workProjectHref } from "@/lib/routes";
import type {
  ProjectBillingType,
  ProjectWithDetails,
  ProjectType,
} from "@/types";
import {
  Button,
  ConfirmModal,
  DrawerFieldRow,
  DrawerSelectField,
  InlineEditFieldContainer,
  InlineEditStatus,
  InlineEditTrigger,
  OptionSegments,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  SAVED_DURATION_MS,
  editInputClass,
} from "@/components/ui";
import { ProjectRatesTab } from "./ProjectRatesTab";
import { AddProjectRateModal } from "./AddProjectRateModal";
import { isInlineEditValueChanged } from "@/lib/inlineEdit";

const PROBABILITY_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

type ProjectSettingsTab = "overview" | "rates" | "danger";

type EditField =
  | "name"
  | "budgetHours"
  | "budgetMoney"
  | "startDate"
  | "endDate"
  | null;

type Props = {
  project: ProjectWithDetails;
  isAdmin?: boolean;
  /** Stacked customer-drawer mode: back to projects list. */
  onBack?: () => void;
  /** Hide the “Open planning” link (e.g. already on the planning page). */
  hidePlanningLink?: boolean;
  onDeleted?: () => void;
};

function integrationValueFromProject(project: ProjectWithDetails): string {
  if (project.jiraProjectKey) return `jira:${project.jiraProjectKey}`;
  if (project.devopsProject) return `devops:${project.devopsProject}`;
  if (project.clickupProjectId) return `clickup:${project.clickupProjectId}`;
  return "";
}

export function ProjectSettingsPanel({
  project: initial,
  isAdmin = false,
  onBack,
  hidePlanningLink = false,
  onDeleted,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [projectManagerId, setProjectManagerId] = useState(
    initial.projectManagerId ?? ""
  );
  const [projectManagerName, setProjectManagerName] = useState(
    initial.projectManagerName ?? ""
  );
  const [integrationValue, setIntegrationValue] = useState(
    integrationValueFromProject(initial)
  );
  const [isActive, setIsActive] = useState(initial.isActive);
  const [type, setType] = useState<ProjectType>(initial.type);
  const [billingType, setBillingType] = useState<ProjectBillingType>(
    initial.billingType ?? "hourly"
  );
  const [startDate, setStartDate] = useState(initial.startDate ?? "");
  const [endDate, setEndDate] = useState(initial.endDate ?? "");
  const [probability, setProbability] = useState(
    String(initial.probability ?? 100)
  );
  const [budgetHours, setBudgetHours] = useState(
    initial.budgetHours != null ? String(Number(initial.budgetHours)) : ""
  );
  const [budgetMoney, setBudgetMoney] = useState(
    initial.budgetMoney != null ? String(Number(initial.budgetMoney)) : ""
  );
  const [projectManagerOptions, setProjectManagerOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [integrationOptions, setIntegrationOptions] = useState<
    IntegrationProjectOption[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [ratesRefreshKey, setRatesRefreshKey] = useState(0);
  const [addRateModalOpen, setAddRateModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ProjectSettingsTab>("overview");
  const [workProject, setWorkProject] = useState<{
    id: string;
    customerId: string;
  } | null>(null);
  const [editingField, setEditingField] = useState<EditField>(null);
  const [editValue, setEditValue] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const [lastSavedField, setLastSavedField] = useState<EditField>(null);
  const originalEditValueRef = useRef("");
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncFromInitial = useCallback(() => {
    setName(initial.name);
    setProjectManagerId(initial.projectManagerId ?? "");
    setProjectManagerName(initial.projectManagerName ?? "");
    setIntegrationValue(integrationValueFromProject(initial));
    setIsActive(initial.isActive);
    setType(initial.type);
    setBillingType(initial.billingType ?? "hourly");
    setStartDate(initial.startDate ?? "");
    setEndDate(initial.endDate ?? "");
    setProbability(String(initial.probability ?? 100));
    setBudgetHours(
      initial.budgetHours != null ? String(Number(initial.budgetHours)) : ""
    );
    setBudgetMoney(
      initial.budgetMoney != null ? String(Number(initial.budgetMoney)) : ""
    );
  }, [initial]);

  useEffect(() => {
    syncFromInitial();
  }, [syncFromInitial]);

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
    getUniqueJiraAndDevopsProjects()
      .then(setIntegrationOptions)
      .catch(() => setIntegrationOptions([{ value: "", label: "—" }]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getWorkProjectByPlannerProjectIdAction(initial.id)
      .then((linked) => {
        if (!cancelled) setWorkProject(linked);
      })
      .catch(() => {
        if (!cancelled) setWorkProject(null);
      });
    return () => {
      cancelled = true;
    };
  }, [initial.id]);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  function startEdit(field: EditField, value: string) {
    setError(null);
    originalEditValueRef.current = value;
    setEditValue(value);
    setEditingField(field);
  }

  function cancelEdit() {
    setEditValue(originalEditValueRef.current);
    setEditingField(null);
    setError(null);
  }

  function markSaved(field: EditField) {
    setLastSavedField(field);
    setShowSaved(true);
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    savedTimeoutRef.current = setTimeout(() => {
      savedTimeoutRef.current = null;
      setLastSavedField(null);
      setShowSaved(false);
    }, SAVED_DURATION_MS);
  }

  async function saveTextField(field: Exclude<EditField, null>, value: string) {
    const trimmed = value.trim();
    if (field === "name" && !trimmed) {
      setError("Project name is required");
      return;
    }
    if (field === "budgetHours" && trimmed !== "") {
      const num = parseInt(trimmed, 10);
      if (Number.isNaN(num) || num < 0) {
        setError("Enter a positive integer or leave empty");
        return;
      }
    }
    if (field === "budgetMoney" && trimmed !== "") {
      const num = parseInt(trimmed, 10);
      if (Number.isNaN(num) || num < 0) {
        setError(
          `Enter a positive integer (${moneyLabel(initial.billingCurrency)}) or leave empty`
        );
        return;
      }
    }

    setError(null);
    setEditingField(null);
    setSubmitting(true);
    try {
      switch (field) {
        case "name":
          await updateProject(initial.id, { name: trimmed });
          setName(trimmed);
          break;
        case "startDate":
          await updateProject(initial.id, { start_date: trimmed || null });
          setStartDate(trimmed);
          break;
        case "endDate":
          await updateProject(initial.id, { end_date: trimmed || null });
          setEndDate(trimmed);
          break;
        case "budgetHours":
          await updateProject(initial.id, {
            budget_hours: trimmed === "" ? null : parseInt(trimmed, 10),
          });
          setBudgetHours(trimmed);
          break;
        case "budgetMoney":
          await updateProject(initial.id, {
            budget_money: trimmed === "" ? null : parseInt(trimmed, 10),
          });
          setBudgetMoney(trimmed);
          break;
      }
      markSaved(field);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
      syncFromInitial();
    } finally {
      setSubmitting(false);
    }
  }

  function commitEdit(overrideValue?: string) {
    if (editingField == null) return;
    const value = overrideValue ?? editValue;
    if (!isInlineEditValueChanged(originalEditValueRef.current, value)) {
      setEditingField(null);
      return;
    }
    void saveTextField(editingField, value);
  }

  async function saveProjectManager(value: string) {
    if (!isInlineEditValueChanged(projectManagerId, value)) return;
    setError(null);
    setSubmitting(true);
    try {
      await updateProject(initial.id, {
        project_manager_id: value || null,
      });
      setProjectManagerId(value);
      setProjectManagerName(
        projectManagerOptions.find((o) => o.value === value)?.label ?? ""
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveIntegration(value: string) {
    if (!isInlineEditValueChanged(integrationValue, value)) return;
    setError(null);
    setSubmitting(true);
    try {
      if (value === "") {
        await updateProject(initial.id, {
          jira_project_key: null,
          devops_project: null,
          clickup_project_id: null,
        });
      } else if (value.startsWith("jira:")) {
        await updateProject(initial.id, {
          jira_project_key: value.slice(5),
          devops_project: null,
          clickup_project_id: null,
        });
      } else if (value.startsWith("devops:")) {
        await updateProject(initial.id, {
          jira_project_key: null,
          devops_project: value.slice(7),
          clickup_project_id: null,
        });
      } else if (value.startsWith("clickup:")) {
        await updateProject(initial.id, {
          jira_project_key: null,
          devops_project: null,
          clickup_project_id: value.slice(8),
        });
      }
      setIntegrationValue(value);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveProbability(value: string) {
    if (!isInlineEditValueChanged(probability, value)) return;
    const num = parseInt(value, 10);
    if (Number.isNaN(num) || num < 10 || num > 100 || num % 10 !== 0) {
      setError("Probability must be 10, 20, … 100");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await updateProject(initial.id, { probability: num });
      setProbability(value);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSubmitting(false);
    }
  }

  async function setActive(next: boolean) {
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
  }

  async function setProjectType(next: ProjectType) {
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
  }

  async function setProjectBillingType(next: ProjectBillingType) {
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
  }

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      await deleteProjectAction(initial.id, initial.customer_id);
      setShowDeleteConfirm(false);
      if (onDeleted) {
        onDeleted();
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  const inlineStatus = submitting
    ? "saving"
    : showSaved
      ? "saved"
      : error
        ? "error"
        : "idle";

  function textField(
    label: string,
    field: Exclude<EditField, null>,
    value: string,
    inputType: "text" | "number" | "date" = "text",
    displayOverride?: string
  ) {
    const displayValue = displayOverride ?? (value || "—");
    return (
      <DrawerFieldRow label={label}>
        <InlineEditFieldContainer
          isEditing={editingField === field}
          onRequestClose={commitEdit}
          hideAccessory
          reserveStatusRow={false}
          showSavedIndicator={showSaved && lastSavedField === field}
          displayContent={
            <InlineEditTrigger
              boxed
              onClick={() => startEdit(field, value)}
              className={value ? "" : "text-text-tertiary"}
            >
              <span className="truncate text-sm text-text-primary">
                {displayValue}
              </span>
            </InlineEditTrigger>
          }
          editContent={
            <input
              type={inputType}
              min={inputType === "number" ? 0 : undefined}
              step={inputType === "number" ? 1 : undefined}
              value={editValue}
              onChange={(event) => setEditValue(event.target.value)}
              onFocus={(event) => event.target.select()}
              onBlur={() => commitEdit()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitEdit();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEdit();
                }
              }}
              className={editInputClass}
              autoFocus
            />
          }
          statusContent={
            <InlineEditStatus status={inlineStatus} message={error} />
          }
        />
      </DrawerFieldRow>
    );
  }

  const budgetMoneyDisplay =
    budgetMoney !== ""
      ? `${budgetMoney.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0")} ${moneyLabel(initial.billingCurrency)}`
      : "—";

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        {onBack ? (
          <div className="shrink-0 border-b border-border-subtle px-6 py-4">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to projects
            </button>
            <div className="mt-3 flex items-start gap-3">
              <h2 className="min-w-0 flex-1 truncate text-heading-l text-text-primary">
                {name}
              </h2>
              <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                {!hidePlanningLink ? (
                  <Link
                    href={`/projects/${initial.id}`}
                    title="Open in Planner"
                    aria-label="Open in Planner"
                    className="inline-flex cursor-pointer items-center justify-center rounded-sm p-1.5 text-text-primary opacity-60 transition-colors hover:bg-bg-muted hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-offset-2"
                  >
                    <CalendarCheck className="h-4 w-4" aria-hidden />
                  </Link>
                ) : null}
                {workProject ? (
                  <Link
                    href={workProjectHref(
                      workProject.customerId,
                      workProject.id
                    )}
                    title="Open in Work"
                    aria-label="Open in Work"
                    className="inline-flex cursor-pointer items-center justify-center rounded-sm p-1.5 text-text-primary opacity-60 transition-colors hover:bg-bg-muted hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-offset-2"
                  >
                    <Briefcase className="h-4 w-4" aria-hidden />
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        ) : workProject ? (
          <div className="flex shrink-0 justify-end border-b border-border-subtle px-6 py-2">
            <Link
              href={workProjectHref(workProject.customerId, workProject.id)}
              title="Open in Work"
              aria-label="Open in Work"
              className="inline-flex cursor-pointer items-center justify-center rounded-sm p-1.5 text-text-primary opacity-60 transition-colors hover:bg-bg-muted hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-offset-2"
            >
              <Briefcase className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        ) : null}

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ProjectSettingsTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="shrink-0 border-border-default px-6 !gap-6">
            <TabsTrigger value="overview" className="px-1 !px-1">
              Overview
            </TabsTrigger>
            <TabsTrigger value="rates" className="px-1 !px-1">
              Rates/Tasks
            </TabsTrigger>
            {isAdmin ? (
              <TabsTrigger value="danger" className="px-1 !px-1">
                Danger
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent
            value="overview"
            className="min-h-0 flex-1 overflow-y-auto"
          >
            {error && activeTab === "overview" ? (
              <p className="px-6 pt-4 text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <div className="px-6 pt-4">
              {textField("Name", "name", name)}
              <DrawerFieldRow label="Project manager">
                <DrawerSelectField
                  value={projectManagerId}
                  onValueChange={(value) => void saveProjectManager(value)}
                  options={[
                    { value: "", label: "—" },
                    ...(projectManagerId &&
                    projectManagerName &&
                    !projectManagerOptions.some(
                      (o) => o.value === projectManagerId
                    )
                      ? [
                          {
                            value: projectManagerId,
                            label: projectManagerName,
                          },
                        ]
                      : []),
                    ...projectManagerOptions,
                  ]}
                  placeholder="—"
                />
              </DrawerFieldRow>
              <DrawerFieldRow label="Integration">
                <DrawerSelectField
                  value={integrationValue}
                  onValueChange={(value) => void saveIntegration(value)}
                  options={
                    integrationOptions.length > 0
                      ? integrationOptions
                      : [{ value: "", label: "—" }]
                  }
                  placeholder="—"
                />
              </DrawerFieldRow>
              {textField(
                "Budget (hours)",
                "budgetHours",
                budgetHours,
                "number",
                budgetHours ? `${budgetHours} h` : "—"
              )}
              {textField(
                billingType === "fixed"
                  ? `Contract value (${moneyLabel(initial.billingCurrency)})`
                  : `Budget (${moneyLabel(initial.billingCurrency)})`,
                "budgetMoney",
                budgetMoney,
                "number",
                budgetMoneyDisplay
              )}
              {textField("Start date", "startDate", startDate, "date")}
              {textField("End date", "endDate", endDate, "date")}
              <DrawerFieldRow label="Probability">
                <DrawerSelectField
                  value={probability}
                  onValueChange={(value) => void saveProbability(value)}
                  options={PROBABILITY_OPTIONS.map((n) => ({
                    value: String(n),
                    label: `${n}%`,
                  }))}
                  placeholder="—"
                />
              </DrawerFieldRow>
            </div>

            <div className="border-t border-border-subtle px-6">
              <DrawerFieldRow label="Type">
                <OptionSegments
                  name="Type"
                  value={type}
                  onChange={(value) =>
                    void setProjectType(value as ProjectType)
                  }
                  disabled={submitting}
                  options={[
                    { value: "customer", label: "Customer" },
                    { value: "internal", label: "Internal" },
                    { value: "absence", label: "Absence" },
                  ]}
                />
              </DrawerFieldRow>
              <DrawerFieldRow label="Billing">
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
              </DrawerFieldRow>
              <DrawerFieldRow label="Status">
                <OptionSegments
                  name="Status"
                  value={isActive ? "active" : "inactive"}
                  onChange={(value) => void setActive(value === "active")}
                  disabled={submitting || deleting}
                  options={[
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                />
              </DrawerFieldRow>
            </div>
          </TabsContent>

          <TabsContent
            value="rates"
            className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-heading-s text-text-primary">Rates/Tasks</h2>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setAddRateModalOpen(true)}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add
              </Button>
            </div>
            <p className="mt-2 text-sm text-text-secondary">
              {billingType === "fixed"
                ? "Tasks/roles for time reporting and planning. On fixed-price projects hourly rates are not billed."
                : "Project rates override customer rates when both exist."}
            </p>
            {ratesError ? (
              <p className="mt-3 text-sm text-danger" role="alert">
                {ratesError}
              </p>
            ) : null}
            <div className="mt-4">
              <ProjectRatesTab
                projectId={initial.id}
                billingCurrency={initial.billingCurrency}
                onError={setRatesError}
                showDescription={false}
                refreshTrigger={ratesRefreshKey}
              />
            </div>
          </TabsContent>

          {isAdmin ? (
            <TabsContent
              value="danger"
              className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
            >
              <div className="rounded-lg border border-danger/30 bg-danger/5 p-4">
                <h2 className="text-label-l text-danger">Danger zone</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Permanently deletes this project. Blocked when time report
                  history exists.
                </p>
                {error && activeTab === "danger" ? (
                  <p className="mt-3 text-sm text-danger" role="alert">
                    {error}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="dangerSecondary"
                  size="sm"
                  className="mt-3"
                  disabled={submitting || deleting}
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete project
                </Button>
              </div>
            </TabsContent>
          ) : null}
        </Tabs>
      </div>

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

      {isAdmin ? (
        <ConfirmModal
          isOpen={showDeleteConfirm}
          title="Delete project"
          message={`Delete ${name}? This cannot be undone.`}
          confirmLabel={deleting ? "Deleting…" : "Delete"}
          variant="danger"
          onClose={() => {
            if (deleting) return;
            setShowDeleteConfirm(false);
          }}
          onConfirm={() => void handleDelete()}
        />
      ) : null}
    </>
  );
}
