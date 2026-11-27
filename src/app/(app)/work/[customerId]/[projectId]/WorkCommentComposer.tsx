"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { TranslateDraftButton } from "@/components/TranslateDraftButton";
import { TranslateText } from "@/components/TranslateText";
import { WorkDescriptionEditor } from "@/components/WorkDescriptionEditor";
import { WorkMarkdown } from "@/components/WorkMarkdown";
import {
  splitWorkInlineImages,
  workFileImageHref,
} from "@/lib/workInlineImages";
import {
  mentionPlainText,
  mentionsToDisplayMarkdown,
} from "@/lib/workMentions";
import type { WorkPerson } from "@/lib/workTypes";

function useSendShortcutHint(): string {
  const [hint, setHint] = useState("Ctrl+Enter to send");
  useEffect(() => {
    const mac =
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ||
      navigator.userAgent.includes("Mac");
    setHint(mac ? "⌘+Enter to send" : "Ctrl+Enter to send");
  }, []);
  return hint;
}

export function WorkInlineImageThumbs({
  items,
  onRemove,
}: {
  items: {
    key: string;
    src: string;
    /** Open/download target; defaults to `src` (use video URL when `src` is a poster). */
    href?: string;
    uploading?: boolean;
    title?: string;
  }[];
  onRemove?: (key: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item.key} className="group relative">
          <a
            href={item.href ?? item.src}
            target="_blank"
            rel="noreferrer"
            className={`block overflow-hidden rounded border border-border-subtle bg-bg-muted ${
              item.uploading ? "opacity-60" : ""
            }`}
            title={item.title ?? "Open image"}
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

export function WorkCommentBody({
  body,
  toolbarLeading,
}: {
  body: string;
  /** Left side of the action row (e.g. reactions); translate controls sit on the right. */
  toolbarLeading?: ReactNode;
}) {
  const { text, fileIds } = splitWorkInlineImages(body);
  const display = text.trim() ? mentionsToDisplayMarkdown(text) : "";
  const plain = mentionPlainText(text);
  const thumbs = (
    <WorkInlineImageThumbs
      items={fileIds.map((id) => ({
        key: id,
        src: workFileImageHref(id),
      }))}
    />
  );

  return (
    <div className="mt-1">
      {display ? (
        <TranslateText
          text={plain}
          render={({ controls, result }) => (
            <>
              <WorkMarkdown className="text-body-m text-text-primary">
                {display}
              </WorkMarkdown>
              {result}
              {thumbs}
              <div className="mt-1 flex h-8 items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  {toolbarLeading}
                </div>
                <div className="ml-auto shrink-0">{controls}</div>
              </div>
            </>
          )}
        />
      ) : (
        <>
          {thumbs}
          {toolbarLeading ? (
            <div className="mt-1 flex h-8 items-center gap-1">
              {toolbarLeading}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

const collapsedClass =
  "flex h-9 w-full items-center rounded-md border border-form bg-bg-default px-3 text-left text-sm text-text-muted hover:border-brand-signal/40 focus:border-brand-signal focus:outline-none focus:ring-1 focus:ring-inset focus:ring-brand-signal/25 disabled:opacity-50";

export function WorkCommentComposer({
  people,
  value,
  contentKey,
  disabled,
  compact = false,
  showShortcutHint = true,
  autoFocus = true,
  onChange,
  onFocus,
  onBlur,
  onPasteImages,
  onSubmit,
}: {
  people: WorkPerson[];
  value: string;
  /** Reset TipTap when this changes (issue id, comment id, …). */
  contentKey: string;
  disabled?: boolean;
  /** Collapsed single-line trigger; focus expands to the MD editor. */
  compact?: boolean;
  showShortcutHint?: boolean;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Pure image pastes (drawer owns video / mixed clipboard pastes). */
  onPasteImages?: (files: File[]) => void;
  onSubmit?: () => void;
}) {
  const sendHint = useSendShortcutHint();
  const rootRef = useRef<HTMLDivElement>(null);
  const ignoreBlurUntilRef = useRef(0);
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;

  useEffect(() => {
    // Expanding mounts TipTap with autoFocus; ignore transient blurs from that.
    ignoreBlurUntilRef.current = Date.now() + 400;
  }, [contentKey, compact]);

  if (compact) {
    const draftPreview = value.replace(/\s+/g, " ").trim();
    return (
      <button
        type="button"
        className={collapsedClass}
        disabled={disabled}
        onFocus={onFocus}
        onClick={onFocus}
      >
        <span className={draftPreview ? "truncate text-text-primary" : undefined}>
          {draftPreview || "Write a comment… Use @ to mention"}
        </span>
      </button>
    );
  }

  function handleFocusOut(event: React.FocusEvent<HTMLDivElement>) {
    if (Date.now() < ignoreBlurUntilRef.current) return;
    const next = event.relatedTarget as Node | null;
    // Keep open when focus moves to Send / other controls in the same form.
    const form = event.currentTarget.closest("form");
    if (next && (event.currentTarget.contains(next) || form?.contains(next))) {
      return;
    }
    // TipTap/toolbar can blur before the next focus lands; wait a tick.
    window.setTimeout(() => {
      const root = rootRef.current;
      if (!root) return;
      const active = document.activeElement;
      const ownerForm = root.closest("form");
      if (active && (root.contains(active) || ownerForm?.contains(active))) {
        return;
      }
      onBlurRef.current?.();
    }, 0);
  }

  return (
    <div
      ref={rootRef}
      className="relative w-full min-w-0"
      onFocusCapture={onFocus}
      onBlur={handleFocusOut}
    >
      <WorkDescriptionEditor
        contentKey={contentKey}
        value={value}
        people={people}
        disabled={disabled}
        variant="comment"
        autoFocus={autoFocus}
        placeholder="Write a comment… Use @ to mention"
        footerHint={showShortcutHint ? sendHint : null}
        footerEnd={
          <TranslateDraftButton
            text={value}
            disabled={disabled}
            onTranslated={onChange}
          />
        }
        onChange={onChange}
        onPasteImages={onPasteImages}
        onModEnter={onSubmit}
      />
    </div>
  );
}
