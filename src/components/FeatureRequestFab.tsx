"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { MessageCirclePlus, X } from "lucide-react";
import { createFeatureRequest } from "@/lib/featureRequests";
import { WORK_FILE_MAX_BYTES, type WorkIssueType } from "@/lib/workTypes";
import { WorkIssueTypePicker } from "@/app/(app)/work/[customerId]/[projectId]/WorkIssueTypeIcon";
import { WorkInlineImageThumbs } from "@/app/(app)/work/[customerId]/[projectId]/WorkCommentComposer";

type PendingShot = {
  localId: string;
  file: File;
  previewUrl: string;
};

const MAX_SCREENSHOTS = 8;

function pasteFileName(file: File, index: number) {
  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/jpeg"
        ? "jpg"
        : file.type === "image/gif"
          ? "gif"
          : file.type === "image/webp"
            ? "webp"
            : file.name.includes(".")
              ? file.name.split(".").pop()!
              : "png";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return file.name && !file.name.startsWith("image")
    ? file.name
    : `paste-${stamp}${index > 0 ? `-${index + 1}` : ""}.${ext}`;
}

export function FeatureRequestFab() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [issueType, setIssueType] = useState<WorkIssueType>("issue");
  const [shots, setShots] = useState<PendingShot[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  const router = useRouter();

  useEffect(() => {
    return () => {
      for (const shot of shotsRef.current) {
        URL.revokeObjectURL(shot.previewUrl);
      }
    };
  }, []);

  function clearShots() {
    for (const shot of shotsRef.current) {
      URL.revokeObjectURL(shot.previewUrl);
    }
    setShots([]);
  }

  function close() {
    setOpen(false);
    setError(null);
  }

  function resetForm() {
    setMessage("");
    setIssueType("issue");
    clearShots();
    setError(null);
  }

  function addImages(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    setShots((prev) => {
      const room = MAX_SCREENSHOTS - prev.length;
      if (room <= 0) {
        setError(`You can attach at most ${MAX_SCREENSHOTS} screenshots`);
        return prev;
      }
      const next = [...prev];
      for (const file of files.slice(0, room)) {
        if (!file.type.toLowerCase().startsWith("image/")) continue;
        if (file.size > WORK_FILE_MAX_BYTES) {
          setError("Each screenshot must be 8 MB or smaller");
          continue;
        }
        const named = new File([file], pasteFileName(file, next.length), {
          type: file.type || "image/png",
        });
        next.push({
          localId: crypto.randomUUID(),
          file: named,
          previewUrl: URL.createObjectURL(named),
        });
      }
      if (files.length > room) {
        setError(`You can attach at most ${MAX_SCREENSHOTS} screenshots`);
      }
      return next;
    });
  }

  function handlePaste(event: ClipboardEvent) {
    const items = event.clipboardData?.items;
    if (!items?.length) return;
    const images: File[] = [];
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      const blob = item.getAsFile();
      if (blob) images.push(blob);
    }
    if (images.length === 0) return;
    event.preventDefault();
    addImages(images);
  }

  function removeShot(localId: string) {
    setShots((prev) => {
      const row = prev.find((shot) => shot.localId === localId);
      if (row) URL.revokeObjectURL(row.previewUrl);
      return prev.filter((shot) => shot.localId !== localId);
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    setError(null);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("content", trimmed);
      formData.set("issueType", issueType === "bug" ? "bug" : "issue");
      for (const shot of shots) {
        formData.append("screenshots", shot.file);
      }
      await createFeatureRequest(formData);
      resetForm();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  const heading = issueType === "bug" ? "Bug report" : "Feature request";
  const placeholder =
    issueType === "bug"
      ? "What went wrong? Steps to reproduce help…"
      : "Describe your idea or improvement…";

  return (
    <div className="fixed bottom-6 right-6 z-40">
      {open ? (
        <div
          className="w-80 rounded-lg border border-form bg-bg-default p-4 shadow-lg"
          style={{ borderColor: "var(--panel-border)" }}
          onPaste={handlePaste}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-medium text-text-primary">
              {heading}
            </span>
            <button
              type="button"
              onClick={close}
              className="shrink-0 rounded p-1 text-text-primary opacity-60 hover:bg-bg-muted hover:opacity-100"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-text-secondary">
                Type
              </span>
              <WorkIssueTypePicker
                value={issueType}
                onChange={setIssueType}
                disabled={submitting}
                name="Request type"
                size="sm"
              />
            </div>
            <div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={placeholder}
                rows={3}
                disabled={submitting}
                className="w-full rounded-lg border border-form bg-bg-default px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-brand-signal focus:outline-none focus:ring-2 focus:ring-brand-signal"
              />
              <WorkInlineImageThumbs
                items={shots.map((shot) => ({
                  key: shot.localId,
                  src: shot.previewUrl,
                }))}
                onRemove={submitting ? undefined : removeShot}
              />
              <p className="mt-1.5 text-[11px] text-text-secondary">
                Paste screenshots from the clipboard (max {MAX_SCREENSHOTS}).
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={submitting}
                className="rounded-lg border bg-bg-default px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-bg-muted disabled:opacity-50"
                style={{ borderColor: "var(--color-border-form)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !message.trim()}
                className="rounded-lg bg-brand-signal px-3 py-1.5 text-sm font-medium text-text-inverse transition-colors hover:bg-accent-primary-hover active:bg-accent-primary-active disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-signal text-text-inverse shadow-lg transition-colors hover:bg-accent-primary-hover active:bg-accent-primary-active"
          aria-label="Send feature request or bug report"
          title="Feature request"
        >
          <MessageCirclePlus className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
