"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCustomerAction } from "@/app/(app)/customers/actions";
import { customerHref } from "@/lib/routes";
import {
  Button,
  Dialog,
  ModalTextInput,
} from "@/components/ui";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function AddCustomerModal({ isOpen, onClose, onSuccess }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Company name is required");
      return;
    }
    setSubmitting(true);
    try {
      const customer = await createCustomerAction({
        name: name.trim(),
      });
      onSuccess();
      onClose();
      await router.push(customerHref(customer.id));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add customer");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setName("");
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange} title="Add customer">
      <form onSubmit={handleSubmit} className="modal-form-discreet mt-4 space-y-3">
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <ModalTextInput
          id="customer-name"
          label="Company name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Company AB"
          autoFocus
        />

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? "Adding…" : "Add"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
