"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import {
  Button,
  ConfirmModal,
  Input,
  SideDrawer,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import type { WorkComponent, WorkPerson } from "@/lib/workTypes";
import { listLinkablePlannerProjectsAction, saveWorkProjectInstructionsAction } from "../../actions";
import { WorkBoardMembers } from "./WorkBoardMembers";

export type WorkProjectSettingsTab =
  | "details"
  | "access"
  | "components"
  | "import"
  | "agents.md"
  | "danger";

export function WorkProjectSettingsDrawer({
  open,
  onOpenChange,
  initialTab = "details",
  projectId,
  agentsMd,
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: WorkProjectSettingsTab;
  projectId: string;
  agentsMd: string;
  title: string;
  customerId: string;
  customerName: string;
  plannerProjectId: string | null;
  plannerProjectName: string | null;
  members: WorkPerson[];
  people: WorkPerson[];
  components: WorkComponent[];
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
}) {
  const [tab, setTab] = useState<WorkProjectSettingsTab>(initialTab);
  const [nameDraft, setNameDraft] = useState(title);
  const [savingName, setSavingName] = useState(false);
  const [deletingComponent, setDeletingComponent] =
    useState<WorkComponent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addingComponent, setAddingComponent] = useState(false);
  const [newComponentName, setNewComponentName] = useState("");
  const [creatingComponent, setCreatingComponent] = useState(false);
  const [componentDrafts, setComponentDrafts] = useState<Record<string, string>>(
    {}
  );
  const [savingComponentId, setSavingComponentId] = useState<string | null>(
    null
  );
  const [linkableProjects, setLinkableProjects] = useState<
    { id: string; name: string }[]
  >([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [linking, setLinking] = useState(false);
  const [loadingLinkable, setLoadingLinkable] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNameDraft(title);
    setTab(initialTab);
    setAddingComponent(false);
    setNewComponentName("");
  }, [open, title, initialTab]);

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

  useEffect(() => {
    setComponentDrafts(
      Object.fromEntries(components.map((row) => [row.id, row.name]))
    );
  }, [components]);

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

  async function commitComponentName(component: WorkComponent) {
    const draft = (componentDrafts[component.id] ?? component.name).trim();
    if (!draft) {
      setComponentDrafts((current) => ({
        ...current,
        [component.id]: component.name,
      }));
      return;
    }
    if (draft === component.name) return;
    setSavingComponentId(component.id);
    const next = await onRenameComponent(component, draft);
    setSavingComponentId(null);
    if (!next) {
      setComponentDrafts((current) => ({
        ...current,
        [component.id]: component.name,
      }));
    }
  }

  async function submitNewComponent() {
    const trimmed = newComponentName.trim();
    if (!trimmed || creatingComponent) return;
    setCreatingComponent(true);
    const created = await onCreateComponent(trimmed);
    setCreatingComponent(false);
    if (!created) return;
    setNewComponentName("");
    setAddingComponent(false);
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
                <TabsTrigger value="agents.md" className="px-3 !px-3">
                  agents.md
                </TabsTrigger>
                <TabsTrigger value="danger" className="px-3 !px-3">
                  Danger
                </TabsTrigger>
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
                  Customer project
                </h2>
                <p className="text-sm text-text-secondary">
                  Link this Work project to a planner project to log time on
                  issues.
                </p>
                {plannerProjectId ? (
                  <p className="text-sm text-text-primary">
                    {plannerProjectName?.trim() || "Linked"}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <label className="block min-w-0 flex-1">
                      <span className="sr-only">Select customer project</span>
                      <select
                        value={linkDraft}
                        onChange={(event) => setLinkDraft(event.target.value)}
                        disabled={linking || loadingLinkable}
                        className="w-full rounded-md border border-form bg-bg-default px-2.5 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
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
                      disabled={linking || loadingLinkable || !linkDraft.trim()}
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
              className="mt-0 min-h-0 flex-1 overflow-y-auto px-6 py-5"
            >
              <WorkBoardMembers
                members={members}
                people={people}
                layout="list"
                onAdd={onAddMember}
                onRemove={onRemoveMember}
              />
            </TabsContent>

            <TabsContent
              value="components"
              className="mt-0 min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5"
            >
              <p className="text-sm text-text-secondary">
                Group work by area. Deleting a component clears it from issues
                that use it.
              </p>
              {components.length === 0 && !addingComponent ? (
                <p className="text-sm text-text-tertiary">No components yet.</p>
              ) : (
                <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                  {components.map((component) => (
                    <li
                      key={component.id}
                      className="flex items-center gap-2 px-3 py-2"
                    >
                      <input
                        type="text"
                        aria-label={`Rename ${component.name}`}
                        value={componentDrafts[component.id] ?? component.name}
                        disabled={savingComponentId === component.id}
                        onChange={(event) =>
                          setComponentDrafts((current) => ({
                            ...current,
                            [component.id]: event.target.value,
                          }))
                        }
                        onBlur={() => {
                          void commitComponentName(component);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            (event.target as HTMLInputElement).blur();
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setComponentDrafts((current) => ({
                              ...current,
                              [component.id]: component.name,
                            }));
                            (event.target as HTMLInputElement).blur();
                          }
                        }}
                        className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0.5 text-sm text-text-primary focus:outline-none focus:ring-0 disabled:opacity-50"
                      />
                      <button
                        type="button"
                        className="shrink-0 text-label-s text-text-secondary hover:text-danger"
                        onClick={() => setDeletingComponent(component)}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {addingComponent ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitNewComponent();
                  }}
                >
                  <Input
                    value={newComponentName}
                    onChange={(event) => setNewComponentName(event.target.value)}
                    placeholder="Component name"
                    aria-label="New component name"
                    autoFocus
                    disabled={creatingComponent}
                    modalStyle
                    className="min-w-0 flex-1"
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setAddingComponent(false);
                        setNewComponentName("");
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={creatingComponent || !newComponentName.trim()}
                  >
                    Add
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={creatingComponent}
                    onClick={() => {
                      setAddingComponent(false);
                      setNewComponentName("");
                    }}
                  >
                    Cancel
                  </Button>
                </form>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md px-1 py-1.5 text-sm text-text-secondary hover:bg-bg-muted hover:text-text-primary"
                  onClick={() => setAddingComponent(true)}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Add component
                </button>
              )}
            </TabsContent>

            <TabsContent
              value="import"
              className="mt-0 min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5"
            >
              <p className="text-sm text-text-secondary">
                Bring issues into this project from another tool. Existing
                imports are skipped when the same external key is already
                linked.
              </p>
              <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                <li className="flex items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">
                      Jira
                    </p>
                    <p className="text-xs text-text-tertiary">
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
              value="agents.md"
              forceMount
              className="mt-0 min-h-0 flex-1 overflow-y-auto px-6 py-5 data-[state=inactive]:hidden"
            >
              <ProjectInstructionsForm key={projectId} projectId={projectId} agentsMd={agentsMd} />
            </TabsContent>

            <TabsContent
              value="danger"
              className="mt-0 min-h-0 flex-1 overflow-y-auto px-6 py-5"
            >
              <h2 className="text-sm font-medium text-text-primary">
                Danger zone
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Archive hides this project from Rove Work. Issues are kept.
              </p>
              <Button
                type="button"
                variant="danger"
                className="mt-4"
                onClick={onArchive}
              >
                Archive project
              </Button>
            </TabsContent>
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
    </>
  );
}

function ProjectInstructionsForm({ projectId, agentsMd }: { projectId: string; agentsMd: string }) {
  const [draft, setDraft] = useState(agentsMd);
  const [saved, setSaved] = useState(agentsMd);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [saving, startSaving] = useTransition();

  function save() {
    if (saving || draft === saved) {
      return;
    }

    setFeedback(null);
    startSaving(async () => {
      try {
        const result = await saveWorkProjectInstructionsAction(projectId, draft);

        if (!result.ok) {
          setFeedback({ kind: "error", message: result.error });
          return;
        }

        setSaved(result.agentsMd);
        setFeedback({ kind: "success", message: "Saved." });
      } catch {
        setFeedback({ kind: "error", message: "Unable to save project instructions. Try again." });
      }
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="space-y-2">
        <label htmlFor="work-project-instructions" className="block text-sm font-medium text-text-primary">
          Project instructions
        </label>
        <p id="work-project-instructions-help" className="text-sm text-text-secondary">
          Instructions for agents working in this project. Describe the workflow, conventions and how to use the board columns.
        </p>
        <textarea
          id="work-project-instructions"
          aria-describedby="work-project-instructions-help"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setFeedback(null);
          }}
          rows={16}
          disabled={saving}
          spellCheck={false}
          className="box-border w-full resize-y rounded-lg border border-form bg-bg-default px-3 py-2 font-mono text-sm text-text-primary focus:border-form focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--color-border-form)] disabled:opacity-50"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving || draft === saved}>
          {saving ? "Saving..." : "Save"}
        </Button>
        {feedback ? (
          <p role={feedback.kind === "error" ? "alert" : "status"} className={`text-sm ${feedback.kind === "error" ? "text-danger" : "text-text-secondary"}`}>
            {feedback.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
