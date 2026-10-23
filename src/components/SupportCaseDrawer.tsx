"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, PageLoading, SideDrawer } from "@/components/ui";
import {
  addSupportCaseComment,
  getSupportCaseDetail,
  type SupportCaseDetail,
} from "@/lib/supportCases";

type Props = {
  customerId: string;
  issueId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommented?: () => void;
};

export function SupportCaseDrawer({
  customerId,
  issueId,
  open,
  onOpenChange,
  onCommented,
}: Props) {
  const [detail, setDetail] = useState<SupportCaseDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !issueId) {
      setDetail(null);
      setLoadError(null);
      setComment("");
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getSupportCaseDetail(customerId, issueId)
      .then((next) => {
        if (!cancelled) setDetail(next);
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

  function submitComment(event: React.FormEvent) {
    event.preventDefault();
    if (!issueId || !comment.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        await addSupportCaseComment(customerId, issueId, comment);
        setComment("");
        const refreshed = await getSupportCaseDetail(customerId, issueId);
        setDetail(refreshed);
        onCommented?.();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Failed to post comment"
        );
      }
    });
  }

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
              {detail.description.trim() ? (
                <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-text-secondary">
                  {detail.description}
                </pre>
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
                    <li
                      key={item.id}
                      className="rounded-lg border border-border-subtle bg-bg-muted/40 px-3 py-2.5"
                    >
                      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-xs font-medium text-text-primary">
                          {item.authorName}
                        </span>
                        <span className="text-xs text-text-tertiary">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-sm text-text-secondary">
                        {item.body}
                      </pre>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <form
            className="shrink-0 space-y-2 border-t border-border-subtle px-6 py-4"
            onSubmit={submitComment}
          >
            <label className="block text-sm font-medium text-text-primary">
              Add comment
              <textarea
                className="mt-1 w-full rounded-lg border border-form bg-bg-default px-3 py-2 text-sm"
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Write a message…"
              />
            </label>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={pending || !comment.trim()}
              >
                {pending ? "Sending…" : "Send comment"}
              </Button>
            </div>
          </form>
        </>
      ) : null}
    </SideDrawer>
  );
}
