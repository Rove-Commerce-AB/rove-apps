"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { workIssuePriorityLabel } from "@/lib/workBoardView";
import type { WorkMyIssue } from "@/lib/workMyIssues";
import { formatVisibleWorkEstimate } from "@/lib/workEstimate";
import { compareTextSv } from "@/lib/sort";
import { workCustomerHref, workProjectHref } from "@/lib/routes";
import {
  workStatusBorderColor,
  workStatusToneAtIndex,
} from "@/lib/workStatusColors";
import { createWorkIssueAction } from "../actions";
import { WorkIssueTypeIcon } from "../[customerId]/[projectId]/WorkIssueTypeIcon";
import { WorkAddIssueInline } from "../[customerId]/[projectId]/WorkAddIssueInline";
import { WorkMyIssueDrawer } from "./WorkMyIssueDrawer";

type RoleFilter = "either" | "owner" | "assignee";
type GroupBy = "project" | "status" | "sprint" | "none";

type Group = {
  key: string;
  title: string;
  customerId: string | null;
  customerName: string | null;
  projectId: string | null;
  projectTitle: string | null;
  issues: WorkMyIssue[];
};

function dueSortKey(dueDate: string | null): number {
  if (!dueDate) return Number.POSITIVE_INFINITY;
  return new Date(`${dueDate}T00:00:00.000Z`).getTime();
}

function groupIssues(issues: WorkMyIssue[], groupBy: GroupBy): Group[] {
  if (groupBy === "none") {
    return [
      {
        key: "all",
        title: "",
        customerId: null,
        customerName: null,
        projectId: null,
        projectTitle: null,
        issues,
      },
    ];
  }
  const map = new Map<string, Group>();
  for (const issue of issues) {
    let key: string;
    let title: string;
    let customerId: string | null = null;
    let customerName: string | null = null;
    let projectId: string | null = null;
    let projectTitle: string | null = null;
    if (groupBy === "project") {
      key = issue.projectId;
      title = `${issue.customerName} · ${issue.projectTitle}`;
      customerId = issue.customerId;
      customerName = issue.customerName;
      projectId = issue.projectId;
      projectTitle = issue.projectTitle;
    } else if (groupBy === "status") {
      key = issue.statusName.toLowerCase();
      title = issue.statusName;
    } else {
      key = issue.sprintLabel ?? "__backlog__";
      title = issue.sprintLabel ?? "No sprint";
    }
    const group = map.get(key) ?? {
      key,
      title,
      customerId,
      customerName,
      projectId,
      projectTitle,
      issues: [],
    };
    group.issues.push(issue);
    map.set(key, group);
  }
  const groups = [...map.values()];
  if (groupBy === "project") {
    groups.sort((a, b) => compareTextSv(a.title, b.title));
  } else if (groupBy === "status") {
    groups.sort((a, b) => compareTextSv(a.title, b.title));
  } else {
    groups.sort((a, b) => {
      if (a.key === "__backlog__") return 1;
      if (b.key === "__backlog__") return -1;
      return compareTextSv(a.title, b.title);
    });
  }
  for (const group of groups) {
    group.issues.sort((a, b) => {
      const due = dueSortKey(a.dueDate) - dueSortKey(b.dueDate);
      if (due !== 0) return due;
      return a.key.localeCompare(b.key, "sv");
    });
  }
  return groups;
}

function triggerClass(active: boolean) {
  return `inline-flex h-8 items-center rounded-md px-2.5 text-[13px] transition-colors ${
    active
      ? "bg-accent-primary-subtle text-accent-primary-text"
      : "text-text-secondary hover:bg-bg-muted hover:text-text-primary"
  }`;
}

