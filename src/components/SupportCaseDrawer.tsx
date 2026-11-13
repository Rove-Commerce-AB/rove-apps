"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ClipboardEvent,
} from "react";
import { Mail, X } from "lucide-react";
import {
  Button,
  ConfirmModal,
  PageLoading,
  Select,
  SideDrawer,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { WorkCardPeople } from "@/app/(app)/work/[customerId]/[projectId]/WorkIssueDrawer";
import {
  addSupportCaseAssignee,
  addSupportCaseComment,
  deleteSupportCase,
  getSupportCaseDetail,
  removeSupportCaseAssignee,
  replySupportCaseEmail,
  setSupportCaseOwner,
  setSupportCaseStatus,
  type SupportCaseComment,
  type SupportCaseCommentKind,
  type SupportCaseDetail,
} from "@/lib/supportCases";
import {
  extractVideoPosterJpeg,
  isImageMime,
  isVideoMime,
  pasteMediaFileName,
} from "@/lib/workMedia";
import { WORK_FILE_MAX_BYTES, type WorkPerson } from "@/lib/workTypes";

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
type DrawerTab = "conversation" | "danger";

type MailAttach = {
  localId: string;
  file: File;
  previewUrl: string;
  revokePreview: boolean;
};

const MAX_MAIL_ATTACHMENTS = 8;

const propertyChipClass =
  "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-text-primary/[0.06]";
const metaSelectTriggerClass =
  "h-7 !w-auto max-w-full border-0 bg-transparent px-0 py-0 text-[13px] font-medium text-text-primary hover:bg-transparent focus:border-transparent focus:ring-0";

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
        highlight
          ? "ring-2 ring-brand-signal ring-offset-2 ring-offset-bg-default"
          : ""
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

function initialMailComment(
  detail: SupportCaseDetail
): SupportCaseComment | null {
  if (detail.descriptionKind !== "mail_in" || !detail.description.trim()) {
    return null;
  }
  return {
    id: `description:${detail.id}`,
    body: detail.description,
    createdAt: detail.createdAt,
    authorName: detail.mailThread?.replyToEmail || "Customer",
    authorId: "description",
    isInternal: false,
    kind: "mail_in",
  };
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
  const [mailAttachments, setMailAttachments] = useState<MailAttach[]>([]);
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const highlightRef = useRef<HTMLLIElement | null>(null);
  const mailAttachmentsRef = useRef(mailAttachments);
  mailAttachmentsRef.current = mailAttachments;

  function clearMailAttachments() {
    for (const row of mailAttachmentsRef.current) {
      if (row.revokePreview) URL.revokeObjectURL(row.previewUrl);
    }
    setMailAttachments([]);
  }

  useEffect(() => {
    return () => {
      for (const row of mailAttachmentsRef.current) {
        if (row.revokePreview) URL.revokeObjectURL(row.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (!open || !issueId) {
      setDetail(null);
      setLoadError(null);
      setComment("");
      setError(null);
      setComposeMode("comment");
      setTab("conversation");
      setConfirmDelete(false);
      clearMailAttachments();
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

  async function addMailMedia(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    const room = MAX_MAIL_ATTACHMENTS - mailAttachmentsRef.current.length;
    if (room <= 0) {
      setError(`You can attach at most ${MAX_MAIL_ATTACHMENTS} files`);
      return;
    }
    const accepted = files.slice(0, room);
    const nextRows: MailAttach[] = [];
    for (let i = 0; i < accepted.length; i += 1) {
      const file = accepted[i]!;
      const mime = (file.type || "").toLowerCase();
      if (!isImageMime(mime) && !isVideoMime(mime)) continue;
      if (file.size > WORK_FILE_MAX_BYTES) {
        setError("Each attachment must be 8 MB or smaller");
        continue;
      }
      const named = new File([file], pasteMediaFileName(file, i), {
        type: file.type || (isVideoMime(mime) ? "video/mp4" : "image/png"),
      });
      let previewUrl = URL.createObjectURL(named);
      let revokePreview = true;
      if (isVideoMime(named.type)) {
        const poster = await extractVideoPosterJpeg(named);
        if (poster) {
          URL.revokeObjectURL(previewUrl);
          previewUrl = URL.createObjectURL(poster);
        }
      }
      nextRows.push({
        localId: crypto.randomUUID(),
        file: named,
        previewUrl,
        revokePreview,
      });
    }
    if (files.length > room) {
      setError(`You can attach at most ${MAX_MAIL_ATTACHMENTS} files`);
    }
    if (nextRows.length > 0) {
      setMailAttachments((prev) => [...prev, ...nextRows]);
    }
  }

  function removeMailAttachment(localId: string) {
    setMailAttachments((prev) => {
      const row = prev.find((item) => item.localId === localId);
      if (row?.revokePreview) URL.revokeObjectURL(row.previewUrl);
      return prev.filter((item) => item.localId !== localId);
    });
  }

  function handleMailPaste(event: ClipboardEvent) {
    if (composeMode !== "email" || pending) return;
    const items = event.clipboardData?.items;
    if (!items?.length) return;
    const media: File[] = [];
    for (const item of items) {
      if (!isImageMime(item.type) && !isVideoMime(item.type)) continue;
      const blob = item.getAsFile();
      if (blob) media.push(blob);
    }
    if (media.length === 0) return;
    event.preventDefault();
    void addMailMedia(media);
  }

  function submitComposer(event: React.FormEvent) {
    event.preventDefault();
    if (!issueId || !comment.trim() || pending) return;
    setError(null);
    const files = mailAttachments.map((row) => row.file);
    startTransition(async () => {
      try {
        if (composeMode === "email") {
          await replySupportCaseEmail(customerId, issueId, comment, files);
          clearMailAttachments();
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

  function onSetOwner(person: WorkPerson | null) {
    if (!issueId || !detail || pending) return;
    if ((detail.owner?.id ?? null) === (person?.id ?? null)) return;
    setError(null);
    startTransition(async () => {
      try {
        await setSupportCaseOwner(customerId, issueId, person?.id ?? null);
        await refreshDetail();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Failed to update owner"
        );
      }
    });
  }

  function onAddAssignee(person: WorkPerson) {
    if (!issueId || !detail || pending) return;
    if (detail.assignees.some((row) => row.id === person.id)) return;
    setError(null);
    startTransition(async () => {
      try {
        await addSupportCaseAssignee(customerId, issueId, person.id);
        await refreshDetail();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Failed to add assignee"
        );
      }
    });
  }

  function onRemoveAssignee(person: WorkPerson) {
    if (!issueId || !detail || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        await removeSupportCaseAssignee(customerId, issueId, person.id);
        await refreshDetail();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Failed to remove assignee"
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
    if (value === "conversation" || value === "danger") {
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

  const seedMail = detail ? initialMailComment(detail) : null;
  const timeline: SupportCaseComment[] = detail
    ? seedMail
      ? [seedMail, ...detail.comments]
      : detail.comments
    : [];

  const latestMailInId =
    detail?.awaitingStaff
      ? [...timeline].reverse().find((item) => item.kind === "mail_in")?.id ??
        null
      : null;

  const conversationBody = detail ? (
    <div className="space-y-4">
      {detail.awaitingStaff ? (
        <p className="rounded-md border border-brand-signal/30 bg-accent-primary-subtle/50 px-3 py-2 text-sm text-accent-primary-text">
          Customer reply waiting for a staff response.
        </p>
      ) : null}

      {detail.canChangeStatus || detail.canAssign || detail.owner || detail.assignees.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1 rounded-xl bg-bg-muted/40 px-3 py-2">
          {detail.canChangeStatus ? (
            <div className={propertyChipClass}>
              <Select
                value={detail.statusId}
                onValueChange={onStatusChange}
                disabled={pending}
                options={detail.statuses.map((status) => ({
                  value: status.id,
                  label: status.name,
                }))}
                triggerTitle="Status"
                variant="inlineEdit"
                className="w-fit min-w-0"
                triggerClassName={metaSelectTriggerClass}
              />
            </div>
          ) : (
            <p className="px-1.5 text-[13px] font-medium text-text-primary">
              {detail.statusName}
            </p>
          )}
          <div className="ml-auto flex shrink-0 items-center pl-2">
            <WorkCardPeople
              owner={detail.owner}
              assignees={detail.assignees}
              people={detail.people}
              disabled={pending || !detail.canAssign}
              portal={false}
              onSetOwner={detail.canAssign ? onSetOwner : undefined}
              onAddAssignee={detail.canAssign ? onAddAssignee : undefined}
              onRemoveAssignee={detail.canAssign ? onRemoveAssignee : undefined}
            />
          </div>
        </div>
      ) : null}

      {timeline.length === 0 ? (
        <p className="text-sm text-text-tertiary">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {timeline.map((item) => (
            <CommentCard
              key={item.id}
              item={item}
              highlight={item.id === latestMailInId}
              listRef={item.id === latestMailInId ? highlightRef : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  ) : null;

  return (
    <SideDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={detail?.supportCaseRef ?? detail?.key ?? "Incident"}
      subtitle={
        detail ? (
          <span className="flex flex-wrap items-center gap-2">
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
            <div className="shrink-0 space-y-1 border-b border-border-subtle px-6 pb-3 pt-5">
              <h2 className="text-base font-semibold text-text-primary">
                {detail.title}
              </h2>
              <p className="text-xs text-text-tertiary">
                <span>{detail.key}</span>
                {detail.mailThread?.replyToEmail ? (
                  <>
                    <span className="mx-1.5 text-border-strong" aria-hidden>
                      ·
                    </span>
                    <span>{detail.mailThread.replyToEmail}</span>
                  </>
                ) : null}
              </p>
            </div>

            {detail.canDelete ? (
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
                    <TabsTrigger value="danger" className="px-3 !px-3">
                      Danger
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                  <TabsContent value="conversation" className="mt-0">
                    {conversationBody}
                  </TabsContent>
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
                </div>
              </Tabs>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {conversationBody}
              </div>
            )}
          </div>

          {tab === "conversation" ? (
            <form
              className="shrink-0 space-y-2 border-t border-border-subtle px-6 py-4"
              onSubmit={submitComposer}
              onPaste={handleMailPaste}
            >
              {allowInternalComments || detail.canReplyByEmail ? (
                <div className="flex flex-wrap gap-1">
                  <ModeChip
                    active={composeMode === "comment"}
                    onClick={() => {
                      setComposeMode("comment");
                      clearMailAttachments();
                    }}
                    label="Comment"
                  />
                  {allowInternalComments ? (
                    <ModeChip
                      active={composeMode === "internal"}
                      onClick={() => {
                        setComposeMode("internal");
                        clearMailAttachments();
                      }}
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
              {composeMode === "email" ? (
                <div className="space-y-2">
                  <label className="block text-xs text-text-secondary">
                    Attach image or video (max 8 MB each)
                    <input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      disabled={pending}
                      className="mt-1 block w-full text-xs text-text-secondary"
                      onChange={(event) => {
                        const list = event.target.files
                          ? Array.from(event.target.files)
                          : [];
                        event.target.value = "";
                        void addMailMedia(list);
                      }}
                    />
                  </label>
                  {mailAttachments.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {mailAttachments.map((row) => (
                        <li key={row.localId} className="group relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={row.previewUrl}
                            alt={row.file.name}
                            title={row.file.name}
                            className="h-12 w-12 rounded border border-border-subtle object-cover"
                          />
                          <button
                            type="button"
                            className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-bg-default text-text-secondary opacity-0 shadow-sm ring-1 ring-border-subtle group-hover:opacity-100 hover:text-danger"
                            aria-label={`Remove ${row.file.name}`}
                            onClick={() => removeMailAttachment(row.localId)}
                          >
                            <X className="h-2.5 w-2.5" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-text-tertiary">
                      Paste a screenshot or video clip, or choose files.
                    </p>
                  )}
                </div>
              ) : null}
              {error && tab === "conversation" ? (
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
