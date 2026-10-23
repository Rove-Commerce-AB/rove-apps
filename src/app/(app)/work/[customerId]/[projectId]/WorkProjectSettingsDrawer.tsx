"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import {
  Button,
  ConfirmModal,
  DrawerItemList,
  Input,
  OptionSegments,
  SideDrawer,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import type { BillingCurrency } from "@/lib/currency";
import {
  WORK_ESTIMATE_UNIT_LABELS,
  type WorkEstimateUnit,
} from "@/lib/workEstimate";
import { customerHref } from "@/lib/routes";
import type { WorkProcess, WorkProcessStep } from "@/lib/workProcess";
import type { WorkBoardStatus } from "@/lib/workStatuses";
import type { WorkComponent, WorkPerson } from "@/lib/workTypes";
import {
  countWorkProjectEstimatesAction,
  listLinkablePlannerProjectsAction,
  saveWorkProjectInstructionsAction,
  saveWorkProjectProcessAction,
} from "../../actions";
import { WorkBoardMembers } from "./WorkBoardMembers";

const ESTIMATE_UNIT_OPTIONS = [
  { value: "hours", label: WORK_ESTIMATE_UNIT_LABELS.hours },
  { value: "currency", label: WORK_ESTIMATE_UNIT_LABELS.currency },
  { value: "points", label: WORK_ESTIMATE_UNIT_LABELS.points },
] as const;

export type WorkProjectSettingsTab =
  | "details"
  | "access"
  | "components"
  | "import"
  | "instructions"
  | "danger";

