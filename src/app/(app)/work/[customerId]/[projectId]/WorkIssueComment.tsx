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
}: {
  comment: WorkComment;
  canEdit: boolean;
  people: WorkPerson[];
  pending: boolean;
  onSave: (body: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editImageIds, setEditImageIds] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  return (
    <li className="flex gap-3">
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
          <WorkCommentBody body={comment.body} />
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
