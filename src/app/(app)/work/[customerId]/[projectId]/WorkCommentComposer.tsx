"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  mentionListKeyDown,
  WorkMentionSuggest,
} from "@/components/WorkMentionSuggest";
import {
  filterMentionPeople,
  insertMention,
  mentionQueryAt,
  parseMentionSegments,
  type MentionQuery,
} from "@/lib/workMentions";
import {
  splitWorkInlineImages,
  workFileImageHref,
} from "@/lib/workInlineImages";
import type { WorkPerson } from "@/lib/workTypes";

export function WorkInlineImageThumbs({
  items,
  onRemove,
}: {
  items: { key: string; src: string; uploading?: boolean }[];
  onRemove?: (key: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item.key} className="group relative">
          <a
            href={item.src}
            target="_blank"
            rel="noreferrer"
            className={`block overflow-hidden rounded border border-border-subtle bg-bg-muted ${
              item.uploading ? "opacity-60" : ""
            }`}
            title="Open image"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.src}
              alt=""
              className="h-8 w-8 object-cover"
            />
          </a>
          {onRemove ? (
            <button
              type="button"
              className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-bg-default text-text-secondary opacity-0 shadow-sm ring-1 ring-border-subtle group-hover:opacity-100 hover:text-danger"
              aria-label="Remove image"
              onClick={() => onRemove(item.key)}
            >
              <X className="h-2.5 w-2.5" aria-hidden />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function WorkCommentBody({ body }: { body: string }) {
  const { text, fileIds } = splitWorkInlineImages(body);
  const parts = parseMentionSegments(text);
  return (
    <div className="mt-1">
      {text.trim() ? (
        <p className="whitespace-pre-wrap text-body-m text-text-primary">
          {parts.map((part, index) =>
            part.type === "mention" ? (
              <span
                key={`${part.id}-${index}`}
                className="font-medium text-accent-primary-text"
              >
                @{part.value}
              </span>
            ) : (
              <span key={index}>{part.value}</span>
            )
          )}
        </p>
      ) : null}
      <WorkInlineImageThumbs
        items={fileIds.map((id) => ({
          key: id,
          src: workFileImageHref(id),
        }))}
      />
    </div>
  );
}

export function WorkCommentComposer({
  people,
  value,
  disabled,
  className,
  rows = 3,
  showShortcutHint = true,
  onChange,
  onFocus,
  onBlur,
}: {
  people: WorkPerson[];
  value: string;
  disabled?: boolean;
  className: string;
  rows?: number;
  showShortcutHint?: boolean;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = useMemo(
    () => (mention ? filterMentionPeople(people, mention.query) : []),
    [mention, people]
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [mention?.query, mention?.start, matches.length]);

  function syncMention(el: HTMLTextAreaElement) {
    setMention(mentionQueryAt(el.value, el.selectionStart, people));
  }

  function pick(person: WorkPerson) {
    const el = textareaRef.current;
    if (!mention || !el) return;
    const next = insertMention(value, mention.start, el.selectionStart, person);
    onChange(next.text);
    setMention(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  }

  return (
    <div className="relative flex h-full w-full min-w-0 flex-col">
      {mention ? (
        <WorkMentionSuggest
          matches={matches}
          activeIndex={activeIndex}
          onPick={pick}
          placement="above"
        />
      ) : null}
      <textarea
        ref={textareaRef}
        className={`block w-full ${className}${showShortcutHint ? " pb-6" : ""}`}
        rows={rows}
        placeholder="Write a comment… Use @ to mention"
        value={value}
        disabled={disabled}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={(event) => {
          onChange(event.target.value);
          syncMention(event.target);
        }}
        onClick={(event) => syncMention(event.currentTarget)}
        onKeyUp={(event) => syncMention(event.currentTarget)}
        onKeyDown={(event) => {
          if (
            mentionListKeyDown(event, {
              open: Boolean(mention),
              matches,
              activeIndex,
              setActiveIndex,
              onPick: pick,
              onClose: () => setMention(null),
            })
          ) {
            return;
          }
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      {showShortcutHint ? (
        <p className="pointer-events-none absolute bottom-1.5 left-3 text-caption text-text-tertiary">
          Ctrl+Enter to send
        </p>
      ) : null}
    </div>
  );
}
