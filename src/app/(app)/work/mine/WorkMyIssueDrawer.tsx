"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal, PageLoading, SideDrawer } from "@/components/ui";
import { WorkIssueDrawer } from "@/app/(app)/work/[customerId]/[projectId]/WorkIssueDrawer";
import { moveWorkIssueAction } from "@/app/(app)/work/actions";
import { loadMyWorkIssue } from "@/lib/workMyIssueDrawer";
import type { WorkBoardView, WorkIssue } from "@/lib/workTypes";
import type { WorkIssueStatus } from "@/lib/workStatuses";

type Selection = {
  boardId: string;
  issueId: string;
};

type Props = {
  selection: Selection | null;
  onOpenChange: (open: boolean) => void;
};

export function WorkMyIssueDrawer({ selection, onOpenChange }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<WorkBoardView | null>(null);
  const [issue, setIssue] = useState<WorkIssue | null>(null);
  const [leaveDoneStatus, setLeaveDoneStatus] =
    useState<WorkIssueStatus | null>(null);

  const reload = useCallback(async (boardId: string, issueId: string) => {
    const payload = await loadMyWorkIssue(boardId, issueId);
    setBoard(payload.board);
    setIssue(payload.issue);
  }, []);

  useEffect(() => {
    if (!selection) {
      setBoard(null);
      setIssue(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    reload(selection.boardId, selection.issueId)
      .catch((cause) => {
        if (!cancelled) {
          setBoard(null);
          setIssue(null);
          setError(
            cause instanceof Error ? cause.message : "Failed to load issue"
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection, reload]);

  function applyStatus(status: WorkIssueStatus) {
    if (!board || !issue) return;
    const sameStatus = board.issues
      .filter((row) => row.status === status)
      .map((row) => row.id);
    const issueIds = sameStatus.includes(issue.id)
      ? sameStatus
      : [...sameStatus, issue.id];
    startTransition(async () => {
      const result = await moveWorkIssueAction({
        boardId: board.id,
        issueId: issue.id,
        status,
        issueIds,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      try {
        await reload(board.id, issue.id);
        router.refresh();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Failed to refresh issue"
        );
      }
    });
  }

  function handleStatus(status: WorkIssueStatus) {
    if (!board || !issue) return;
    if (status === issue.status) return;
    const fromDone =
      board.statuses.find((column) => column.id === issue.status)?.isDone ??
      false;
    const toDone =
      board.statuses.find((column) => column.id === status)?.isDone ?? false;
    if (
      board.estimateUnit === "tshirt" &&
      board.fixedPriceEnabled &&
      fromDone &&
      !toDone
    ) {
      setLeaveDoneStatus(status);
      return;
    }
    applyStatus(status);
  }

  const open = selection != null;

  return (
    <>
    <SideDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={issue?.key ?? "Issue"}
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
    >
      {loading ? (
        <div className="p-6">
          <PageLoading />
        </div>
      ) : error && !issue ? (
        <p role="alert" className="p-6 text-sm text-danger">
          {error}
        </p>
      ) : board && issue ? (
        <WorkIssueDrawer
          key={issue.id}
          board={board}
          issue={issue}
          onStatus={handleStatus}
          onChanged={() => {
            setError(null);
            startTransition(async () => {
              try {
                await reload(board.id, issue.id);
                router.refresh();
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Failed to refresh issue"
                );
              }
            });
          }}
          onError={(message) => setError(message)}
          onIssuePatch={(patch) => {
            setIssue((current) =>
              current ? { ...current, ...patch } : current
            );
            if (patch.component) {
              setBoard((current) => {
                if (!current) return current;
                if (
                  current.components.some(
                    (row) => row.id === patch.component!.id
                  )
                ) {
                  return current;
                }
                return {
                  ...current,
                  components: [...current.components, patch.component!].sort(
                    (a, b) => a.name.localeCompare(b.name)
                  ),
                };
              });
            }
          }}
          onDeleted={() => {
            onOpenChange(false);
            router.refresh();
          }}
        />
      ) : null}
      {error && issue ? (
        <p
          role="alert"
          className="shrink-0 border-t border-danger/20 bg-danger/5 px-4 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
    </SideDrawer>
    <ConfirmModal
      isOpen={leaveDoneStatus != null}
      title="Remove from Done?"
      message="This reverses the fixed-price delivery for Looker. Moving the issue back to Done later will count it again at the current size price."
      confirmLabel="Remove from Done"
      variant="danger"
      onClose={() => setLeaveDoneStatus(null)}
      onConfirm={() => {
        if (leaveDoneStatus == null) return;
        const status = leaveDoneStatus;
        setLeaveDoneStatus(null);
        applyStatus(status);
      }}
    />
    </>
  );
}
