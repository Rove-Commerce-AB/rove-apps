"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import {
  Button,
  ConfirmModal,
  IconButton,
  InitialsAvatar,
  Input,
  OptionSegments,
  PageLoading,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { AddCustomerConsultantModal } from "@/components/AddCustomerConsultantModal";
import { AddCustomerRateModal } from "@/components/AddCustomerRateModal";
import { AddCustomerUserModal } from "@/components/AddCustomerUserModal";
import { CustomerDrawerOverview } from "@/components/CustomerDrawerOverview";
import { CustomerRatesTab } from "@/components/CustomerRatesTab";
import { ProjectSettingsPanel } from "@/components/ProjectSettingsPanel";
import {
  deleteCustomerAction,
  updateCustomerAction,
} from "@/app/(app)/customers/actions";
import { groupCustomerProjectsForList } from "@/lib/customerProjectsList";
import { removeCustomerUserFromCustomer } from "@/lib/customerAppUsersClient";
import type { CustomerAppUser } from "@/lib/customerAppUsersQueries";
import { removeConsultantFromCustomer } from "@/lib/customerConsultantsClient";
import type { CustomerConsultant } from "@/lib/customerConsultantsQueries";
import {
  createProject,
  getProjectWithDetailsById,
} from "@/lib/projectsClient";
import {
  personHrefForConsultant,
  personHrefForUser,
  ROUTES,
} from "@/lib/routes";
import type {
  CustomerProjectSummary,
  CustomerWithDetails,
  ProjectWithDetails,
} from "@/types";

type CustomerTab = "overview" | "projects" | "people" | "rates" | "danger";

type Props = {
  customer: CustomerWithDetails;
  assignedConsultants: CustomerConsultant[];
  assignedUsers: CustomerAppUser[];
  allConsultants: { id: string; name: string }[];
  allCustomerUsers: CustomerAppUser[];
  isAdmin: boolean;
};

