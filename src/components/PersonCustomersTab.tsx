"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { CustomerFavicon } from "@/components/CustomerFavicon";
import {
  Button,
  CheckboxList,
  ConfirmModal,
  Dialog,
  IconButton,
} from "@/components/ui";
import {
  addCustomerUserToCustomer,
  removeCustomerUserFromCustomer,
} from "@/lib/customerAppUsersClient";
import {
  addConsultantToCustomer,
  removeConsultantFromCustomer,
} from "@/lib/customerConsultantsClient";
import type { PersonListItem } from "@/lib/peopleTypes";
import { customerHref } from "@/lib/routes";
import { compareTextSv } from "@/lib/sort";

export type PersonCustomerOption = {
  id: string;
  name: string;
  isInternal: boolean;
  url: string | null;
  color: string | null;
};

type Props = {
  person: PersonListItem;
  customers: PersonCustomerOption[];
};

export function PersonCustomersTab({ person, customers }: Props) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<PersonCustomerOption | null>(
    null
  );
  const [removing, setRemoving] = useState(false);

  const isCustomerUser = person.userRole === "customer";
  const linkedIds = new Set(person.customers.map((customer) => customer.id));
  const options = customers
    .filter((customer) => {
      if (linkedIds.has(customer.id)) return false;
      if (isCustomerUser && customer.isInternal) return false;
      return true;
    })
    .sort((a, b) => compareTextSv(a.name, b.name));

  async function addSelected() {
    if (selectedIds.length === 0) {
      setError("Select at least one customer");
      return;
    }
    if (isCustomerUser && !person.appUserId) return;
    if (!isCustomerUser && !person.consultantId) return;

    setError(null);
    setSubmitting(true);
    try {
      if (isCustomerUser && person.appUserId) {
        await Promise.all(
          selectedIds.map((customerId) =>
            addCustomerUserToCustomer(customerId, person.appUserId as string)
          )
        );
      } else if (person.consultantId) {
        await Promise.all(
          selectedIds.map((customerId) =>
            addConsultantToCustomer(customerId, person.consultantId as string)
          )
        );
      }
      setAddOpen(false);
      setSelectedIds([]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add customer");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    if (isCustomerUser && !person.appUserId) return;
    if (!isCustomerUser && !person.consultantId) return;

    setError(null);
    setRemoving(true);
    try {
      if (isCustomerUser && person.appUserId) {
        await removeCustomerUserFromCustomer(
          removeTarget.id,
          person.appUserId
        );
      } else if (person.consultantId) {
        await removeConsultantFromCustomer(
          removeTarget.id,
          person.consultantId
        );
      }
      setRemoveTarget(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove customer");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-heading-s text-text-primary">Customers</h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setError(null);
            setSelectedIds([]);
            setAddOpen(true);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add
        </Button>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {person.customers.length > 0 ? (
        <ul className="mt-4 divide-y divide-border-subtle">
          {person.customers.map((customer) => (
            <li
              key={customer.id}
              className="relative -mx-6 flex items-center gap-3 px-6 py-3 transition-colors hover:bg-interactive-secondary"
            >
              <Link
                href={customerHref(customer.id)}
                scroll={false}
                prefetch={false}
                className="absolute inset-0"
                aria-label={customer.name}
              />
              <div className="pointer-events-none flex min-w-0 flex-1 items-center gap-3">
                <CustomerFavicon
                  name={customer.name}
                  url={customer.url}
                  color={customer.color}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                  {customer.name}
                </span>
              </div>
              <IconButton
                variant="ghostDanger"
                className="relative z-10"
                aria-label={`Remove ${customer.name}`}
                onClick={() => setRemoveTarget(customer)}
                disabled={removing}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-text-secondary">
          {isCustomerUser
            ? "Not assigned to any customer yet."
            : "No customers assigned."}
        </p>
      )}

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!open) setAddOpen(false);
        }}
        title="Add customer"
      >
        <form
          className="modal-form-discreet mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void addSelected();
          }}
        >
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          {options.length > 0 ? (
            <CheckboxList
              idPrefix="person-customer"
              options={options.map((customer) => ({
                value: customer.id,
                label: customer.name,
                leading: (
                  <CustomerFavicon
                    name={customer.name}
                    url={customer.url}
                    color={customer.color}
                    size="xs"
                  />
                ),
              }))}
              value={selectedIds}
              onChange={setSelectedIds}
              disabled={submitting}
            />
          ) : (
            <p className="text-sm text-text-secondary">
              All available customers are already assigned.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || options.length === 0}
            >
              {submitting ? "Adding…" : "Add selected"}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmModal
        isOpen={removeTarget != null}
        title="Remove customer"
        message={
          removeTarget
            ? `Remove ${person.name} from ${removeTarget.name}?`
            : ""
        }
        confirmLabel="Remove"
        variant="primary"
        onClose={() => setRemoveTarget(null)}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
