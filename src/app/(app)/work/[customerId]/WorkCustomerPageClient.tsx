"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { CustomerFavicon } from "@/components/CustomerFavicon";
import { SetWorkTrail } from "@/components/WorkTrailContext";
import { workProjectHref } from "@/lib/routes";
import { compareTextSv } from "@/lib/sort";
import type { WorkCustomerView, WorkSelectorBoard } from "@/lib/workTypes";
import { restoreWorkBoardAction } from "../actions";
import { WorkCreateProjectDialog } from "../WorkCreateProjectDialog";

export function WorkCustomerPageClient({
  customer,
  canCreateProject = true,
}: {
  customer: WorkCustomerView;
  canCreateProject?: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [boards, setBoards] = useState(customer.boards);
  const [archivedBoards, setArchivedBoards] = useState(customer.archivedBoards);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBoards(customer.boards);
    setArchivedBoards(customer.archivedBoards);
  }, [customer.boards, customer.archivedBoards]);

  async function restoreBoard(board: WorkSelectorBoard) {
    setError(null);
    setRestoringId(board.id);
    setArchivedBoards((current) =>
      current.filter((row) => row.id !== board.id)
    );
    setBoards((current) =>
      [...current, board].sort((a, b) => compareTextSv(a.title, b.title))
    );
    const result = await restoreWorkBoardAction(board.id);
    setRestoringId(null);
    if (!result.ok) {
      setBoards(customer.boards);
      setArchivedBoards(customer.archivedBoards);
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="w-full">
      <SetWorkTrail customerName={customer.name} />
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <CustomerFavicon
            name={customer.name}
            url={customer.url}
            color={customer.color}
          />
          <h1 className="text-heading-xl text-text-primary">{customer.name}</h1>
        </div>
        {canCreateProject ? (
          <Button type="button" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            New project
          </Button>
        ) : null}
      </header>

      {error ? (
        <p className="mb-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {boards.length > 0 ? (
        <ul className="grid grid-cols-1 items-start justify-items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {boards.map((board) => (
            <li key={board.id}>
              <Link
                href={workProjectHref(customer.id, board.id)}
                className="block h-full rounded-xl border border-border-subtle bg-bg-default p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-focus focus-visible:ring-offset-2"
              >
                <span className="block truncate text-heading-s text-text-primary">
                  {board.title}
                </span>
                <span className="mt-1 block text-label-s text-text-tertiary">
                  {board.prefix}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-secondary">No projects yet.</p>
      )}

      {archivedBoards.length > 0 ? (
        <section className={boards.length > 0 ? "mt-8" : undefined}>
          <button
            type="button"
            aria-expanded={archivedOpen}
            className="inline-flex items-center gap-1 text-label-s text-text-tertiary hover:text-text-secondary"
            onClick={() => setArchivedOpen((open) => !open)}
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${
                archivedOpen ? "rotate-90" : ""
              }`}
              aria-hidden
            />
            Archived projects ({archivedBoards.length})
          </button>
          {archivedOpen ? (
            <ul className="mt-2 max-w-md">
              {archivedBoards.map((board) => (
                <li
                  key={board.id}
                  className="flex items-center gap-3 py-1.5"
                >
                  <p className="min-w-0 flex-1 truncate text-body-s text-text-secondary">
                    {board.title}
                    <span className="ml-2 text-text-tertiary">
                      {board.prefix}
                    </span>
                  </p>
                  <button
                    type="button"
                    disabled={restoringId === board.id}
                    className="shrink-0 text-label-s text-text-tertiary hover:text-text-primary disabled:opacity-50"
                    onClick={() => void restoreBoard(board)}
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {canCreateProject ? (
        <WorkCreateProjectDialog
          customer={customer}
          open={creating}
          onOpenChange={setCreating}
        />
      ) : null}
    </div>
  );
}
