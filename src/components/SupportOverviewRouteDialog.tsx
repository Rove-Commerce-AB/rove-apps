"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Input } from "@/components/ui";
import type { SupportOverviewCaseItem } from "@/lib/supportOverviewCases";
import type { SupportRouteCustomerOption } from "@/lib/supportOverviewCases";
import {
  listBoardsForSupportRouting,
  routeInboxToCustomerBoard,
  routeInboxToSupportBoard,
} from "@/lib/supportMailRoute";

type BoardOption = {
  id: string;
  title: string;
  prefix: string;
  isSupportBoard: boolean;
};

type Props = {
  issue: SupportOverviewCaseItem | null;
  customers: SupportRouteCustomerOption[];
  onClose: () => void;
};

type Step = "customer" | "destination";

export function SupportOverviewRouteDialog({
  issue,
  customers,
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("customer");
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingBoards, setLoadingBoards] = useState(false);

  useEffect(() => {
    if (!issue) return;
    setStep("customer");
    setSearch("");
    setCustomerId(null);
    setBoards([]);
    setBoardId(null);
    setError(null);
  }, [issue]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q));
  }, [customers, search]);

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;
  const supportBoardAvailable =
    selectedCustomer != null &&
    selectedCustomer.hasActiveContract &&
    selectedCustomer.hasSupportBoard;

  function pickCustomer(id: string) {
    setCustomerId(id);
    setBoardId(null);
    setError(null);
    setStep("destination");
    setLoadingBoards(true);
    startTransition(async () => {
      try {
        const list = await listBoardsForSupportRouting(id);
        setBoards(list);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Failed to load boards"
        );
      } finally {
        setLoadingBoards(false);
      }
    });
  }

  function submitSupportBoard() {
    if (!issue || !customerId || !supportBoardAvailable) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await routeInboxToSupportBoard({
          issueId: issue.id,
          customerId,
        });
        onClose();
        router.refresh();
        router.push(result.href);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to route");
      }
    });
  }

  function submitOtherBoard() {
    if (!issue || !customerId || !boardId) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await routeInboxToCustomerBoard({
          issueId: issue.id,
          customerId,
          boardId,
        });
        onClose();
        router.refresh();
        router.push(result.href);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to route");
      }
    });
  }

  if (!issue) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title={`Route ${issue.key}`}
      subtitle={issue.title}
    >
      <div className="space-y-4">
        {error && (
          <p
            role="alert"
            className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}

        {step === "customer" && (
          <>
            <Input
              id="route-customer-search"
              label="Customer"
              placeholder="Search customer"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              autoFocus
            />
            <ul className="max-h-64 overflow-y-auto divide-y divide-border-subtle rounded-lg border border-border-subtle">
              {filteredCustomers.length === 0 ? (
                <li className="p-3 text-sm text-text-secondary">
                  No customers match.
                </li>
              ) : (
                filteredCustomers.map((customer) => (
                  <li key={customer.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-bg-muted/60"
                      onClick={() => pickCustomer(customer.id)}
                      disabled={pending}
                    >
                      <span className="truncate font-medium text-text-primary">
                        {customer.name}
                      </span>
                      <span className="shrink-0 text-xs text-text-tertiary">
                        {customer.hasActiveContract
                          ? "Support"
                          : "No contract"}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </>
        )}

        {step === "destination" && selectedCustomer && (
          <>
            <p className="text-sm text-text-secondary">
              Customer:{" "}
              <strong className="text-text-primary">
                {selectedCustomer.name}
              </strong>
            </p>

            <div className="space-y-2">
              <button
                type="button"
                disabled={pending || !supportBoardAvailable}
                onClick={submitSupportBoard}
                aria-disabled={!supportBoardAvailable}
                className={`w-full rounded-lg border px-3 py-3 text-left ${
                  supportBoardAvailable
                    ? "border-border-subtle bg-bg-default hover:bg-bg-muted/60"
                    : "cursor-not-allowed border-border-subtle/60 bg-bg-muted/40 opacity-60"
                } disabled:opacity-60`}
              >
                <span
                  className={`block text-sm font-semibold ${
                    supportBoardAvailable
                      ? "text-text-primary"
                      : "text-text-tertiary"
                  }`}
                >
                  Support board — mark as read
                </span>
                <span className="mt-0.5 block text-xs text-text-secondary">
                  {supportBoardAvailable
                    ? "Move to the customer Support board and set status to Investigating."
                    : "Unavailable — activate support for this customer in master data first."}
                </span>
              </button>

              <div className="rounded-lg border border-border-subtle px-3 py-3">
                <p className="text-sm font-semibold text-text-primary">
                  Another board on this customer
                </p>
                <p className="mt-0.5 text-xs text-text-secondary">
                  E.g. retainer or delivery board.
                </p>
                {loadingBoards ? (
                  <p className="mt-2 text-sm text-text-tertiary">Loading…</p>
                ) : boards.filter((b) => !b.isSupportBoard).length === 0 ? (
                  <p className="mt-2 text-sm text-text-tertiary">
                    No other boards for this customer.
                  </p>
                ) : (
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                    {boards
                      .filter((b) => !b.isSupportBoard)
                      .map((board) => (
                        <li key={board.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-bg-muted/60">
                            <input
                              type="radio"
                              name="route-board"
                              checked={boardId === board.id}
                              onChange={() => setBoardId(board.id)}
                              disabled={pending}
                            />
                            <span className="min-w-0 truncate">
                              <span className="font-mono text-xs text-text-tertiary">
                                {board.prefix}
                              </span>{" "}
                              {board.title}
                            </span>
                          </label>
                        </li>
                      ))}
                  </ul>
                )}
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    disabled={pending || !boardId}
                    onClick={submitOtherBoard}
                  >
                    {pending ? "Moving…" : "Move to board"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setStep("customer");
                  setCustomerId(null);
                }}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
