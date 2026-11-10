"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, PageHeader, Panel, Select } from "@/components/ui";
import { SupportCaseDrawer } from "@/components/SupportCaseDrawer";
import {
  createSupportCase,
  type SupportCaseListItem,
} from "@/lib/supportCases";

type CustomerOption = { id: string; name: string };

type Props = {
  /** Selected filter customer, or null for All. */
  customerId: string | null;
  customerName?: string;
  /** Customers eligible for creating incidents (active contract). */
  customers?: CustomerOption[];
  cases: SupportCaseListItem[];
  loadError?: string;
  noContractSelected?: boolean;
  toolbar?: ReactNode;
  isCustomerUser?: boolean;
  /** Deep-link from ?case= */
  initialCaseId?: string | null;
  truncated?: boolean;
  totalCount?: number;
};

export function SupportCasesClient({
  customerId,
  customerName,
  customers = [],
  cases,
  loadError,
  noContractSelected = false,
  toolbar,
  isCustomerUser = false,
  initialCaseId = null,
  truncated = false,
  totalCount,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [statusFilter, setStatusFilter] = useState<"open" | "done" | "all">(
    "open"
  );
  const [createCustomerId, setCreateCustomerId] = useState(
    customerId ?? customers[0]?.id ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openIssueId, setOpenIssueId] = useState<string | null>(initialCaseId);
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null);

  useEffect(() => {
    if (!initialCaseId) return;
    const match = cases.find((item) => item.id === initialCaseId);
    if (match) {
      setOpenIssueId(match.id);
      setOpenCustomerId(match.customerId);
    }
  }, [initialCaseId, cases]);

  const visibleCases = useMemo(() => {
    const filtered =
      statusFilter === "all"
        ? cases
        : statusFilter === "done"
          ? cases.filter((item) => item.isDone)
          : cases.filter((item) => !item.isDone);
    if (isCustomerUser) return filtered;
    return [...filtered].sort((a, b) => {
      if (a.awaitingStaff === b.awaitingStaff) return 0;
      return a.awaitingStaff ? -1 : 1;
    });
  }, [cases, statusFilter, isCustomerUser]);

  const effectiveCreateCustomerId = customerId ?? createCustomerId;
  const canCreate =
    !noContractSelected &&
    Boolean(effectiveCreateCustomerId) &&
    (customerId != null || customers.length > 0);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!effectiveCreateCustomerId) return;
    setError(null);
    startTransition(async () => {
      try {
        const { issueId } = await createSupportCase(
          effectiveCreateCustomerId,
          title,
          description
        );
        setTitle("");
        setDescription("");
        router.refresh();
        setOpenCustomerId(effectiveCreateCustomerId);
        setOpenIssueId(issueId);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Failed to create incident"
        );
      }
    });
  }

  const descriptionText = noContractSelected
    ? isCustomerUser
      ? "Support cases are not available for this account yet. Contact Rove if you need help."
      : customerName
        ? `${customerName} has no active support contract, so cases are unavailable.`
        : "This customer has no active support contract, so cases are unavailable."
    : customerName
      ? `Support cases for ${customerName}.`
      : "Support cases across customers.";

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader title="Incidents" description={descriptionText} />
      {toolbar ? (
        <div className="flex flex-wrap items-center justify-end gap-4">
          {toolbar}
        </div>
      ) : null}
      {(loadError || error) && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
        >
          {loadError || error}
        </p>
      )}
      {noContractSelected ? (
        <Panel className="p-6">
          <p className="text-sm text-text-secondary">
            {isCustomerUser
              ? "Support cases are not enabled for this customer yet. Please contact Rove."
              : "Activate a support contract under Settings → Customers → Support to enable cases for this customer. Monitors can still be managed without a contract."}
          </p>
        </Panel>
      ) : (
        <>
          <Panel className="p-4">
            <form className="space-y-3" onSubmit={submit}>
              {customerId == null && customers.length > 0 ? (
                <Select
                  id="case-customer"
                  label="Customer"
                  value={createCustomerId}
                  onValueChange={setCreateCustomerId}
                  options={customers.map((c) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                />
              ) : null}
              <Input
                id="case-title"
                label="New case"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                placeholder="Short summary"
                disabled={!canCreate}
              />
              <label className="block text-sm font-medium text-text-primary">
                Description (optional)
                <textarea
                  className="mt-1 w-full rounded-lg border border-form bg-bg-default px-3 py-2 text-sm disabled:opacity-50"
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={!canCreate}
                />
              </label>
              <Button
                type="submit"
                disabled={pending || !canCreate || !title.trim()}
              >
                {pending ? "Creating…" : "Create case"}
              </Button>
            </form>
          </Panel>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              variant="filter"
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as "open" | "done" | "all")
              }
              options={[
                { value: "open", label: "Open" },
                { value: "done", label: "Done" },
                { value: "all", label: "All" },
              ]}
              className="w-auto min-w-0"
              triggerClassName="min-w-[120px]"
            />
            {truncated && totalCount != null ? (
              <p className="text-xs text-text-tertiary">
                Showing latest {cases.length} of {totalCount} cases.
              </p>
            ) : null}
          </div>
          <Panel>
            {visibleCases.length === 0 ? (
              <p className="p-6 text-sm text-text-secondary">
                No cases yet.
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {visibleCases.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenCustomerId(item.customerId);
                        setOpenIssueId(item.id);
                      }}
                      className={`flex w-full items-center gap-3 p-4 text-left hover:bg-bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-signal ${
                        !isCustomerUser && item.awaitingStaff
                          ? "bg-accent-primary-subtle/25"
                          : ""
                      }`}
                    >
                      <span className="shrink-0 font-mono text-xs text-text-tertiary">
                        {item.key}
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          !isCustomerUser && item.awaitingStaff
                            ? "font-medium text-text-primary"
                            : "text-text-primary"
                        }`}
                      >
                        {item.title}
                      </span>
                      {!isCustomerUser && item.awaitingStaff ? (
                        <span className="shrink-0 rounded bg-accent-primary-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-primary-text">
                          Customer reply
                        </span>
                      ) : null}
                      {customerId == null ? (
                        <span className="hidden shrink-0 text-xs text-text-tertiary sm:inline">
                          {item.customerName}
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          item.isDone
                            ? "bg-status-success-subtle text-status-success"
                            : "bg-bg-muted text-text-secondary"
                        }`}
                      >
                        {item.statusName}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}

      {openCustomerId ? (
        <SupportCaseDrawer
          customerId={openCustomerId}
          issueId={openIssueId}
          open={openIssueId != null}
          onOpenChange={(next) => {
            if (!next) {
              setOpenIssueId(null);
              setOpenCustomerId(null);
            }
          }}
          onCommented={() => router.refresh()}
          onDeleted={() => router.refresh()}
          allowInternalComments={!isCustomerUser}
        />
      ) : null}
    </div>
  );
}
