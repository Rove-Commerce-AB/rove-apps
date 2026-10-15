"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Inbox, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { CustomerFavicon } from "@/components/CustomerFavicon";
import { ROUTES, workCustomerHref, workProjectHref } from "@/lib/routes";
import type { WorkSelectorCustomer } from "@/lib/workTypes";
import { WorkCreateProjectDialog } from "./WorkCreateProjectDialog";

type Props = {
  customers: WorkSelectorCustomer[];
  canCreateProject?: boolean;
};

export function WorkSelectorPageClient({
  customers,
  canCreateProject = true,
}: Props) {
  const [createForCustomerId, setCreateForCustomerId] = useState<string | null>(
    null
  );

  const createCustomer = customers.find(
    (customer) => customer.id === createForCustomerId
  );

  return (
    <div className="w-full">
      <PageHeader
        title="Select customer"
        description={
          canCreateProject
            ? "Open a project to start working, or create one for a customer that has none yet."
            : "Open a project to start working."
        }
        className="mb-6"
      />

      <Link
        href={ROUTES.workMine}
        className="mb-6 flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-default px-4 py-3 text-text-primary shadow-sm transition-colors hover:border-border-default hover:text-accent-primary-text"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-muted text-text-secondary">
          <Inbox className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">My work</span>
          <span className="block text-caption text-text-tertiary">
            Issues where you are owner or assignee
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />
      </Link>

      {customers.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-bg-default px-4 py-10 text-center text-sm text-text-secondary">
          No customers assigned yet. Ask an admin to link you to a customer.
        </p>
      ) : (
        <div className="grid grid-cols-1 items-start justify-items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {customers.map((customer) => (
            <article
              key={customer.id}
              className="rounded-xl border border-border-subtle bg-bg-default p-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <Link
                  href={workCustomerHref(customer.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-text-primary transition-colors hover:text-accent-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-focus focus-visible:ring-offset-2"
                >
                  <CustomerFavicon
                    name={customer.name}
                    url={customer.url}
                    color={customer.color}
                  />
                  <h2 className="min-w-0 flex-1 truncate text-heading-s">
                    {customer.name}
                  </h2>
                </Link>
                {canCreateProject ? (
                  <button
                    type="button"
                    onClick={() => setCreateForCustomerId(customer.id)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-muted hover:text-text-primary"
                    aria-label={`Create project for ${customer.name}`}
                    title="Create project"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </div>

              {customer.boards.length > 0 ? (
                <ul className="mt-3 divide-y divide-border-subtle">
                  {customer.boards.map((board) => (
                    <li key={board.id}>
                      <Link
                        href={workProjectHref(customer.id, board.id)}
                        className="flex items-center justify-between gap-3 py-2.5 text-body-m text-text-primary transition-colors hover:text-accent-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-focus focus-visible:ring-offset-2"
                      >
                        <span className="min-w-0 truncate">{board.title}</span>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-text-tertiary"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {canCreateProject ? (
        <WorkCreateProjectDialog
          customer={createCustomer ?? null}
          open={createForCustomerId != null}
          onOpenChange={(open) => {
            if (!open) setCreateForCustomerId(null);
          }}
        />
      ) : null}
    </div>
  );
}
