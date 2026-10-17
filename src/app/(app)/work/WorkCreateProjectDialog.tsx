"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, InitialsAvatar, Input } from "@/components/ui";
import { workProjectHref } from "@/lib/routes";
import { suggestWorkBoardPrefix } from "@/lib/workIssueKey";
import type { WorkAccessPerson } from "@/lib/workTypes";
import {
  createWorkBoardAction,
  listLinkablePlannerProjectsAction,
  listWorkAccessPeopleAction,
} from "./actions";

type Customer = {
  id: string;
  name: string;
};

type CreateMode = "link" | "standalone";

function withRequiredMember(
  ids: string[],
  requiredId: string | null
): string[] {
  if (!requiredId) return ids;
  if (ids.includes(requiredId)) return ids;
  return [...ids, requiredId];
}

export function WorkCreateProjectDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<CreateMode>("standalone");
  const [title, setTitle] = useState("");
  const [prefix, setPrefix] = useState("");
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [plannerProjectId, setPlannerProjectId] = useState<string>("");
  const [plannerProjects, setPlannerProjects] = useState<
    { id: string; name: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<WorkAccessPerson[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const selectAllCustomerRef = useRef<HTMLInputElement | null>(null);
  const selectAllOthersRef = useRef<HTMLInputElement | null>(null);

  const customerPeople = people.filter((person) => person.onCustomer);
  const otherPeople = people.filter((person) => !person.onCustomer);
  const hasLinkableProjects = plannerProjects.length > 0;

  useEffect(() => {
    if (!open || !customer) {
      setReady(false);
      return;
    }
    let cancelled = false;
    setReady(false);
    setTitle("");
    setPrefix(suggestWorkBoardPrefix(customer.name));
    setPrefixTouched(false);
    setPlannerProjectId("");
    setError(null);
    setPeople([]);
    setCurrentUserId(null);
    setMemberIds([]);
    setPlannerProjects([]);
    setMode("standalone");

    void Promise.all([
      listWorkAccessPeopleAction(customer.id),
      listLinkablePlannerProjectsAction(customer.id),
    ])
      .then(([access, projects]) => {
        if (cancelled) return;
        setPeople(access.people);
        setCurrentUserId(access.currentUserId);
        const onCustomerIds = access.people
          .filter((person) => person.onCustomer)
          .map((person) => person.id);
        setMemberIds(withRequiredMember(onCustomerIds, access.currentUserId));
        setPlannerProjects(projects);
        setMode(projects.length > 0 ? "link" : "standalone");
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Could not load form data");
        setMode("standalone");
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [customer, open]);

  useEffect(() => {
    const customerEl = selectAllCustomerRef.current;
    if (customerEl) {
      const ids = customerPeople.map((person) => person.id);
      const selected = ids.filter((id) => memberIds.includes(id)).length;
      customerEl.indeterminate = selected > 0 && selected < ids.length;
    }
    const othersEl = selectAllOthersRef.current;
    if (othersEl) {
      const ids = otherPeople.map((person) => person.id);
      const selected = ids.filter((id) => memberIds.includes(id)).length;
      othersEl.indeterminate = selected > 0 && selected < ids.length;
    }
  }, [memberIds, customerPeople, otherPeople]);

  function toggleGroup(ids: string[]) {
    const allSelected = ids.every((id) => memberIds.includes(id));
    setMemberIds((current) => {
      if (allSelected) {
        const next = current.filter((id) => !ids.includes(id));
        return withRequiredMember(next, currentUserId);
      }
      return withRequiredMember(
        [...new Set([...current, ...ids])],
        currentUserId
      );
    });
  }

  useEffect(() => {
    if (mode !== "link" || !plannerProjectId) return;
    const selected = plannerProjects.find((row) => row.id === plannerProjectId);
    if (!selected) return;
    setTitle(selected.name);
    setPrefix(
      suggestWorkBoardPrefix(customer?.name ?? "", selected.name)
    );
    setPrefixTouched(false);
  }, [mode, plannerProjectId, plannerProjects, customer?.name]);

  function onTitleChange(value: string) {
    setTitle(value);
    if (prefixTouched) return;
    setPrefix(suggestWorkBoardPrefix(customer?.name ?? "", value));
  }

  function toggleMember(id: string) {
    if (currentUserId && id === currentUserId) return;
    setMemberIds((current) => {
      const next = current.includes(id)
        ? current.filter((row) => row !== id)
        : [...current, id];
      return withRequiredMember(next, currentUserId);
    });
  }

  function renderPersonRow(person: WorkAccessPerson) {
    const checked = memberIds.includes(person.id);
    const isSelf = Boolean(currentUserId && person.id === currentUserId);
    return (
      <li key={person.id}>
        <label
          className={`flex items-center gap-2 rounded-md px-1 py-1.5 ${
            isSelf
              ? "cursor-default"
              : "cursor-pointer hover:bg-bg-muted"
          }`}
        >
          <input
            type="checkbox"
            checked={checked}
            disabled={isSelf}
            onChange={() => toggleMember(person.id)}
            className="h-4 w-4 rounded border-border-form disabled:cursor-not-allowed disabled:opacity-60"
            title={isSelf ? "You always have access" : undefined}
          />
          <InitialsAvatar
            name={person.name}
            initials={person.initials}
            size="xs"
            className="!h-6 !w-6 text-[9px]"
          />
          <span className="min-w-0 truncate text-sm text-text-primary">
            {person.name}
            {isSelf ? (
              <span className="text-text-tertiary"> (you)</span>
            ) : null}
          </span>
        </label>
      </li>
    );
  }

  /* Wait until people + projects are loaded so the modal opens at final height (no jump). */
  const dialogOpen = open && ready;

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
      title={customer ? `New project · ${customer.name}` : "New project"}
      contentClassName="max-w-md"
    >
      <form
        className="modal-form-discreet mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!customer) return;
          if (mode === "link" && !plannerProjectId) {
            setError("Choose a customer project to link");
            return;
          }
          const members = withRequiredMember(memberIds, currentUserId);
          if (members.length === 0) {
            setError("A project needs at least one person with access");
            return;
          }
          setError(null);
          startTransition(async () => {
            const result = await createWorkBoardAction(
              customer.id,
              title,
              prefix,
              members,
              mode === "link" ? plannerProjectId : null
            );
            if (!result.ok) {
              setError(result.error);
              return;
            }
            onOpenChange(false);
            router.push(workProjectHref(customer.id, result.boardId));
            router.refresh();
          });
        }}
      >
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text-primary">
            Create as
          </legend>
          <div
            className="grid grid-cols-2 gap-2"
            role="radiogroup"
            aria-label="Create as"
          >
            <button
              type="button"
              role="radio"
              aria-checked={mode === "link"}
              disabled={!hasLinkableProjects}
              onClick={() => setMode("link")}
              className={`flex min-h-[4.25rem] flex-col items-start justify-start rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                mode === "link"
                  ? "border-accent-primary bg-accent-primary-subtle"
                  : "border-border-subtle bg-bg-default hover:bg-bg-muted"
              }`}
            >
              <span
                className={`block text-[13px] font-medium ${
                  mode === "link"
                    ? "text-accent-primary-text"
                    : "text-text-primary"
                }`}
              >
                Customer project
              </span>
              <span className="mt-0.5 block text-caption text-text-tertiary">
                Link to an existing one
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "standalone"}
              onClick={() => setMode("standalone")}
              className={`flex min-h-[4.25rem] flex-col items-start justify-start rounded-lg border px-3 py-2.5 text-left transition-colors ${
                mode === "standalone"
                  ? "border-accent-primary bg-accent-primary-subtle"
                  : "border-border-subtle bg-bg-default hover:bg-bg-muted"
              }`}
            >
              <span
                className={`block text-[13px] font-medium ${
                  mode === "standalone"
                    ? "text-accent-primary-text"
                    : "text-text-primary"
                }`}
              >
                Standalone
              </span>
              <span className="mt-0.5 block text-caption invisible" aria-hidden>
                Link to an existing one
              </span>
            </button>
          </div>
        </fieldset>

        <label
          className={`block min-h-[4.25rem] transition-opacity ${
            mode === "link" && hasLinkableProjects ? "opacity-100" : "opacity-50"
          }`}
        >
          <span className="mb-1 block text-sm font-medium text-text-primary">
            Customer project
          </span>
          <select
            value={plannerProjectId}
            onChange={(event) => setPlannerProjectId(event.target.value)}
            disabled={mode !== "link" || !hasLinkableProjects}
            className="w-full rounded-md border border-border-subtle bg-bg-default px-2.5 py-2 text-sm text-text-primary disabled:cursor-not-allowed"
            required={mode === "link" && hasLinkableProjects}
          >
            <option value="">
              {hasLinkableProjects ? "Select project…" : "No projects to link"}
            </option>
            {plannerProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <Input
          id="new-work-project-title"
          label="Title"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Project name"
          modalStyle
          disabled={mode === "link"}
          autoFocus={mode === "standalone"}
        />
        <Input
          id="new-work-project-prefix"
          label="Issue prefix"
          value={prefix}
          onChange={(event) => {
            setPrefixTouched(true);
            setPrefix(event.target.value.toUpperCase());
          }}
          placeholder="RT"
          title="Used for issue keys on this project, e.g. RT-12. Suggested from the title until you edit it."
          modalStyle
        />
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-text-primary">
            Access
          </legend>
          <ul className="min-h-52 max-h-52 space-y-1 overflow-y-auto">
            {people.length === 0 ? (
              <li className="px-1 py-2 text-caption text-text-tertiary">
                No people available
              </li>
            ) : (
              <>
                {customerPeople.length > 0 ? (
                  <>
                    <li className="sticky top-0 z-[1] bg-bg-default px-1 pb-0.5 pt-0.5">
                      <div className="flex items-center gap-2">
                        <input
                          ref={selectAllCustomerRef}
                          type="checkbox"
                          checked={
                            customerPeople.length > 0 &&
                            customerPeople.every((person) =>
                              memberIds.includes(person.id)
                            )
                          }
                          onChange={() =>
                            toggleGroup(
                              customerPeople.map((person) => person.id)
                            )
                          }
                          className="h-4 w-4 rounded border-border-form"
                          aria-label="Select all on customer"
                        />
                        <span className="text-caption text-text-tertiary">
                          On this customer
                        </span>
                      </div>
                    </li>
                    {customerPeople.map(renderPersonRow)}
                  </>
                ) : null}
                {otherPeople.length > 0 ? (
                  <>
                    <li
                      className={`sticky top-0 z-[1] bg-bg-default px-1 pb-0.5 pt-1.5 ${
                        customerPeople.length > 0
                          ? "mt-1 border-t border-border-subtle"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          ref={selectAllOthersRef}
                          type="checkbox"
                          checked={
                            otherPeople.length > 0 &&
                            otherPeople.every((person) =>
                              memberIds.includes(person.id)
                            )
                          }
                          onChange={() =>
                            toggleGroup(otherPeople.map((person) => person.id))
                          }
                          className="h-4 w-4 rounded border-border-form"
                          aria-label="Select all others"
                        />
                        <span className="text-caption text-text-tertiary">
                          Others
                        </span>
                      </div>
                    </li>
                    {otherPeople.map(renderPersonRow)}
                  </>
                ) : null}
              </>
            )}
          </ul>
        </fieldset>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending || memberIds.length === 0}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** @deprecated Use WorkCreateProjectDialog */
export const WorkCreateBoardDialog = WorkCreateProjectDialog;
