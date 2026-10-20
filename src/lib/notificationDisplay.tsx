"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { UserNotificationRow } from "@/lib/userNotificationKinds";
import {
  LEGACY_TASK_NOTIFICATION_KIND,
  USER_NOTIFICATION_KIND,
} from "@/lib/userNotificationKinds";
import { workIssueHref } from "@/lib/routes";

/** Absolute timestamp: yyMMdd HH:mm (local). */
export function formatNotificationTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yy}${mm}${dd} ${hh}:${mi}`;
}

const linkClass =
  "font-medium text-brand-signal underline underline-offset-2 hover:opacity-90";

function formatWeeksLabel(weeks: unknown): string {
  if (!Array.isArray(weeks) || weeks.length === 0) return "";
  const parsed = weeks
    .filter(
      (x): x is { year: number; week: number } =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as { year?: unknown }).year === "number" &&
        typeof (x as { week?: unknown }).week === "number"
    )
    .sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.week - b.week
    );
  if (parsed.length === 0) return "";
  const first = parsed[0]!;
  const last = parsed[parsed.length - 1]!;
  if (first.year === last.year && first.week === last.week) {
    return `${first.year} W${first.week}`;
  }
  if (first.year === last.year) {
    return `${first.year} W${first.week}–W${last.week}`;
  }
  return `${first.year} W${first.week} – ${last.year} W${last.week}`;
}

export function notificationBody(n: UserNotificationRow): { text: ReactNode } {
  const p = n.payload;
  if (n.kind === USER_NOTIFICATION_KIND.ALLOCATION_BOOKED) {
    const customer =
      typeof p.customerName === "string" && p.customerName.trim()
        ? p.customerName.trim()
        : null;
    const project =
      typeof p.projectName === "string" && p.projectName.trim()
        ? p.projectName.trim()
        : null;
    const projectId =
      typeof p.projectId === "string" && p.projectId ? p.projectId : null;
    const weeksLabel = formatWeeksLabel(p.weeks);
    const who =
      customer && project
        ? `${customer} · ${project}`
        : project ?? customer ?? "a project";
    const text = (
      <>
        You have been booked on{" "}
        {projectId ? (
          <Link href={`/projects/${projectId}`} prefetch={false} className={linkClass}>
            {who}
          </Link>
        ) : (
          <span className="font-medium">{who}</span>
        )}
        {weeksLabel ? <> ({weeksLabel})</> : null}.
      </>
    );
    return { text };
  }
  if (n.kind === USER_NOTIFICATION_KIND.FEATURE_REQUEST_IMPLEMENTED) {
    const preview =
      typeof p.contentPreview === "string" && p.contentPreview.trim()
        ? p.contentPreview.trim()
        : "(no content)";
    return {
      text: (
        <>
          A feature request you submitted has been marked as done:{" "}
          <span className="font-medium opacity-90">&quot;{preview}&quot;</span>
        </>
      ),
    };
  }
  if (n.kind === USER_NOTIFICATION_KIND.FEATURE_REQUEST_DECLINED) {
    const preview =
      typeof p.contentPreview === "string" && p.contentPreview.trim()
        ? p.contentPreview.trim()
        : "(no content)";
    const adminComment =
      typeof p.adminComment === "string" && p.adminComment.trim()
        ? p.adminComment.trim()
        : "No comment provided.";
    return {
      text: (
        <>
          A feature request you submitted was declined:{" "}
          <span className="font-medium opacity-90">&quot;{preview}&quot;</span>. Admin
          comment: <span className="font-medium opacity-90">{adminComment}</span>
        </>
      ),
    };
  }
  if (n.kind === LEGACY_TASK_NOTIFICATION_KIND.TASK_BOARD_INVITED) {
    const boardTitle =
      typeof p.boardTitle === "string" && p.boardTitle.trim()
        ? p.boardTitle.trim()
        : "a board";
    const inviter =
      typeof p.inviterLabel === "string" && p.inviterLabel.trim()
        ? p.inviterLabel.trim()
        : "Someone";
    return {
      text: (
        <>
          <span className="font-medium">{inviter}</span> added you to the board{" "}
          <span className="font-medium">{boardTitle}</span>.
        </>
      ),
    };
  }
  if (n.kind === LEGACY_TASK_NOTIFICATION_KIND.TASK_TODO_ASSIGNED) {
    const boardTitle =
      typeof p.boardTitle === "string" && p.boardTitle.trim()
        ? p.boardTitle.trim()
        : "a board";
    const todoTitle =
      typeof p.todoTitle === "string" && p.todoTitle.trim()
        ? p.todoTitle.trim()
        : "a task";
    const assigner =
      typeof p.assignerLabel === "string" && p.assignerLabel.trim()
        ? p.assignerLabel.trim()
        : "Someone";
    return {
      text: (
        <>
          <span className="font-medium">{assigner}</span> assigned you a todo on{" "}
          <span className="font-medium">{boardTitle}</span>:{" "}
          <span className="font-medium opacity-90">&quot;{todoTitle}&quot;</span>
        </>
      ),
    };
  }
  if (
    n.kind === USER_NOTIFICATION_KIND.WORK_ISSUE_MENTIONED ||
    n.kind === USER_NOTIFICATION_KIND.WORK_ISSUE_OWNER_SET ||
    n.kind === USER_NOTIFICATION_KIND.WORK_ISSUE_ASSIGNED
  ) {
    const actorName =
      (typeof p.mentionerName === "string" && p.mentionerName.trim()
        ? p.mentionerName.trim()
        : null) ||
      (typeof p.actorName === "string" && p.actorName.trim()
        ? p.actorName.trim()
        : null) ||
      "Someone";
    const issueKey =
      typeof p.issueKey === "string" && p.issueKey.trim()
        ? p.issueKey.trim()
        : "an issue";
    const issueTitle =
      typeof p.issueTitle === "string" && p.issueTitle.trim()
        ? p.issueTitle.trim()
        : null;
    const customerId =
      typeof p.customerId === "string" && p.customerId.trim()
        ? p.customerId.trim()
        : null;
    const boardId =
      typeof p.boardId === "string" && p.boardId.trim() ? p.boardId.trim() : null;
    const issueId =
      typeof p.issueId === "string" && p.issueId.trim() ? p.issueId.trim() : null;
    const href =
      customerId && boardId && issueId
        ? workIssueHref(customerId, boardId, issueId)
        : null;
    const issueLabel = (
      <>
        {issueKey}
        {issueTitle ? (
          <>
            {" "}
            <span className="font-medium opacity-90">&quot;{issueTitle}&quot;</span>
          </>
        ) : null}
      </>
    );
    const linkedIssue = href ? (
      <Link href={href} prefetch={false} className={linkClass}>
        {issueLabel}
      </Link>
    ) : (
      issueLabel
    );
    if (n.kind === USER_NOTIFICATION_KIND.WORK_ISSUE_OWNER_SET) {
      return {
        text: (
          <>
            <span className="font-medium">{actorName}</span> made you owner of{" "}
            {linkedIssue}.
          </>
        ),
      };
    }
    if (n.kind === USER_NOTIFICATION_KIND.WORK_ISSUE_ASSIGNED) {
      return {
        text: (
          <>
            <span className="font-medium">{actorName}</span> assigned you to{" "}
            {linkedIssue}.
          </>
        ),
      };
    }
    return {
      text: (
        <>
          <span className="font-medium">{actorName}</span> mentioned you on{" "}
          {linkedIssue}.
        </>
      ),
    };
  }
  return { text: n.kind };
}
