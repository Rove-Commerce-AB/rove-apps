"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { WorkIssueType } from "@/lib/workTypes";
import { WorkIssueTypePicker } from "./WorkIssueTypeIcon";

function NewIssueTitleField({
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onSubmit();
        }
      }}
      placeholder="Title"
      aria-label="New issue title"
      autoFocus
      className="box-border min-h-9 min-w-0 flex-1 resize-none overflow-hidden rounded-lg border border-form bg-bg-default px-3 py-1.5 text-sm leading-6 text-text-primary placeholder-text-muted focus:border-brand-signal focus:outline-none focus:ring-1 focus:ring-inset focus:ring-brand-signal"
    />
  );
}

export function WorkAddIssueInline({
  disabled = false,
  className = "",
  buttonClassName = "",
  iconOnly = false,
  open: openControlled,
  onOpenChange,
  onCreate,
}: {
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  /** Show only a + icon trigger (for column / Issue headers). */
  iconOnly?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreate: (input: {
    title: string;
    issueType: WorkIssueType;
  }) => Promise<boolean> | boolean;
}) {
  const [openInternal, setOpenInternal] = useState(false);
  const open = openControlled ?? openInternal;
  const [title, setTitle] = useState("");
  const [issueType, setIssueType] = useState<WorkIssueType>("issue");
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLFormElement>(null);

  function setOpen(next: boolean) {
    onOpenChange?.(next);
    if (openControlled === undefined) setOpenInternal(next);
  }

  function cancel() {
    if (saving) return;
    setOpen(false);
    setTitle("");
    setIssueType("issue");
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      cancel();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, saving]);

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed || saving || disabled) return;
    setSaving(true);
    const ok = await onCreate({ title: trimmed, issueType });
    setSaving(false);
    if (!ok) return;
    setTitle("");
    setIssueType("issue");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        aria-label="Add issue"
        title="Add issue"
        className={
          buttonClassName ||
          (iconOnly
            ? "inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-muted hover:text-text-primary disabled:opacity-50"
            : "flex items-center gap-1 rounded-md px-2 py-1.5 text-left text-body-m text-text-secondary hover:bg-bg-muted hover:text-text-primary disabled:opacity-50")
        }
        onClick={() => {
          setOpen(true);
          setTitle("");
          setIssueType("issue");
        }}
      >
        <Plus className="h-4 w-4" aria-hidden />
        {iconOnly ? null : "Add issue"}
      </button>
    );
  }

  return (
    <form
      ref={rootRef}
      className={`space-y-2 ${className}`.trim()}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-center gap-2">
        <WorkIssueTypePicker
          name="New issue type"
          value={issueType}
          onChange={setIssueType}
          size="field"
          disabled={saving || disabled}
        />
        <NewIssueTitleField
          value={title}
          onChange={setTitle}
          onCancel={cancel}
          onSubmit={() => {
            void submit();
          }}
        />
      </div>
    </form>
  );
}
