"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { workIssueHref } from "@/lib/routes";
import { workIssuePriorityLabel } from "@/lib/workBoardView";
import type { WorkMyIssue } from "@/lib/workMyIssues";
import { formatVisibleWorkHours } from "@/lib/workTime";
import { compareTextSv } from "@/lib/sort";
import { WorkIssueTypeIcon } from "../[customerId]/[projectId]/WorkIssueTypeIcon";

type RoleFilter = "either" | "owner" | "assignee";
type GroupBy = "project" | "status" | "sprint" | "none";

type Group = {
  key: string;
  title: string;
  issues: WorkMyIssue[];
};

function dueSortKey(dueDate: string | null): number {
  if (!dueDate) return Number.POSITIVE_INFINITY;
  return new Date(`${dueDate}T00:00:00.000Z`).getTime();
}

function groupIssues(issues: WorkMyIssue[], groupBy: GroupBy): Group[] {
  if (groupBy === "none") {
    return [{ key: "all", title: "", issues }];
  }
  const map = new Map<string, Group>();
  for (const issue of issues) {
    let key: string;
    let title: string;
    if (groupBy === "project") {
      key = issue.projectId;
      title = `${issue.customerName} · ${issue.projectTitle}`;
    } else if (groupBy === "status") {
      key = issue.statusName.toLowerCase();
      title = issue.statusName;
    } else {
      key = issue.sprintLabel ?? "__backlog__";
      title = issue.sprintLabel ?? "No sprint";
    }
    const group = map.get(key) ?? { key, title, issues: [] };
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
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("either");
  const [includeDone, setIncludeDone] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("project");

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
                <h2 className="px-0.5 text-label-s text-text-secondary">
                  {group.title}
                  <span className="ml-1.5 tabular-nums text-text-tertiary">
                    {group.issues.length}
                  </span>
                </h2>
              ) : null}
              <ul className="overflow-hidden rounded-xl border border-border-subtle bg-bg-default">
                {group.issues.map((issue, index) => {
                  const hoursLabel = formatVisibleWorkHours(
                    issue.loggedHours,
                    issue.estimateHours,
                    {
                      showEstimates: issue.showEstimates,
                      showReportedTime: issue.showReportedTime,
                    }
                  );
                  return (
                  <li
                    key={issue.id}
                    className={
                      index === 0 ? "" : "border-t border-border-subtle"
                    }
                  >
                    <Link
                      href={workIssueHref(
                        issue.customerId,
                        issue.projectId,
                        issue.id
                      )}
                      className="flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-bg-muted"
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
                    </Link>
                  </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
