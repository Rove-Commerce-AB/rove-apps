"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Mail } from "lucide-react";
import {
  Button,
  ConfirmModal,
  PageLoading,
  SideDrawer,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import {
  addSupportCaseComment,
  deleteSupportCase,
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
  onDeleted?: () => void;
  /** Staff can leave internal notes hidden from customers. */
  allowInternalComments?: boolean;
};

type ComposeMode = "comment" | "internal" | "email";
type DrawerTab = "conversation" | "details" | "danger";

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

function CommentCard({
  item,
  highlight = false,
  listRef,
}: {
  item: SupportCaseComment;
  highlight?: boolean;
  listRef?: React.Ref<HTMLLIElement>;
}) {
  const label = kindLabel(item.kind);
  return (
    <li
      ref={listRef}
      className={`rounded-lg border px-3 py-2.5 ${kindClass(item.kind)} ${
        highlight ? "ring-2 ring-brand-signal ring-offset-2 ring-offset-bg-default" : ""
      }`}
    >
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
  onDeleted,
  allowInternalComments = false,
}: Props) {
  const [detail, setDetail] = useState<SupportCaseDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [composeMode, setComposeMode] = useState<ComposeMode>("comment");
  const [tab, setTab] = useState<DrawerTab>("conversation");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const highlightRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (!open || !issueId) {
      setDetail(null);
      setLoadError(null);
      setComment("");
      setError(null);
      setComposeMode("comment");
      setTab("conversation");
      setConfirmDelete(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setTab("conversation");
    getSupportCaseDetail(customerId, issueId)
      .then((next) => {
        if (!cancelled) {
          setDetail(next);
          setComposeMode(next.canReplyByEmail ? "email" : "comment");
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
  }, [open, issueId, customerId]);

  useEffect(() => {
    if (!detail?.awaitingStaff || tab !== "conversation" || loading) return;
    const node = highlightRef.current;
    if (!node) return;
    const timer = window.setTimeout(() => {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [detail?.id, detail?.awaitingStaff, tab, loading]);

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

  function removeCase() {
    if (!issueId || !detail?.canDelete || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteSupportCase(customerId, issueId);
        setConfirmDelete(false);
        onOpenChange(false);
        onDeleted?.();
        onCommented?.();
      } catch (cause) {
        setConfirmDelete(false);
        setError(
          cause instanceof Error ? cause.message : "Failed to delete case"
        );
      }
    });
  }

  function onTabChange(value: string) {
    if (value === "conversation" || value === "details" || value === "danger") {
      setTab(value);
      setError(null);
    }
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

  const latestMailInId =
    detail?.awaitingStaff
      ? [...detail.comments].reverse().find((item) => item.kind === "mail_in")
          ?.id ?? null
      : null;

  return (
    <SideDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={detail?.supportCaseRef ?? detail?.key ?? "Incident"}
      subtitle={
        detail ? (
          <span className="flex flex-wrap items-center gap-2">
            {detail.supportCaseRef ? (
              <span className="text-xs text-text-tertiary">{detail.key}</span>
            ) : null}
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
            {detail.awaitingStaff ? (
              <span className="rounded bg-accent-primary-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-primary-text">
                Customer reply
              </span>
            ) : null}
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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-border-subtle px-6 pb-3 pt-5">
              <h2 className="text-base font-semibold text-text-primary">
                {detail.title}
              </h2>
            </div>

            <Tabs
              value={tab}
              onValueChange={onTabChange}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="shrink-0 px-6 pt-3">
                <TabsList className="!gap-0">
                  <TabsTrigger value="conversation" className="px-3 !px-3">
                    Conversation
                  </TabsTrigger>
                  <TabsTrigger value="details" className="px-3 !px-3">
                    Details
                  </TabsTrigger>
                  {detail.canDelete ? (
                    <TabsTrigger value="danger" className="px-3 !px-3">
                      Danger
                    </TabsTrigger>
                  ) : null}
                </TabsList>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <TabsContent value="conversation" className="mt-0 space-y-3">
                  {detail.awaitingStaff ? (
                    <p className="rounded-md border border-brand-signal/30 bg-accent-primary-subtle/50 px-3 py-2 text-sm text-accent-primary-text">
                      Customer reply waiting for a staff response.
                    </p>
                  ) : null}
                  {detail.comments.length === 0 ? (
                    <p className="text-sm text-text-tertiary">
                      No comments yet.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {detail.comments.map((item) => (
                        <CommentCard
                          key={item.id}
                          item={item}
                          highlight={item.id === latestMailInId}
                          listRef={
                            item.id === latestMailInId
                              ? highlightRef
                              : undefined
                          }
                        />
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="details" className="mt-0 space-y-5">
                  {detail.canChangeStatus ? (
                    <label className="block text-xs font-medium text-text-secondary">
                      Status
                      <select
                        className="mt-1 h-9 w-full rounded-lg border border-form bg-bg-default px-3 text-sm text-text-primary"
                        value={detail.statusId}
                        disabled={pending}
                        onChange={(event) =>
                          onStatusChange(event.target.value)
                        }
                      >
                        {detail.statuses.map((status) => (
                          <option key={status.id} value={status.id}>
                            {status.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div>
                      <p className="text-xs font-medium text-text-secondary">
                        Status
                      </p>
                      <p className="mt-1 text-sm text-text-primary">
                        {detail.statusName}
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-xs font-medium text-text-secondary">
                      Description
                    </p>
                    {detail.description.trim() ? (
                      <div
                        className={`rounded-lg border px-3 py-2.5 ${
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
                      <p className="text-sm text-text-tertiary">
                        No description.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 rounded-lg border border-border-subtle bg-bg-muted/30 px-3 py-2.5">
                    <p className="text-xs font-medium text-text-secondary">
                      Case refs
                    </p>
                    <dl className="space-y-1.5 text-sm">
                      <div>
                        <dt className="text-xs text-text-tertiary">Support</dt>
                        <dd className="text-text-primary">
                          {detail.supportCaseRef ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-text-tertiary">Work key</dt>
                        <dd className="text-text-primary">{detail.key}</dd>
                      </div>
                    </dl>
                  </div>

                  {detail.mailThread ? (
                    <div className="space-y-2 rounded-lg border border-border-subtle bg-bg-muted/30 px-3 py-2.5">
                      <p className="text-xs font-medium text-text-secondary">
                        Mail thread
                      </p>
                      <dl className="space-y-1.5 text-sm">
                        <div>
                          <dt className="text-xs text-text-tertiary">Subject</dt>
                          <dd className="text-text-primary">
                            {detail.mailThread.subject || "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-text-tertiary">Reply to</dt>
                          <dd className="text-text-primary">
                            {detail.mailThread.replyToEmail}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-text-tertiary">From</dt>
                          <dd className="text-text-primary">
                            {detail.mailThread.fromMailbox}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ) : null}

                  {error && tab === "details" ? (
                    <p role="alert" className="text-sm text-danger">
                      {error}
                    </p>
                  ) : null}
                </TabsContent>

                {detail.canDelete ? (
                  <TabsContent value="danger" className="mt-0">
                    <div className="rounded-lg border border-danger/30 bg-danger/5 p-4">
                      <h3 className="text-sm font-semibold text-danger">
                        Danger zone
                      </h3>
                      <p className="mt-1 text-sm text-text-secondary">
                        Delete permanently removes this case and its comments.
                        Linked mail mapping rows are removed too. This cannot be
                        undone.
                      </p>
                      {detail.hasLoggedTime ? (
                        <p className="mt-3 text-sm text-text-secondary">
                          This case has logged time and cannot be deleted.
                        </p>
                      ) : null}
                      {error && tab === "danger" ? (
                        <p role="alert" className="mt-3 text-sm text-danger">
                          {error}
                        </p>
                      ) : null}
                      <Button
                        type="button"
                        variant="dangerSecondary"
                        size="sm"
                        className="mt-3"
                        disabled={pending || detail.hasLoggedTime}
                        onClick={() => setConfirmDelete(true)}
                      >
                        Delete case
                      </Button>
                    </div>
                  </TabsContent>
                ) : null}
              </div>
            </Tabs>
          </div>

          {tab === "conversation" ? (
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
          ) : null}

          <ConfirmModal
            isOpen={confirmDelete && detail.canDelete}
            title={`Delete ${detail.supportCaseRef ?? detail.key}?`}
            message="This permanently deletes the case and its conversation. Cases with logged time cannot be deleted."
            confirmLabel={pending ? "Deleting…" : "Delete"}
            variant="danger"
            onClose={() => {
              if (pending) return;
              setConfirmDelete(false);
            }}
            onConfirm={removeCase}
          />
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
