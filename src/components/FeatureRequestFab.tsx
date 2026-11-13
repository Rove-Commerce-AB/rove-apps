"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Check, MessageCirclePlus, X } from "lucide-react";
import { createFeatureRequest } from "@/lib/featureRequests";
import {
  collectClipboardMediaFiles,
  extractVideoPosterJpeg,
  isVideoFile,
  videoPosterFileName,
  withGuessedMediaType,
} from "@/lib/workMedia";
import { WORK_FILE_MAX_BYTES, type WorkIssueType } from "@/lib/workTypes";
import { WorkIssueTypePicker } from "@/app/(app)/work/[customerId]/[projectId]/WorkIssueTypeIcon";
import { WorkInlineImageThumbs } from "@/app/(app)/work/[customerId]/[projectId]/WorkCommentComposer";

type PendingShot = {
  localId: string;
  file: File;
  /** Optional JPEG poster uploaded with videos for Work Files thumbnails. */
  posterFile?: File;
  previewUrl: string;
};

const MAX_SCREENSHOTS = 8;
const SENT_HOLD_MS = 1500;
const CLOSED_SIZE = 48;
const SENT_WIDTH = 112;
const OPEN_WIDTH = 320;

type ComposerPhase = "closed" | "open" | "sent";

export function FeatureRequestFab() {
  const [phase, setPhase] = useState<ComposerPhase>("closed");
  const [message, setMessage] = useState("");
  const [issueType, setIssueType] = useState<WorkIssueType>("issue");
  const [shots, setShots] = useState<PendingShot[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formHeight, setFormHeight] = useState(CLOSED_SIZE);
  /** Panel corners while expanding/open; circle only when fully closed/sent. */
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  const sentTimerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const open = phase === "open";
  const panelCorners = open;

  useEffect(() => {
    return () => {
      if (sentTimerRef.current != null) window.clearTimeout(sentTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    const el = formRef.current;
    if (!el) return;
    const apply = () => setFormHeight(el.offsetHeight);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (phase === "open") textareaRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (phase !== "open") return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target || rootRef.current?.contains(target)) return;
      if (submitting) return;
      setPhase("closed");
      setError(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || submitting) return;
      setPhase("closed");
      setError(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [phase, submitting]);

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
    if (submitting) return;
    setPhase("closed");
    setError(null);
  }

  function openComposer() {
    if (sentTimerRef.current != null) {
      window.clearTimeout(sentTimerRef.current);
      sentTimerRef.current = null;
    }
    setPhase("open");
  }

  function showSentConfirmation() {
    setPhase("sent");
    if (sentTimerRef.current != null) window.clearTimeout(sentTimerRef.current);
    sentTimerRef.current = window.setTimeout(() => {
      sentTimerRef.current = null;
      setPhase((current) => (current === "sent" ? "closed" : current));
    }, SENT_HOLD_MS);
  }

  function resetForm() {
    setMessage("");
    setIssueType("issue");
    clearShots();
    setError(null);
  }

  async function addMedia(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    const room = MAX_SCREENSHOTS - shotsRef.current.length;
    if (room <= 0) {
      setError(`You can attach at most ${MAX_SCREENSHOTS} files`);
      return;
    }
    if (files.length > room) {
      setError(`You can attach at most ${MAX_SCREENSHOTS} files`);
    }
    const nextRows: PendingShot[] = [];
    for (const file of files.slice(0, room)) {
      const named = withGuessedMediaType(
        file,
        shotsRef.current.length + nextRows.length
      );
      if (file.size > WORK_FILE_MAX_BYTES) {
        setError("Each attachment must be 8 MB or smaller");
        continue;
      }
      let previewUrl = URL.createObjectURL(named);
      let posterFile: File | undefined;
      if (isVideoFile(named)) {
        const posterBlob = await extractVideoPosterJpeg(named);
        if (posterBlob) {
          URL.revokeObjectURL(previewUrl);
          previewUrl = URL.createObjectURL(posterBlob);
          posterFile = new File(
            [posterBlob],
            videoPosterFileName(named.name),
            { type: "image/jpeg" }
          );
        }
      }
      nextRows.push({
        localId: crypto.randomUUID(),
        file: named,
        posterFile,
        previewUrl,
      });
    }
    if (nextRows.length > 0) {
      setShots((prev) => [...prev, ...nextRows]);
    }
  }

  function handlePaste(event: ClipboardEvent) {
    const media = collectClipboardMediaFiles(event.clipboardData);
    if (media.length === 0) return;
    event.preventDefault();
    void addMedia(media);
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
        if (shot.posterFile && shot.posterFile.size <= WORK_FILE_MAX_BYTES) {
          formData.append("posters", shot.posterFile);
        }
      }
      await createFeatureRequest(formData);
      resetForm();
      showSentConfirmation();
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

  const shellWidth = open ? OPEN_WIDTH : phase === "sent" ? SENT_WIDTH : CLOSED_SIZE;
  const shellHeight = open ? Math.max(formHeight + 2, CLOSED_SIZE) : CLOSED_SIZE;

  return (
    <div
      ref={rootRef}
      className="fixed bottom-6 right-6 z-40 flex flex-col items-end justify-end"
    >
      <div
        data-phase={phase}
        className={`feature-request-organism relative border shadow-lg ${
          panelCorners ? "is-panel" : ""
        } ${
          open
            ? "border-form bg-bg-default text-text-primary"
            : phase === "sent"
              ? "border-transparent bg-brand-signal text-text-inverse"
              : "border-transparent bg-brand-signal text-text-inverse hover:bg-accent-primary-hover"
        }`}
        style={{
          width: shellWidth,
          height: shellHeight,
        }}
      >
        <div
          className={`feature-request-organism-layer absolute inset-0 flex items-center justify-center ${
            phase === "closed" ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <button
            type="button"
            onClick={openComposer}
            className="flex h-full w-full items-center justify-center"
            aria-label="Send feature request or bug report"
            title="Feature request"
          >
            <MessageCirclePlus className="h-5 w-5" />
          </button>
        </div>

        <div
          className={`feature-request-organism-layer absolute inset-0 flex items-center justify-center gap-2 ${
            phase === "sent" ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <Check className="h-4 w-4" aria-hidden />
          <span className="text-sm font-medium">Sent</span>
        </div>

        <div
          ref={formRef}
          inert={open ? undefined : true}
          onPaste={handlePaste}
          className={`feature-request-organism-layer feature-request-organism-layer--form w-80 p-4 ${
            open
              ? "relative is-visible"
              : "pointer-events-none absolute bottom-0 right-0"
          }`}
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
                ref={textareaRef}
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
                Paste screenshots or video clips (max {MAX_SCREENSHOTS}, 8 MB
                each).
              </p>
            </div>
            <div className="flex justify-end">
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
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {phase === "sent" ? "Request sent" : ""}
      </p>
    </div>
  );
}
