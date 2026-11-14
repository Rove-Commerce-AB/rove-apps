"use client";

import { useState, useEffect } from "react";
import { createConsultantAndRevalidate } from "@/app/(app)/consultants/actions";
import { consultantHref } from "@/lib/routes";
import { getRoles } from "@/lib/rolesClient";
import { getCalendars } from "@/lib/calendarsClient";
import { Button, Dialog, ModalTextInput } from "@/components/ui";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function AddConsultantModal({ isOpen, onClose, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [defaultRoleId, setDefaultRoleId] = useState<string | null>(null);
  const [defaultCalendarId, setDefaultCalendarId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      Promise.all([getRoles(), getCalendars()])
        .then(([r, c]) => {
          setDefaultRoleId(r[0]?.id ?? null);
          setDefaultCalendarId(c[0]?.id ?? null);
        })
        .catch(() => {
          setDefaultRoleId(null);
          setDefaultCalendarId(null);
        });
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!defaultRoleId || !defaultCalendarId) {
      setError("Roles and calendars must be configured. Add at least one role and one calendar in Settings.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createConsultantAndRevalidate({
        name: name.trim(),
        role_id: defaultRoleId,
        calendar_id: defaultCalendarId,
        work_percentage: 100,
        overhead_percentage: 0,
      });
      resetForm();
      onClose();
      onSuccess();
      window.location.href = consultantHref(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add consultant");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setName("");
    setError(null);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange} title="Add consultant">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="modal-form-discreet mt-4 space-y-3"
      >
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <ModalTextInput
          id="consultant-name"
          label="Name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Anna Andersson"
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
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
