"use client";

import { useState } from "react";
import { createTimeActivity } from "@/lib/timeActivitiesClient";
import { Button, Dialog, ModalTextInput } from "@/components/ui";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function AddTimeActivityModal({ isOpen, onClose, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Activity name is required");
      return;
    }
    setSubmitting(true);
    try {
      await createTimeActivity(name.trim());
      setName("");
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add activity");
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
    <Dialog open={isOpen} onOpenChange={handleOpenChange} title="Add activity">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        className="modal-form-discreet mt-4 space-y-3"
      >
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <ModalTextInput
          id="activity-name"
          label="Activity name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Project management"
          autoFocus
        />
        <p className="text-caption text-text-secondary">
          Central activities can be enabled per project for time reporting.
        </p>
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