export function WorkProjectSettingsDrawer({
  open,
  onOpenChange,
  initialTab = "details",
  projectId,
  agentsMd,
  process,
  statuses,
  title,
  customerId,
  customerName,
  plannerProjectId,
  plannerProjectName,
  members,
  people,
  components,
  onRename,
  onLinkPlannerProject,
  onAddMember,
  onRemoveMember,
  onCreateComponent,
  onRenameComponent,
  onDeleteComponent,
  onArchive,
  onImportFromJira,
  estimateUnit,
  billingCurrency,
  onSetEstimateUnit,
  showDangerTab = true,
  canEditAccess = true,
  onProcessSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: WorkProjectSettingsTab;
  projectId: string;
  agentsMd: string;
  process: WorkProcess;
  statuses: WorkBoardStatus[];
  title: string;
  customerId: string;
  customerName: string;
  plannerProjectId: string | null;
  plannerProjectName: string | null;
  members: WorkPerson[];
  people: WorkPerson[];
  components: WorkComponent[];
  estimateUnit: WorkEstimateUnit;
  billingCurrency: BillingCurrency;
  onSetEstimateUnit: (unit: WorkEstimateUnit) => Promise<boolean>;
  onRename: (nextTitle: string) => Promise<boolean>;
  onLinkPlannerProject: (
    plannerProjectId: string
  ) => Promise<{ plannerProjectId: string; plannerProjectName: string } | null>;
  onAddMember: (person: WorkPerson) => void;
  onRemoveMember: (person: WorkPerson) => void;
  onCreateComponent: (name: string) => Promise<WorkComponent | null>;
  onRenameComponent: (
    component: WorkComponent,
    name: string
  ) => Promise<WorkComponent | null>;
  onDeleteComponent: (component: WorkComponent) => Promise<boolean>;
  onArchive: () => void;
  onImportFromJira?: () => void;
  /** Hidden for customer-role viewers. */
  showDangerTab?: boolean;
  /** When false, Access is read-only (customer-role). */
  canEditAccess?: boolean;
  onProcessSaved?: (process: WorkProcess) => void;
}) {
  const [tab, setTab] = useState<WorkProjectSettingsTab>(initialTab);
  const [nameDraft, setNameDraft] = useState(title);
  const [savingName, setSavingName] = useState(false);
  const [deletingComponent, setDeletingComponent] =
    useState<WorkComponent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newComponentName, setNewComponentName] = useState("");
  const [creatingComponent, setCreatingComponent] = useState(false);
  const [renamingComponent, setRenamingComponent] = useState(false);
  const [linkableProjects, setLinkableProjects] = useState<
    { id: string; name: string }[]
  >([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [linking, setLinking] = useState(false);
  const [loadingLinkable, setLoadingLinkable] = useState(false);
  const [estimateUnitDraft, setEstimateUnitDraft] =
    useState<WorkEstimateUnit>(estimateUnit);
  const [pendingEstimateUnit, setPendingEstimateUnit] =
    useState<WorkEstimateUnit | null>(null);
  const [estimateChangeCount, setEstimateChangeCount] = useState(0);
  const [savingEstimateUnit, setSavingEstimateUnit] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNameDraft(title);
    setEstimateUnitDraft(estimateUnit);
    setPendingEstimateUnit(null);
    setTab(
      !showDangerTab && initialTab === "danger" ? "details" : initialTab
    );
    setNewComponentName("");
  }, [open, title, estimateUnit, initialTab, showDangerTab]);

  useEffect(() => {
    if (!showDangerTab && tab === "danger") setTab("details");
  }, [showDangerTab, tab]);

  useEffect(() => {
    if (!open || plannerProjectId) {
      setLinkableProjects([]);
      setLinkDraft("");
      setLoadingLinkable(false);
      return;
    }
    let cancelled = false;
    setLoadingLinkable(true);
    setLinkDraft("");
    void listLinkablePlannerProjectsAction(customerId)
      .then((rows) => {
        if (cancelled) return;
        setLinkableProjects(rows);
        setLoadingLinkable(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLinkableProjects([]);
        setLoadingLinkable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, customerId, plannerProjectId]);

  async function commitName() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === title) {
      setNameDraft(title);
      return;
    }
    setSavingName(true);
    const ok = await onRename(trimmed);
    setSavingName(false);
    if (!ok) setNameDraft(title);
  }

  async function requestEstimateUnit(next: string) {
    const unit = next as WorkEstimateUnit;
    if (unit === estimateUnitDraft || savingEstimateUnit) return;
    if (unit === estimateUnit) {
      setEstimateUnitDraft(unit);
      return;
    }
    setSavingEstimateUnit(true);
    const counted = await countWorkProjectEstimatesAction(projectId);
    setSavingEstimateUnit(false);
    if (!counted.ok) return;
    if (counted.count > 0) {
      setEstimateChangeCount(counted.count);
      setPendingEstimateUnit(unit);
      return;
    }
    setEstimateUnitDraft(unit);
    setSavingEstimateUnit(true);
    const ok = await onSetEstimateUnit(unit);
    setSavingEstimateUnit(false);
    if (!ok) setEstimateUnitDraft(estimateUnit);
  }

  async function confirmEstimateUnitChange() {
    if (!pendingEstimateUnit) return;
    const unit = pendingEstimateUnit;
    setPendingEstimateUnit(null);
    setEstimateUnitDraft(unit);
    setSavingEstimateUnit(true);
    const ok = await onSetEstimateUnit(unit);
    setSavingEstimateUnit(false);
    if (!ok) setEstimateUnitDraft(estimateUnit);
  }

  async function submitNewComponent(name: string) {
    const trimmed = name.trim();
    if (!trimmed || creatingComponent) return;
    setCreatingComponent(true);
    const created = await onCreateComponent(trimmed);
    setCreatingComponent(false);
    if (!created) return;
    setNewComponentName("");
  }

  async function renameComponentItem(id: string, nextName: string) {
    const component = components.find((row) => row.id === id);
    if (!component || nextName === component.name) return;
    setRenamingComponent(true);
    await onRenameComponent(component, nextName);
    setRenamingComponent(false);
  }

  return (
    <>
      <SideDrawer
        open={open}
        onOpenChange={onOpenChange}
        title="Project settings"
        subtitle={customerName}
        bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as WorkProjectSettingsTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="shrink-0 px-6 pt-3">
              <TabsList className="!flex-wrap !gap-0">
                <TabsTrigger value="details" className="px-3 !px-3">
                  Details
                </TabsTrigger>
                <TabsTrigger value="access" className="px-3 !px-3">
                  Access
                </TabsTrigger>
                <TabsTrigger value="components" className="px-3 !px-3">
                  Components
                </TabsTrigger>
                <TabsTrigger value="import" className="px-3 !px-3">
                  Import
                </TabsTrigger>
                <TabsTrigger value="instructions" className="px-3 !px-3">
                  Instructions
                </TabsTrigger>
                {showDangerTab ? (
                  <TabsTrigger value="danger" className="px-3 !px-3">
                    Danger
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </div>

            <TabsContent
              value="details"
              className="mt-0 min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5"
            >
              <Input
                id="work-project-settings-name"
                label="Name"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={() => {
                  void commitName();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    (event.target as HTMLInputElement).blur();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setNameDraft(title);
                    (event.target as HTMLInputElement).blur();
                  }
                }}
                disabled={savingName}
                modalStyle
              />

              <section className="space-y-2">
                <h2 className="text-sm font-medium text-text-primary">
                  Estimate unit
                </h2>
                <OptionSegments
                  name="Estimate unit"
                  value={estimateUnitDraft}
                  onChange={(value) => {
                    void requestEstimateUnit(value);
                  }}
                  disabled={savingEstimateUnit || showDangerTab === false}
                  options={[...ESTIMATE_UNIT_OPTIONS]}
                />
                <p className="text-sm text-text-secondary">
                  {estimateUnitDraft === "currency"
                    ? `Estimates use the customer currency (${billingCurrency}).`
                    : estimateUnitDraft === "points"
                      ? "Estimates are story points (whole numbers)."
                      : "Estimates are in hours."}
                </p>
              </section>

              <section className="space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-medium text-text-primary">
                    Project link
                  </h2>
                  {!plannerProjectId ? (
                    <Link
                      href={customerHref(customerId)}
                      className="shrink-0 text-sm text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
                    >
                      Create in Settings
                    </Link>
                  ) : null}
                </div>
                {plannerProjectId ? (
                  <p className="text-sm text-text-primary">
                    {plannerProjectName?.trim() || "Linked"}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="block min-w-0 flex-1">
                      <span className="sr-only">Select project</span>
                      <select
                        value={linkDraft}
                        onChange={(event) => setLinkDraft(event.target.value)}
                        disabled={linking || loadingLinkable}
                        className="box-border h-9 w-full rounded-md border border-form bg-bg-default px-2.5 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">
                          {loadingLinkable
                            ? "Loading…"
                            : linkableProjects.length > 0
                              ? "Select project…"
                              : "No projects available to link"}
                        </option>
                        {linkableProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        linking || loadingLinkable || !linkDraft.trim()
                      }
                      onClick={() => {
                        void (async () => {
                          if (!linkDraft.trim() || linking) return;
                          setLinking(true);
                          const linked = await onLinkPlannerProject(
                            linkDraft.trim()
                          );
                          setLinking(false);
                          if (!linked) return;
                          setLinkDraft("");
                          setLinkableProjects([]);
                        })();
                      }}
                    >
                      {linking ? "Linking…" : "Link"}
                    </Button>
                  </div>
                )}
              </section>
            </TabsContent>

            <TabsContent
              value="access"
              className="mt-0 min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5"
            >
              {!canEditAccess ? (
                <p className="text-sm text-text-secondary">
                  Only Rove staff can change who has access to this project.
                </p>
              ) : null}
              <WorkBoardMembers
                members={members}
                people={people}
                layout="list"
                disabled={!canEditAccess}
                onAdd={canEditAccess ? onAddMember : undefined}
                onRemove={canEditAccess ? onRemoveMember : undefined}
              />
            </TabsContent>

            <TabsContent
              value="components"
              className="mt-0 min-h-0 flex-1 overflow-y-auto px-6 py-5"
            >
              <DrawerItemList
                description="Group work by area. Deleting a component clears it from issues that use it."
                emptyLabel="No components yet."
                pending={creatingComponent || renamingComponent || deleting}
                items={components.map((component) => ({
                  id: component.id,
                  label: component.name,
                }))}
                onRename={(item, nextLabel) => {
                  void renameComponentItem(item.id, nextLabel);
                }}
                onRemove={(item) => {
                  const component = components.find((row) => row.id === item.id);
                  if (component) setDeletingComponent(component);
                }}
                compose={{
                  value: newComponentName,
                  onChange: setNewComponentName,
                  onSubmit: (value) => {
                    void submitNewComponent(value);
                  },
                  placeholder: "Component name",
                  collapsedLabel: "+ Add component",
                }}
              />
            </TabsContent>

            <TabsContent
              value="import"
              className="mt-0 min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5"
            >
              <p className="text-caption text-text-tertiary">
                Bring issues into this project from another tool. Existing
                imports are skipped when the same external key is already
                linked.
              </p>
              <ul className="divide-y divide-border-subtle">
                <li className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">
                      Jira
                    </p>
                    <p className="text-caption text-text-tertiary">
                      RSS/XML export from Jira Cloud or Server
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onImportFromJira?.()}
                  >
                    Import…
                  </Button>
                </li>
              </ul>
            </TabsContent>

            <TabsContent
              value="instructions"
              forceMount
              className="mt-0 min-h-0 flex-1 overflow-y-auto px-6 py-5 data-[state=inactive]:hidden"
            >
              <ProjectInstructionsForm
                key={projectId}
                projectId={projectId}
                agentsMd={agentsMd}
                process={process}
                statuses={statuses}
                onProcessSaved={onProcessSaved}
              />
            </TabsContent>

            {showDangerTab ? (
              <TabsContent
                value="danger"
                className="mt-0 min-h-0 flex-1 overflow-y-auto px-6 py-5"
              >
                <div className="rounded-lg border border-danger/30 bg-danger/5 p-4">
                  <h2 className="text-label-l text-danger">Danger zone</h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Archive hides this project from Rove Work. Issues are kept.
                  </p>
                  <Button
                    type="button"
                    variant="dangerSecondary"
                    size="sm"
                    className="mt-3"
                    onClick={onArchive}
                  >
                    Archive project
                  </Button>
                </div>
              </TabsContent>
            ) : null}
          </Tabs>
        </div>
      </SideDrawer>

      <ConfirmModal
        isOpen={deletingComponent != null}
        title={
          deletingComponent
            ? `Delete ${deletingComponent.name}?`
            : "Delete component"
        }
        message="Issues using this component will have their component cleared. This cannot be undone."
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        variant="danger"
        onClose={() => {
          if (deleting) return;
          setDeletingComponent(null);
        }}
        onConfirm={async () => {
          if (!deletingComponent || deleting) return;
          setDeleting(true);
          const ok = await onDeleteComponent(deletingComponent);
          setDeleting(false);
          if (ok) setDeletingComponent(null);
        }}
      />

      <ConfirmModal
        isOpen={pendingEstimateUnit != null}
        title="Change estimate unit?"
        message={
          pendingEstimateUnit
            ? `${estimateChangeCount} issue${estimateChangeCount === 1 ? "" : "s"} have estimates. Changing to ${WORK_ESTIMATE_UNIT_LABELS[pendingEstimateUnit].toLowerCase()} will clear those estimates.`
            : ""
        }
        confirmLabel={savingEstimateUnit ? "Changing…" : "Change and clear"}
        variant="danger"
        onClose={() => {
          if (savingEstimateUnit) return;
          setPendingEstimateUnit(null);
        }}
        onConfirm={() => {
          void confirmEstimateUnitChange();
        }}
      />
    </>
  );
}