function ProjectGroup({
  title,
  projects,
  tone = "default",
  onOpen,
}: {
  title: string;
  projects: CustomerProjectSummary[];
  tone?: "default" | "pipeline" | "inactive";
  onOpen: (id: string) => void;
}) {
  if (projects.length === 0) return null;

  const dotClass =
    tone === "inactive"
      ? "bg-text-tertiary"
      : tone === "pipeline"
        ? "bg-status-warning"
        : "bg-status-success";

  return (
    <section>
      <h3 className="mb-2 text-heading-xs text-text-secondary">
        {title} ({projects.length})
      </h3>
      <ul className="space-y-2">
        {projects.map((project) => (
          <li key={project.id}>
            <button
              type="button"
              onClick={() => onOpen(project.id)}
              className={`flex w-full items-center gap-3 rounded-lg border border-border-subtle bg-bg-default px-3 py-3 text-left transition-colors hover:bg-interactive-secondary ${
                tone === "inactive" ? "opacity-65" : ""
              }`}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                {project.name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-text-tertiary">
                {project.probability ?? 100}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CustomerDrawerDanger({
  customer,
}: {
  customer: CustomerWithDetails;
}) {
  const router = useRouter();
  const [isActive, setIsActive] = useState(customer.isActive);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function setActive(next: boolean) {
    if (next === isActive) return;
    setError(null);
    setSubmitting(true);
    try {
      await updateCustomerAction(customer.id, { is_active: next });
      setIsActive(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      await deleteCustomerAction(customer.id);
      setShowDeleteConfirm(false);
      router.push(ROUTES.customers);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete customer");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="space-y-8 px-6 py-6">
        <div>
          <h2 className="text-sm font-medium text-text-primary">Danger zone</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Inactivate hides the customer from normal workflows. Delete removes
            it permanently.
          </p>
        </div>

        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div>
          <h3 className="text-sm font-medium text-text-primary">Status</h3>
          <p className="mt-1 text-sm text-text-secondary">
            Inactive customers are filtered out of default lists and pickers.
          </p>
          <div className="mt-4">
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
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-text-primary">
            Delete customer
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            Permanently deletes this customer. This cannot be undone.
          </p>
          <Button
            type="button"
            variant="danger"
            className="mt-4"
            disabled={submitting || deleting}
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete customer
          </Button>
        </div>
      </div>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete customer"
        message={`Delete ${customer.name}? This cannot be undone.`}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        variant="danger"
        onClose={() => {
          if (deleting) return;
          setShowDeleteConfirm(false);
        }}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}

function NewProjectForm({
  customerId,
  onCancel,
  onCreated,
}: {
  customerId: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Project name is required");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await createProject({
        name: trimmed,
        customer_id: customerId,
      });
      router.refresh();
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6"
    >
      <div>
        <p className="text-overline text-text-tertiary">Projects</p>
        <h2 className="mt-1 text-heading-l text-text-primary">New project</h2>
      </div>

      <div className="mt-6">
        <label
          htmlFor="drawer-project-name"
          className="mb-1.5 block text-label-m text-text-primary"
        >
          Project name
        </label>
        <Input
          id="drawer-project-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Enter project name"
          autoFocus
        />
      </div>

      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-auto flex justify-end gap-2 pt-8">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create project"}
        </Button>
      </div>
    </form>
  );
}

export function CustomerDrawerContent({
  customer,
  assignedConsultants = [],
  assignedUsers = [],
  allConsultants = [],
  allCustomerUsers = [],
  isAdmin,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CustomerTab>("overview");
  const [creatingProject, setCreatingProject] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [selectedProject, setSelectedProject] =
    useState<ProjectWithDetails | null>(null);
  const [projectLoadError, setProjectLoadError] = useState<string | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [showInactiveProjects, setShowInactiveProjects] = useState(false);
  const [addConsultantOpen, setAddConsultantOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addRateOpen, setAddRateOpen] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [ratesRefreshKey, setRatesRefreshKey] = useState(0);
  const [consultantError, setConsultantError] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CustomerConsultant | null>(
    null
  );
  const [removeUserTarget, setRemoveUserTarget] =
    useState<CustomerAppUser | null>(null);
  const [removing, setRemoving] = useState(false);
  const { confirmed, pipeline, inactive } = groupCustomerProjectsForList(
    customer.projects
  );

  function returnToProjects() {
    setCreatingProject(false);
    setSelectedProjectId(null);
    setSelectedProject(null);
    setProjectLoadError(null);
    setActiveTab("projects");
  }

  useEffect(() => {
    if (!selectedProjectId) {
      setSelectedProject(null);
      setProjectLoadError(null);
      setProjectLoading(false);
      return;
    }

    let cancelled = false;
    setProjectLoading(true);
    setProjectLoadError(null);
    void getProjectWithDetailsById(selectedProjectId)
      .then((project) => {
        if (cancelled) return;
        if (!project) {
          setSelectedProject(null);
          setProjectLoadError("Project not found.");
          setProjectLoading(false);
          return;
        }
        setSelectedProject(project);
        setProjectLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setSelectedProject(null);
        setProjectLoadError(
          e instanceof Error ? e.message : "Failed to load project"
        );
        setProjectLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  async function confirmRemoveUser() {
    if (!removeUserTarget) return;
    setUserError(null);
    setRemoving(true);
    try {
      await removeCustomerUserFromCustomer(customer.id, removeUserTarget.id);
      setRemoveUserTarget(null);
      router.refresh();
    } catch (e) {
      setUserError(
        e instanceof Error ? e.message : "Failed to remove customer user"
      );
    } finally {
      setRemoving(false);
    }
  }

  async function confirmRemoveConsultant() {
    if (!removeTarget) return;
    setConsultantError(null);
    setRemoving(true);
    try {
      await removeConsultantFromCustomer(customer.id, removeTarget.id);
      setRemoveTarget(null);
      router.refresh();
    } catch (e) {
      setConsultantError(
        e instanceof Error ? e.message : "Failed to remove consultant"
      );
    } finally {
      setRemoving(false);
    }
  }

  if (creatingProject) {
    return (
      <NewProjectForm
        customerId={customer.id}
        onCancel={returnToProjects}
        onCreated={returnToProjects}
      />
    );
  }

  if (selectedProjectId) {
    if (projectLoading) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-12">
          <PageLoading />
        </div>
      );
    }

    if (projectLoadError || !selectedProject) {
      return (
        <div className="flex min-h-0 flex-1 flex-col px-6 py-6">
          <button
            type="button"
            onClick={returnToProjects}
            className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            Back to projects
          </button>
          <p className="mt-4 text-sm text-danger" role="alert">
            {projectLoadError ?? "Project not found."}
          </p>
        </div>
      );
    }

    return (
      <ProjectSettingsPanel
        key={selectedProject.id}
        project={selectedProject}
        isAdmin={isAdmin}
        onBack={returnToProjects}
        onDeleted={() => {
          returnToProjects();
          router.refresh();
        }}
      />
    );
  }

  return (
    <>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as CustomerTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="shrink-0 border-border-default px-6 !gap-6">
          <TabsTrigger value="overview" className="px-1 !px-1">
            Overview
          </TabsTrigger>
          <TabsTrigger value="projects" className="px-1 !px-1">
            Projects
          </TabsTrigger>
          <TabsTrigger value="people" className="px-1 !px-1">
            People
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
          <CustomerDrawerOverview
            customer={customer}
            allConsultants={allConsultants}
            assignedUsers={assignedUsers}
          />
        </TabsContent>

        <TabsContent
          value="projects"
          className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
        >
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-heading-s text-text-primary">Projects</h2>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setCreatingProject(true)}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add
              </Button>
            </div>

            <ProjectGroup
              title="Confirmed"
              projects={confirmed}
              onOpen={setSelectedProjectId}
            />
            <ProjectGroup
              title="Pipeline"
              projects={pipeline}
              tone="pipeline"
              onOpen={setSelectedProjectId}
            />

            {inactive.length > 0 ? (
              <div>
                <button
                  type="button"
                  onClick={() => setShowInactiveProjects((show) => !show)}
                  className="flex w-full items-center justify-between rounded-lg border border-border-subtle bg-bg-default px-3 py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-interactive-secondary hover:text-text-primary"
                  aria-expanded={showInactiveProjects}
                >
                  <span>Inactive projects ({inactive.length})</span>
                  {showInactiveProjects ? (
                    <ChevronUp className="h-4 w-4" aria-hidden />
                  ) : (
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  )}
                </button>
                {showInactiveProjects ? (
                  <div className="mt-3">
                    <ProjectGroup
                      title="Inactive"
                      projects={inactive}
                      tone="inactive"
                      onOpen={setSelectedProjectId}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {customer.projects.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No projects for this customer yet.
              </p>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent
          value="people"
          className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
        >
          <div className="space-y-8">
            <section>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-heading-s text-text-primary">
                  Consultants
                </h2>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setAddConsultantOpen(true)}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add
                </Button>
              </div>

              {consultantError ? (
                <p className="mt-3 text-sm text-danger" role="alert">
                  {consultantError}
                </p>
              ) : null}

              {assignedConsultants.length > 0 ? (
                <ul className="mt-4 divide-y divide-border-subtle">
                  {assignedConsultants.map((consultant) => (
                    <li
                      key={consultant.id}
                      className="relative -mx-6 flex items-center gap-3 px-6 py-3 transition-colors hover:bg-interactive-secondary"
                    >
                      <Link
                        href={personHrefForConsultant(
                          consultant.id,
                          consultant.appUserId
                        )}
                        scroll={false}
                        prefetch={false}
                        className="absolute inset-0"
                        aria-label={consultant.name}
                      />
                      <div className="pointer-events-none flex min-w-0 flex-1 items-center gap-3">
                        <InitialsAvatar
                          name={consultant.name}
                          initials={consultant.name
                            .split(" ")
                            .map((part) => part[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                          {consultant.name}
                        </span>
                      </div>
                      <IconButton
                        variant="ghostDanger"
                        className="relative z-10"
                        aria-label={`Remove ${consultant.name}`}
                        onClick={() => setRemoveTarget(consultant)}
                        disabled={removing}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-text-secondary">
                  No consultants assigned.
                </p>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-heading-s text-text-primary">
                  Customer users
                </h2>
                {customer.isInternal ? null : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setAddUserOpen(true)}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Add
                  </Button>
                )}
              </div>

              {userError ? (
                <p className="mt-3 text-sm text-danger" role="alert">
                  {userError}
                </p>
              ) : null}

              {customer.isInternal ? (
                <p className="mt-4 text-sm text-text-secondary">
                  Customer users cannot be linked to Rove.
                </p>
              ) : assignedUsers.length > 0 ? (
                <ul className="mt-4 divide-y divide-border-subtle">
                  {assignedUsers.map((user) => (
                    <li
                      key={user.id}
                      className="relative -mx-6 flex items-center gap-3 px-6 py-3 transition-colors hover:bg-interactive-secondary"
                    >
                      <Link
                        href={personHrefForUser(user.id)}
                        scroll={false}
                        prefetch={false}
                        className="absolute inset-0"
                        aria-label={user.name}
                      />
                      <div className="pointer-events-none flex min-w-0 flex-1 items-center gap-3">
                        <InitialsAvatar
                          name={user.name}
                          initials={user.name
                            .split(" ")
                            .map((part) => part[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-text-primary">
                            {user.name}
                          </span>
                          <span className="block truncate text-xs text-text-tertiary">
                            {user.email}
                          </span>
                        </span>
                      </div>
                      <IconButton
                        variant="ghostDanger"
                        className="relative z-10"
                        aria-label={`Remove ${user.name}`}
                        onClick={() => setRemoveUserTarget(user)}
                        disabled={removing}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-text-secondary">
                  No customer users assigned.
                </p>
              )}
            </section>
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
              onClick={() => setAddRateOpen(true)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </Button>
          </div>
          {ratesError ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {ratesError}
            </p>
          ) : null}
          <div className="mt-4">
            <CustomerRatesTab
              mode="edit"
              customerId={customer.id}
              billingCurrency={customer.billingCurrency}
              onError={setRatesError}
              showDescription={false}
              refreshTrigger={ratesRefreshKey}
            />
          </div>
        </TabsContent>

        {isAdmin ? (
          <TabsContent
            value="danger"
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <CustomerDrawerDanger
              key={`${customer.id}-${customer.isActive}`}
              customer={customer}
            />
          </TabsContent>
        ) : null}
      </Tabs>

      <AddCustomerConsultantModal
        isOpen={addConsultantOpen}
        onClose={() => setAddConsultantOpen(false)}
        onSuccess={() => {
          setConsultantError(null);
          router.refresh();
        }}
        customerId={customer.id}
        existingConsultants={assignedConsultants}
      />

      <AddCustomerUserModal
        isOpen={addUserOpen}
        onClose={() => setAddUserOpen(false)}
        onSuccess={() => {
          setUserError(null);
          router.refresh();
        }}
        customerId={customer.id}
        existingUsers={assignedUsers}
        allCustomerUsers={allCustomerUsers}
      />

      <AddCustomerRateModal
        isOpen={addRateOpen}
        onClose={() => setAddRateOpen(false)}
        onSuccess={() => {
          setRatesRefreshKey((k) => k + 1);
          router.refresh();
        }}
        customerId={customer.id}
        billingCurrency={customer.billingCurrency}
      />

      <ConfirmModal
        isOpen={removeTarget != null}
        title="Remove consultant"
        message={
          removeTarget
            ? `Remove ${removeTarget.name} from this customer?`
            : ""
        }
        confirmLabel="Remove"
        variant="primary"
        onClose={() => setRemoveTarget(null)}
        onConfirm={confirmRemoveConsultant}
      />

      <ConfirmModal
        isOpen={removeUserTarget != null}
        title="Remove customer user"
        message={
          removeUserTarget
            ? `Remove ${removeUserTarget.name} from this customer?`
            : ""
        }
        confirmLabel="Remove"
        variant="primary"
        onClose={() => setRemoveUserTarget(null)}
        onConfirm={confirmRemoveUser}
      />
    </>
  );
}
