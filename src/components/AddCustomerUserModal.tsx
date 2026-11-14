"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  Button,
  CheckboxList,
  InitialsAvatar,
  ModalTextInput,
  modalFieldLabelClass,
} from "@/components/ui";
import { initialsFromName } from "@/lib/workIssueKey";
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
          className="modal-form-discreet mt-4 space-y-3"
        >
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          {options.length > 0 ? (
            <CheckboxList
              label="Existing customer users"
              idPrefix="add-customer-user"
              options={options.map((user) => ({
                value: user.id,
                label: user.name,
                description: user.email,
                leading: (
                  <InitialsAvatar
                    name={user.name}
                    initials={initialsFromName(user.name) || "?"}
                    size="xxs"
                  />
                ),
              }))}
              value={selectedIds}
              onChange={setSelectedIds}
              disabled={submitting}
            />
          ) : allCustomerUsers.length > 0 ? (
            <p className="text-sm text-text-primary opacity-70">
              All customer users are already assigned to this customer.
            </p>
          ) : null}

          <div>
            <p className={`mb-2 ${modalFieldLabelClass}`}>Create new</p>
            <div className="space-y-3">
              <ModalTextInput
                id="add-customer-user-name"
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <ModalTextInput
                id="add-customer-user-email"
                type="email"
                label="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Adding…" : "Add"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
