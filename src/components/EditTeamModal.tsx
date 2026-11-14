"use client";

import { useState, useEffect } from "react";
import { updateTeam } from "@/lib/teamsClient";
import { Button, Dialog, ModalTextInput } from "@/components/ui";

type Props = {
  team: { id: string; name: string } | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function EditTeamModal({
  team,
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (team) setName(team.name);
  }, [team]);

  const handleSubmit = async () => {
    if (!team) return;
    setError(null);
    if (!name.trim()) {
      setError("Team name is required");
      return;
    }
    setSubmitting(true);
    try {
      await updateTeam(team.id, name.trim());
      setName("");
      setError(null);
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update team");
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

  if (!team) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange} title="Edit team">
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
          id="edit-team-name"
          label="Team name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Team Sthlm"
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => handleOpenChange(false)}>
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
