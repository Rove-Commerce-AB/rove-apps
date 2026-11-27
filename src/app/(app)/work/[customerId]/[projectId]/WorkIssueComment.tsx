"use client";

import { useState } from "react";
import { Button, ConfirmModal, InitialsAvatar } from "@/components/ui";
import {
  joinWorkInlineImages,
  splitWorkInlineImages,
  workFileImageHref,
} from "@/lib/workInlineImages";
import { encodeMentions, mentionPlainText } from "@/lib/workMentions";
import { formatWorkTimestamp } from "@/lib/workTimeAgo";
import {
  emptyWorkCommentReactions,
  WORK_COMMENT_REACTION_META,
  type WorkCommentReactionType,
} from "@/lib/workCommentReactions";
import type { WorkComment, WorkPerson } from "@/lib/workTypes";
import {
  WorkCommentBody,
  WorkCommentComposer,
  WorkInlineImageThumbs,
} from "./WorkCommentComposer";

export function WorkIssueComment({
  comment,
  canEdit,
  people,
  pending,
  onSave,
  onDelete,
  onToggleReaction,
}: {
  comment: WorkComment;
  canEdit: boolean;
  people: WorkPerson[];
  pending: boolean;
  onSave: (body: string) => void;
  onDelete: () => void;
  onToggleReaction: (reaction: WorkCommentReactionType) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editImageIds, setEditImageIds] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const reactions =
    comment.reactions?.length === WORK_COMMENT_REACTION_META.length
      ? comment.reactions
      : emptyWorkCommentReactions().map((empty) => {
          const existing = comment.reactions?.find((r) => r.type === empty.type);
          return existing ?? empty;
        });

  function startEdit() {
    const split = splitWorkInlineImages(comment.body);
    setDraft(mentionPlainText(split.text));
    setEditImageIds(split.fileIds);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft("");
    setEditImageIds([]);
    setDeleteOpen(false);
  }

  function commitEdit() {
    const encoded = encodeMentions(draft.trim(), people);
    const next = joinWorkInlineImages(encoded, editImageIds);
    if (!next) {
      setDeleteOpen(true);
      return;
    }
    if (next === comment.body) {
      cancelEdit();
      return;
    }
    onSave(next);
    cancelEdit();
  }

  const hasActiveReactions = reactions.some((reaction) => reaction.count > 0);
  const reactionBar = (
    <div
      className={`inline-flex items-center gap-0.5 rounded-md border border-border-subtle bg-bg-muted/70 p-0.5 ${
        hasActiveReactions
          ? ""
          : "pointer-events-none opacity-0 group-hover/comment:pointer-events-auto group-hover/comment:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100"
      }`}
    >
      {reactions.map((reaction) => {
        const title =
          reaction.names.length > 0
            ? `${reaction.label}: ${reaction.names.join(", ")}`
            : reaction.label;
        const active = reaction.count > 0;
        return (
          <button
            key={reaction.type}
            type="button"
            disabled={pending}
            title={title}
            aria-label={`${reaction.label}${
              active ? ` (${reaction.count})` : ""
            }`}
            aria-pressed={reaction.reactedByMe}
            onClick={() => onToggleReaction(reaction.type)}
            className={`inline-flex h-6 items-center gap-0.5 rounded px-1.5 text-[12px] transition-colors ${
              active
                ? reaction.reactedByMe
                  ? "bg-brand-signal/15 text-text-primary"
                  : "text-text-primary hover:bg-bg-default/80"
                : "text-text-tertiary hover:bg-bg-default/80 hover:text-text-primary"
            }`}
          >
            <span aria-hidden>{reaction.emoji}</span>
            {active ? (
              <span className="tabular-nums">{reaction.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  return (
    <li className="group/comment flex gap-3">
      <InitialsAvatar
        name={comment.author.name}
        initials={comment.author.initials}
        size="xs"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <p className="min-w-0 flex-1 text-label-s font-medium text-text-primary">
            {comment.author.name}
          </p>
          {canEdit && !editing ? (
            <button
              type="button"
              disabled={pending}
              className="shrink-0 text-body-m text-text-tertiary hover:text-text-primary"
              onClick={startEdit}
            >
              Edit
            </button>
          ) : null}
          <time
            dateTime={comment.createdAt}
            className="w-32 shrink-0 text-right text-body-m text-text-tertiary"
          >
            {formatWorkTimestamp(comment.createdAt)}
          </time>
        </div>
        {editing ? (
          <form
            className="mt-2 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              commitEdit();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEdit();
              }
            }}
          >
            <WorkCommentComposer
              people={people}
              value={draft}
              contentKey={`${comment.id}-edit`}
              disabled={pending}
              showShortcutHint={false}
              onChange={setDraft}
              onSubmit={commitEdit}
            />
            <WorkInlineImageThumbs
              items={editImageIds.map((id) => ({
                key: id,
                src: workFileImageHref(id),
              }))}
              onRemove={(key) =>
                setEditImageIds((ids) => ids.filter((id) => id !== key))
              }
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={cancelEdit}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                Save
              </Button>
            </div>
          </form>
        ) : (
          <WorkCommentBody body={comment.body} toolbarLeading={reactionBar} />
        )}
      </div>
      <ConfirmModal
        isOpen={deleteOpen}
        title="Delete comment"
        message="The comment is empty. Do you want to delete it?"
        confirmLabel="Delete"
        variant="danger"
        onClose={() => {
          setDeleteOpen(false);
          const split = splitWorkInlineImages(comment.body);
          setDraft(mentionPlainText(split.text));
          setEditImageIds(split.fileIds);
        }}
        onConfirm={() => {
          onDelete();
          cancelEdit();
        }}
      />
    </li>
  );
}
