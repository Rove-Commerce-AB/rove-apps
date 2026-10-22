"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, PageHeader, Panel } from "@/components/ui";
import { SupportCaseDrawer } from "@/components/SupportCaseDrawer";
import {
  createSupportCase,
  type SupportCaseListItem,
} from "@/lib/supportCases";

type Props = {
  customerId: string;
  customerName?: string;
  cases: SupportCaseListItem[];
  loadError?: string;
};

export function SupportCasesClient({
  customerId,
  customerName,
  cases,
  loadError,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const { issueId } = await createSupportCase(
          customerId,
          title,
          description
        );
        setTitle("");
        setDescription("");
        router.refresh();
        setOpenIssueId(issueId);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Failed to create case"
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cases"
        description={
          customerName
            ? `Support cases for ${customerName}.`
            : "Support cases for this customer."
        }
      />
      {(loadError || error) && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
        >
          {loadError || error}
        </p>
      )}
      <Panel className="p-4">
        <form className="space-y-3" onSubmit={submit}>
          <Input
            id="case-title"
            label="New case"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            placeholder="Short summary"
          />
          <label className="block text-sm font-medium text-text-primary">
            Description (optional)
            <textarea
              className="mt-1 w-full rounded-lg border border-form bg-bg-default px-3 py-2 text-sm"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={pending || !title.trim()}>
            {pending ? "Creating…" : "Create case"}
          </Button>
        </form>
      </Panel>
      <Panel>
        {cases.length === 0 ? (
          <p className="p-6 text-sm text-text-secondary">No cases yet.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {cases.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpenIssueId(item.id)}
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-signal"
                >
                  <span className="shrink-0 font-mono text-xs text-text-tertiary">
                    {item.key}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                    {item.title}
                  </span>
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

      <SupportCaseDrawer
        customerId={customerId}
        issueId={openIssueId}
        open={openIssueId != null}
        onOpenChange={(next) => {
          if (!next) setOpenIssueId(null);
        }}
        onCommented={() => router.refresh()}
      />
    </div>
  );
}
