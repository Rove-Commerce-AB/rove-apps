"use client";

import { useMemo, useState } from "react";
import { Mail, Route } from "lucide-react";
import { Panel } from "@/components/ui";
import { SupportOverviewIssueDrawer } from "@/components/SupportOverviewIssueDrawer";
import { SupportOverviewRouteDialog } from "@/components/SupportOverviewRouteDialog";
import type {
  SupportOverviewCaseItem,
  SupportRouteCustomerOption,
} from "@/lib/supportOverviewCases";

type Props = {
  inbox: SupportOverviewCaseItem[];
  newCases: SupportOverviewCaseItem[];
  routeCustomers: SupportRouteCustomerOption[];
};

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function CaseCard({
  item,
  onOpen,
  onRoute,
}: {
  item: SupportOverviewCaseItem;
  onOpen: () => void;
  onRoute?: () => void;
}) {
  return (
    <li className="relative">
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-lg border border-border-subtle bg-bg-default px-3 py-2.5 text-left transition-colors hover:bg-bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pr-8">
          <span className="font-mono text-xs text-text-tertiary">{item.key}</span>
          {item.fromMail ? (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary"
              title={item.fromEmail ?? "From mail"}
            >
              <Mail className="h-3 w-3" aria-hidden />
              Mail
            </span>
          ) : null}
          <span className="truncate text-xs text-text-tertiary">
            {item.customerName}
          </span>
        </div>
        <p className="mt-1 truncate text-sm font-medium text-text-primary">
          {item.title}
        </p>
        <p className="mt-0.5 text-xs text-text-tertiary">
          {formatWhen(item.createdAt)}
        </p>
      </button>
      {onRoute ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRoute();
          }}
          className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal"
          title="Route to customer"
          aria-label={`Route ${item.key}`}
        >
          <Route className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </li>
  );
}

export function SupportOverviewCaseQueues({
  inbox,
  newCases,
  routeCustomers,
}: Props) {
  const [routing, setRouting] = useState<SupportOverviewCaseItem | null>(null);
  const [drawer, setDrawer] = useState<{
    boardId: string;
    issueId: string;
  } | null>(null);

  const newOnly = useMemo(() => {
    const inboxIds = new Set(inbox.map((i) => i.id));
    return newCases.filter((item) => !inboxIds.has(item.id));
  }, [inbox, newCases]);

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel>
          <div className="flex items-center justify-between border-b border-border-subtle bg-bg-muted/50 px-3 py-2">
            <h2 className="text-sm font-semibold text-text-primary">
              Needs routing
            </h2>
            <span className="text-xs text-text-secondary">
              {inbox.length} open
            </span>
          </div>
          {inbox.length === 0 ? (
            <p className="px-3 py-5 text-sm text-text-secondary">
              Inbox is empty.
            </p>
          ) : (
            <ul className="grid gap-2 p-2 sm:grid-cols-2">
              {inbox.map((item) => (
                <CaseCard
                  key={item.id}
                  item={item}
                  onOpen={() =>
                    setDrawer({ boardId: item.boardId, issueId: item.id })
                  }
                  onRoute={() => setRouting(item)}
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <div className="flex items-center justify-between border-b border-border-subtle bg-bg-muted/50 px-3 py-2">
            <h2 className="text-sm font-semibold text-text-primary">
              New incidents
            </h2>
            <span className="text-xs text-text-secondary">
              {newOnly.length} in New
            </span>
          </div>
          {newOnly.length === 0 ? (
            <p className="px-3 py-5 text-sm text-text-secondary">
              No incidents in New.
            </p>
          ) : (
            <ul className="grid gap-2 p-2 sm:grid-cols-2">
              {newOnly.map((item) => (
                <CaseCard
                  key={item.id}
                  item={item}
                  onOpen={() =>
                    setDrawer({ boardId: item.boardId, issueId: item.id })
                  }
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <SupportOverviewIssueDrawer
        selection={drawer}
        onOpenChange={(open) => {
          if (!open) setDrawer(null);
        }}
      />

      <SupportOverviewRouteDialog
        issue={routing}
        customers={routeCustomers}
        onClose={() => setRouting(null)}
      />
    </>
  );
}