export function WorkMyIssuesPageClient({ issues }: { issues: WorkMyIssue[] }) {
  const router = useRouter();
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("either");
  const [includeDone, setIncludeDone] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("project");
  const [addingProjectId, setAddingProjectId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [drawerSelection, setDrawerSelection] = useState<{
    boardId: string;
    issueId: string;
  } | null>(null);

  function openAddForProject(projectId: string) {
    setCreateError(null);
    setAddingProjectId((current) => (current === projectId ? null : projectId));
  }

  function closeAddForm() {
    setAddingProjectId(null);
  }

  useEffect(() => {
    setAddingProjectId(null);
  }, [groupBy]);

  const filtered = useMemo(() => {
    return issues.filter((issue) => {
      if (!includeDone && issue.isDone) return false;
      if (roleFilter === "owner") return issue.isOwner;
      if (roleFilter === "assignee") return issue.isAssignee;
      return true;
    });
  }, [issues, includeDone, roleFilter]);

  const groups = useMemo(
    () => groupIssues(filtered, groupBy),
    [filtered, groupBy]
  );

  async function createInProject(
    projectId: string,
    input: { title: string; issueType: "issue" | "bug" }
  ): Promise<boolean> {
    setCreateError(null);
    const result = await createWorkIssueAction({
      boardId: projectId,
      title: input.title,
      issueType: input.issueType,
    });
    if (!result.ok) {
      setCreateError(result.error);
      return false;
    }
    setAddingProjectId(null);
    router.refresh();
    return true;
  }

  return (
    <div className="w-full">
      <PageHeader
        title="My work"
        description="Issues where you are owner or assignee across projects you can access."
        className="mb-6"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className={triggerClass(roleFilter === "either")}
            onClick={() => setRoleFilter("either")}
          >
            Either
          </button>
          <button
            type="button"
            className={triggerClass(roleFilter === "owner")}
            onClick={() => setRoleFilter("owner")}
          >
            Owner
          </button>
          <button
            type="button"
            className={triggerClass(roleFilter === "assignee")}
            onClick={() => setRoleFilter("assignee")}
          >
            Assignee
          </button>
          <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden />
          <button
            type="button"
            className={triggerClass(groupBy === "project")}
            onClick={() => setGroupBy("project")}
          >
            By project
          </button>
          <button
            type="button"
            className={triggerClass(groupBy === "status")}
            onClick={() => setGroupBy("status")}
          >
            By status
          </button>
          <button
            type="button"
            className={triggerClass(groupBy === "sprint")}
            onClick={() => setGroupBy("sprint")}
          >
            By sprint
          </button>
          <button
            type="button"
            className={triggerClass(groupBy === "none")}
            onClick={() => setGroupBy("none")}
          >
            List
          </button>
          <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden />
          <button
            type="button"
            className={triggerClass(includeDone)}
            onClick={() => setIncludeDone((value) => !value)}
          >
            Include done
          </button>
        </div>
      </PageHeader>

      {createError ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {createError}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-bg-default px-4 py-10 text-center text-sm text-text-secondary">
          {issues.length === 0
            ? "Nothing assigned to you yet."
            : "No issues match the current filters."}
        </p>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.key} className="space-y-1.5">
              {groupBy !== "none" ? (
                <div className="flex items-center gap-1 px-0.5">
                  <h2 className="min-w-0 flex-1 truncate text-label-s text-text-secondary">
                    {groupBy === "project" &&
                    group.customerId &&
                    group.projectId &&
                    group.customerName &&
                    group.projectTitle ? (
                      <>
                        <Link
                          href={workCustomerHref(group.customerId)}
                          className="hover:text-text-primary hover:underline"
                        >
                          {group.customerName}
                        </Link>
                        <span className="text-text-tertiary"> · </span>
                        <Link
                          href={workProjectHref(
                            group.customerId,
                            group.projectId
                          )}
                          className="hover:text-text-primary hover:underline"
                        >
                          {group.projectTitle}
                        </Link>
                      </>
                    ) : (
                      group.title
                    )}
                    <span className="ml-1.5 tabular-nums text-text-tertiary">
                      {group.issues.length}
                    </span>
                  </h2>
                  {groupBy === "project" && group.projectId ? (
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        aria-label={`Add issue in ${group.title}`}
                        aria-expanded={addingProjectId === group.projectId}
                        title="Add issue"
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                          addingProjectId === group.projectId
                            ? "bg-bg-muted text-text-secondary"
                            : "text-text-tertiary/55 hover:bg-bg-muted hover:text-text-secondary"
                        }`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => openAddForProject(group.projectId!)}
                      >
                        <Plus
                          className={`h-3.5 w-3.5 transition-transform duration-200 ${
                            addingProjectId === group.projectId
                              ? "rotate-45"
                              : ""
                          }`}
                          aria-hidden
                        />
                      </button>
                      {addingProjectId === group.projectId ? (
                        <div
                          className="work-my-add-popover absolute top-[calc(100%+4px)] right-0 z-20 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border-subtle bg-bg-default p-2 shadow-md"
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <WorkAddIssueInline
                            open
                            onOpenChange={(open) => {
                              if (!open) closeAddForm();
                            }}
                            onCreate={(input) =>
                              createInProject(group.projectId!, input)
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <ul className="overflow-hidden rounded-xl border border-border-subtle bg-bg-default">
                {group.issues.map((issue, index) => {
                  const hoursLabel = formatVisibleWorkEstimate(
                    issue.loggedHours,
                    issue.estimateHours,
                    {
                      showEstimates: issue.showEstimates,
                      showReportedTime: issue.showReportedTime,
                      estimateUnit: issue.estimateUnit,
                      currency: issue.billingCurrency,
                    }
                  );
                  const selected =
                    drawerSelection?.issueId === issue.id &&
                    drawerSelection.boardId === issue.projectId;
                  return (
                    <li
                      key={issue.id}
                      className={
                        index === 0 ? "" : "border-t border-border-subtle"
                      }
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setDrawerSelection({
                            boardId: issue.projectId,
                            issueId: issue.id,
                          })
                        }
                        style={{
                          borderLeftColor: workStatusBorderColor(
                            workStatusToneAtIndex(
                              issue.customerColor,
                              issue.statusIndex,
                              issue.statusCount
                            )
                          ),
                        }}
                        className={`flex w-full items-center gap-3 border-l-4 px-3 py-2.5 text-left transition-colors hover:bg-bg-muted ${
                          selected ? "bg-bg-muted" : ""
                        }`}
                      >
                        <WorkIssueTypeIcon type={issue.issueType} size="sm" />
                        <span className="w-16 shrink-0 text-label-s tabular-nums text-text-tertiary">
                          {issue.key}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                          {issue.title}
                        </span>
                        {groupBy !== "project" ? (
                          <span className="hidden max-w-[10rem] truncate text-caption text-text-tertiary sm:inline">
                            {issue.projectTitle}
                          </span>
                        ) : null}
                        {groupBy !== "status" ? (
                          <span className="hidden shrink-0 text-caption text-text-secondary md:inline">
                            {issue.statusName}
                          </span>
                        ) : null}
                        {groupBy !== "sprint" && issue.sprintLabel ? (
                          <span className="hidden max-w-[8rem] truncate text-caption text-text-tertiary lg:inline">
                            {issue.sprintLabel}
                          </span>
                        ) : null}
                        {issue.priority ? (
                          <span className="hidden shrink-0 text-caption text-text-tertiary xl:inline">
                            {workIssuePriorityLabel(issue.priority)}
                          </span>
                        ) : null}
                        {hoursLabel ? (
                          <span className="shrink-0 tabular-nums text-caption text-text-tertiary">
                            {hoursLabel}
                          </span>
                        ) : null}
                        <span className="w-20 shrink-0 text-right text-caption tabular-nums text-text-tertiary">
                          {issue.dueDate ?? "—"}
                        </span>
                        <span className="hidden w-16 shrink-0 text-right text-caption text-text-tertiary sm:inline">
                          {issue.isOwner && issue.isAssignee
                            ? "Both"
                            : issue.isOwner
                              ? "Owner"
                              : "Assignee"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <WorkMyIssueDrawer
        selection={drawerSelection}
        onOpenChange={(open) => {
          if (!open) setDrawerSelection(null);
        }}
      />
    </div>
  );
}