function ProjectInstructionsForm({
  projectId,
  agentsMd,
  process,
  statuses,
  onProcessSaved,
}: {
  projectId: string;
  agentsMd: string;
  process: WorkProcess;
  statuses: WorkBoardStatus[];
  onProcessSaved?: (process: WorkProcess) => void;
}) {
  const [agentsDraft, setAgentsDraft] = useState(agentsMd);
  const [agentsSaved, setAgentsSaved] = useState(agentsMd);
  const [stepsDraft, setStepsDraft] = useState<WorkProcessStep[]>(process.steps);
  const [notesDraft, setNotesDraft] = useState(process.notesMd);
  const [processSaved, setProcessSaved] = useState(process);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [saving, startSaving] = useTransition();

  const processDirty =
    notesDraft !== processSaved.notesMd ||
    JSON.stringify(stepsDraft) !== JSON.stringify(processSaved.steps);
  const agentsDirty = agentsDraft !== agentsSaved;
  const dirty = processDirty || agentsDirty;

  function save() {
    if (saving || !dirty) return;
    setFeedback(null);
    startSaving(async () => {
      try {
        if (processDirty) {
          const result = await saveWorkProjectProcessAction(projectId, {
            notesMd: notesDraft,
            steps: stepsDraft,
          });
          if (!result.ok) {
            setFeedback({ kind: "error", message: result.error });
            return;
          }
          setProcessSaved(result.process);
          setStepsDraft(result.process.steps);
          setNotesDraft(result.process.notesMd);
          onProcessSaved?.(result.process);
        }
        if (agentsDirty) {
          const result = await saveWorkProjectInstructionsAction(
            projectId,
            agentsDraft
          );
          if (!result.ok) {
            setFeedback({ kind: "error", message: result.error });
            return;
          }
          setAgentsSaved(result.agentsMd);
        }
        setFeedback({ kind: "success", message: "Saved." });
      } catch {
        setFeedback({
          kind: "error",
          message: "Unable to save instructions. Try again.",
        });
      }
    });
  }

  function updateStep(index: number, patch: Partial<WorkProcessStep>) {
    setStepsDraft((current) =>
      current.map((step, i) => (i === index ? { ...step, ...patch } : step))
    );
    setFeedback(null);
  }

  function fillFromColumns() {
    setStepsDraft(
      statuses.map((status) => {
        const existing = stepsDraft.find((step) => step.statusId === status.id);
        return {
          statusId: status.id,
          title: status.name,
          body: existing?.body ?? "",
        };
      })
    );
    setFeedback(null);
  }

  return (
    <form
      className="space-y-8"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-text-primary">Board process</h2>
          <p className="text-sm text-text-secondary">
            Shown on the board for everyone. Describe who owns each column and
            when work moves forward.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={saving || statuses.length === 0}
            onClick={fillFromColumns}
          >
            Fill from columns
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={saving}
            onClick={() => {
              setStepsDraft((current) => [
                ...current,
                { statusId: null, title: "", body: "" },
              ]);
              setFeedback(null);
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            Add step
          </Button>
        </div>

        <ul className="space-y-3">
          {stepsDraft.map((step, index) => (
            <li
              key={`step-${index}`}
              className="rounded-lg border border-border-subtle bg-bg-muted/30 p-3"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 space-y-2">
                  <label className="block space-y-1">
                    <span className="text-label-s text-text-tertiary">
                      Column / title
                    </span>
                    <select
                      value={step.statusId ?? ""}
                      disabled={saving}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (!value) {
                          updateStep(index, { statusId: null });
                          return;
                        }
                        const status = statuses.find((row) => row.id === value);
                        updateStep(index, {
                          statusId: value,
                          title: status?.name ?? step.title,
                        });
                      }}
                      className="box-border h-9 w-full rounded-md border border-form bg-bg-default px-2.5 text-sm text-text-primary disabled:opacity-50"
                    >
                      <option value="">Custom title…</option>
                      {statuses.map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!step.statusId ? (
                    <Input
                      label="Title"
                      value={step.title}
                      disabled={saving}
                      onChange={(event) =>
                        updateStep(index, { title: event.target.value })
                      }
                      modalStyle
                    />
                  ) : null}
                  <label className="block space-y-1">
                    <span className="text-label-s text-text-tertiary">
                      What happens here
                    </span>
                    <textarea
                      value={step.body}
                      disabled={saving}
                      rows={2}
                      onChange={(event) =>
                        updateStep(index, { body: event.target.value })
                      }
                      className="box-border w-full resize-y rounded-md border border-form bg-bg-default px-2.5 py-2 text-sm text-text-primary focus:border-form focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--color-border-form)] disabled:opacity-50"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  aria-label={`Remove step ${index + 1}`}
                  className="mt-5 rounded-md p-1.5 text-text-tertiary hover:bg-bg-muted hover:text-danger disabled:opacity-40"
                  onClick={() => {
                    setStepsDraft((current) =>
                      current.filter((_, i) => i !== index)
                    );
                    setFeedback(null);
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-text-primary">
            Additional notes
          </span>
          <span className="block text-sm text-text-secondary">
            Optional markdown for exceptions, links, or extra context.
          </span>
          <textarea
            value={notesDraft}
            disabled={saving}
            rows={5}
            onChange={(event) => {
              setNotesDraft(event.target.value);
              setFeedback(null);
            }}
            className="box-border w-full resize-y rounded-lg border border-form bg-bg-default px-3 py-2 text-sm text-text-primary focus:border-form focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--color-border-form)] disabled:opacity-50"
          />
        </label>
      </section>

      <section className="space-y-2 border-t border-border-subtle pt-6">
        <label
          htmlFor="work-project-agents-md"
          className="block text-sm font-medium text-text-primary"
        >
          agents.md
        </label>
        <p
          id="work-project-agents-md-help"
          className="text-sm text-text-secondary"
        >
          Instructions for AI agents working in this project (not shown on the
          board process panel).
        </p>
        <textarea
          id="work-project-agents-md"
          aria-describedby="work-project-agents-md-help"
          value={agentsDraft}
          onChange={(event) => {
            setAgentsDraft(event.target.value);
            setFeedback(null);
          }}
          rows={10}
          disabled={saving}
          spellCheck={false}
          className="box-border w-full resize-y rounded-lg border border-form bg-bg-default px-3 py-2 font-mono text-sm text-text-primary focus:border-form focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--color-border-form)] disabled:opacity-50"
        />
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving || !dirty}>
          {saving ? "Saving..." : "Save"}
        </Button>
        {feedback ? (
          <p
            role={feedback.kind === "error" ? "alert" : "status"}
            className={`text-sm ${feedback.kind === "error" ? "text-danger" : "text-text-secondary"}`}
          >
            {feedback.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
