"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  Button,
  ConfirmModal,
  DrawerItemList,
  Input,
  SideDrawer,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { customerHref } from "@/lib/routes";
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
  const [newComponentName, setNewComponentName] = useState("");
  const [creatingComponent, setCreatingComponent] = useState(false);
  const [renamingComponent, setRenamingComponent] = useState(false);
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
