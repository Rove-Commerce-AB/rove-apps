"use client";

import { useEffect, useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { Button, PageLoading, SideDrawer } from "@/components/ui";
import {
  addSupportCaseComment,
  getSupportCaseDetail,
  replySupportCaseEmail,
  setSupportCaseStatus,
  type SupportCaseComment,
  type SupportCaseCommentKind,
  type SupportCaseDetail,
} from "@/lib/supportCases";

type Props = {
  customerId: string;
  issueId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommented?: () => void;
  /** Staff can leave internal notes hidden from customers. */
  allowInternalComments?: boolean;
};

type ComposeMode = "comment" | "internal" | "email";

function kindLabel(kind: SupportCaseCommentKind): string | null {
  switch (kind) {
    case "mail_in":
      return "Mail in";
    case "mail_out":
      return "Mail out";
    case "internal":
      return "Internal";
    default:
      return null;
  }
}

function kindClass(kind: SupportCaseCommentKind): string {
  switch (kind) {
    case "mail_in":
      return "border-brand-signal/25 bg-accent-primary-subtle/40";
    case "mail_out":
      return "border-brand-signal/25 bg-bg-muted/60";
    case "internal":
      return "border-status-warning/30 bg-status-warning-subtle/40";
    default:
      return "border-border-subtle bg-bg-muted/40";
  }
}

function CommentCard({ item }: { item: SupportCaseComment }) {
  const label = kindLabel(item.kind);
  return (
    <li className={`rounded-lg border px-3 py-2.5 ${kindClass(item.kind)}`}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-text-primary">
          {item.authorName}
          {label ? (
            <span
              className={`ml-2 text-[10px] font-semibold uppercase tracking-wide ${
                item.kind === "internal"
                  ? "text-status-warning"
                  : "text-brand-signal"
              }`}
            >
              {label}
            </span>
          ) : null}
        </span>
        <span className="text-xs text-text-tertiary">
          {new Date(item.createdAt).toLocaleString()}
        </span>
      </div>
      <pre className="whitespace-pre-wrap font-sans text-sm text-text-secondary">
        {item.body}
      </pre>
    </li>
  );
}

export function SupportCaseDrawer({
  customerId,
  issueId,
  open,
  onOpenChange,
  onCommented,
  allowInternalComments = false,
}: Props) {
  const [detail, setDetail] = useState<SupportCaseDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [composeMode, setComposeMode] = useState<ComposeMode>("comment");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !issueId) {
      setDetail(null);
      setLoadError(null);
      setComment("");
      setError(null);
      setComposeMode("comment");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getSupportCaseDetail(customerId, issueId)
      .then((next) => {
        if (!cancelled) {
          setDetail(next);
          setComposeMode(
            next.canReplyByEmail ? "email" : allowInternalComments ? "comment" : "comment"
          );
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setDetail(null);
          setLoadError(
            cause instanceof Error ? cause.message : "Failed to load incident"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, issueId, customerId, allowInternalComments]);

  function refreshDetail() {
    if (!issueId) return;
    return getSupportCaseDetail(customerId, issueId).then((next) => {
      setDetail(next);
      onCommented?.();
    });
  }

  function submitComposer(event: React.FormEvent) {
    event.preventDefault();
    if (!issueId || !comment.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        if (composeMode === "email") {
          await replySupportCaseEmail(customerId, issueId, comment);
        } else {
          await addSupportCaseComment(customerId, issueId, comment, {
            internal: composeMode === "internal",
          });
        }
        setComment("");
        await refreshDetail();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Failed to send message"
        );
      }
    });
  }

  function onStatusChange(statusId: string) {
    if (!issueId || !detail || pending || statusId === detail.statusId) return;
    setError(null);
    startTransition(async () => {
      try {
        await setSupportCaseStatus(customerId, issueId, statusId);
        await refreshDetail();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Failed to update status"
        );
      }
    });
  }

  const submitLabel =
    composeMode === "email"
      ? pending
        ? "Sending email…"
        : "Send email"
      : pending
        ? "Sending…"
        : composeMode === "internal"
          ? "Add internal note"
          : "Send comment";

  return (
    <SideDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={detail?.key ?? "Incident"}
      subtitle={
        detail ? (
          <span className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                detail.isDone
                  ? "bg-status-success-subtle text-status-success"
                  : "bg-bg-muted text-text-secondary"
              }`}
            >
              {detail.statusName}
            </span>
            <span className="text-xs text-text-tertiary">
              Opened {new Date(detail.createdAt).toLocaleString()}
            </span>
          </span>
        ) : undefined
      }
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      {loading ? (
        <div className="p-6">
          <PageLoading />
        </div>
      ) : loadError ? (
        <p role="alert" className="p-6 text-sm text-danger">
          {loadError}
        </p>
      ) : detail ? (
        <>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                {detail.title}
              </h2>
              {detail.canChangeStatus ? (
                <label className="mt-3 block text-xs font-medium text-text-secondary">
                  Status
                  <select
                    className="mt-1 h-9 w-full rounded-lg border border-form bg-bg-default px-3 text-sm text-text-primary"
                    value={detail.statusId}
                    disabled={pending}
                    onChange={(event) => onStatusChange(event.target.value)}
                  >
                    {detail.statuses.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {detail.description.trim() ? (
                <div
                  className={`mt-3 rounded-lg border px-3 py-2.5 ${
                    detail.descriptionKind === "mail_in"
                      ? kindClass("mail_in")
                      : "border-border-subtle bg-bg-muted/30"
                  }`}
                >
                  {detail.descriptionKind === "mail_in" ? (
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-brand-signal">
                      Mail in
                    </p>
                  ) : null}
                  <pre className="whitespace-pre-wrap font-sans text-sm text-text-secondary">
                    {detail.description}
                  </pre>
                </div>
              ) : (
                <p className="mt-3 text-sm text-text-tertiary">
                  No description.
                </p>
              )}
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium text-text-primary">
                Conversation
              </h3>
              {detail.comments.length === 0 ? (
                <p className="text-sm text-text-tertiary">No comments yet.</p>
              ) : (
                <ul className="space-y-3">
                  {detail.comments.map((item) => (
                    <CommentCard key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </div>
          </div>

          <form
            className="shrink-0 space-y-2 border-t border-border-subtle px-6 py-4"
            onSubmit={submitComposer}
          >
            {allowInternalComments || detail.canReplyByEmail ? (
              <div className="flex flex-wrap gap-1">
                <ModeChip
                  active={composeMode === "comment"}
                  onClick={() => setComposeMode("comment")}
                  label="Comment"
                />
                {allowInternalComments ? (
                  <ModeChip
                    active={composeMode === "internal"}
                    onClick={() => setComposeMode("internal")}
                    label="Internal"
                  />
                ) : null}
                {detail.canReplyByEmail ? (
                  <ModeChip
                    active={composeMode === "email"}
                    onClick={() => setComposeMode("email")}
                    label="Email reply"
                    icon
                  />
                ) : null}
              </div>
            ) : null}
            {composeMode === "email" && detail.mailThread ? (
              <p className="text-xs text-text-tertiary">
                Sends from{" "}
                <span className="text-text-secondary">
                  {detail.mailThread.fromMailbox}
                </span>{" "}
                to{" "}
                <span className="text-text-secondary">
                  {detail.mailThread.replyToEmail}
                </span>{" "}
                in the existing Gmail thread.
              </p>
            ) : null}
            <label className="block text-sm font-medium text-text-primary">
              {composeMode === "email"
                ? "Email reply"
                : composeMode === "internal"
                  ? "Internal note"
                  : "Add comment"}
              <textarea
                className="mt-1 w-full rounded-lg border border-form bg-bg-default px-3 py-2 text-sm"
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={
                  composeMode === "email"
                    ? "Write the email reply…"
                    : "Write a message…"
                }
              />
            </label>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={pending || !comment.trim()}>
                {submitLabel}
              </Button>
            </div>
          </form>
        </>
      ) : null}
    </SideDrawer>
  );
}

function ModeChip({
  active,
  onClick,
  label,
  icon = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors ${
        active
          ? "bg-accent-primary-subtle text-accent-primary-text"
          : "text-text-secondary hover:bg-bg-muted hover:text-text-primary"
      }`}
    >
      {icon ? <Mail className="h-3 w-3" aria-hidden /> : null}
      {label}
    </button>
  );
}
