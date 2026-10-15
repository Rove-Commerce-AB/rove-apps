"use client";

import { useEffect, useState } from "react";
import { Dialog, Button, Input } from "@/components/ui";
import { TemporaryPasswordReveal } from "@/components/TemporaryPasswordReveal";
import { addCustomerUserToCustomer } from "@/lib/customerAppUsersClient";
import type { CustomerAppUser } from "@/lib/customerAppUsersQueries";
import { createUserPerson } from "@/lib/people";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  customerId: string;
  existingUsers: CustomerAppUser[];
  allCustomerUsers: CustomerAppUser[];
};

export function AddCustomerUserModal({
  isOpen,
  onClose,
  onSuccess,
  customerId,
  existingUsers = [],
  allCustomerUsers = [],
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revealed, setRevealed] = useState<{
    email: string;
    temporaryPassword: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSelectedIds([]);
      setName("");
      setEmail("");
      setRevealed(null);
    }
  }, [isOpen]);

  const existingIds = new Set(existingUsers.map((user) => user.id));
  const options = allCustomerUsers.filter((user) => !existingIds.has(user.id));

  function toggleUser(userId: string) {
    setSelectedIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  }

  function finish() {
    setRevealed(null);
    onSuccess();
    onClose();
  }

  async function handleSubmit() {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const creating = Boolean(trimmedEmail);
    if (selectedIds.length === 0 && !creating) {
      setError("Select an existing customer user or enter an email to create one");
      return;
    }
    if (creating && !trimmedEmail) {
      setError("Email is required");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await Promise.all(
        selectedIds.map((appUserId) =>
          addCustomerUserToCustomer(customerId, appUserId)
        )
      );
      if (creating) {
        const result = await createUserPerson({
          name: trimmedName,
          email: trimmedEmail,
          role: "customer",
          appKeys: [],
          customerIds: [customerId],
        });
        if (result.temporaryPassword) {
          setRevealed({
            email: trimmedEmail,
            temporaryPassword: result.temporaryPassword,
          });
          return;
        }
      }
      finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add customer user");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          if (revealed) finish();
          else onClose();
        }
      }}
      title={revealed ? "Temporary password" : "Add customer user"}
    >
      {revealed ? (
        <div className="mt-6">
          <TemporaryPasswordReveal
            email={revealed.email}
            temporaryPassword={revealed.temporaryPassword}
            onDone={finish}
          />
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
          className="modal-form-discreet mt-6 space-y-4"
        >
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          {options.length > 0 ? (
            <div>
              <p className="mb-2 block text-sm font-medium text-text-primary">
                Existing customer users
              </p>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-form bg-bg-default p-3">
                {options.map((user) => (
                  <label
                    key={user.id}
                    htmlFor={`add-customer-user-${user.id}`}
                    className="flex cursor-pointer items-center gap-2 text-sm text-text-primary"
                  >
                    <input
                      id={`add-customer-user-${user.id}`}
                      type="checkbox"
                      checked={selectedIds.includes(user.id)}
                      onChange={() => toggleUser(user.id)}
                      disabled={submitting}
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{user.name}</span>
                      <span className="block truncate text-text-tertiary">
                        {user.email}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : allCustomerUsers.length > 0 ? (
            <p className="text-sm text-text-primary opacity-70">
              All customer users are already assigned to this customer.
            </p>
          ) : null}

          <div>
            <p className="mb-2 block text-sm font-medium text-text-primary">
              Create new
            </p>
            <div className="space-y-3">
              <Input
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                modalStyle
              />
              <Input
                type="email"
                label="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                modalStyle
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
