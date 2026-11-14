"use client";

import { useState } from "react";
import { createCalendar } from "@/lib/calendarsClient";
import { Button, Dialog, ModalTextInput } from "@/components/ui";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function AddCalendarModal({ isOpen, onClose, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [hoursPerWeek, setHoursPerWeek] = useState("40");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Calendar name is required");
      return;
    }
    if (!countryCode.trim()) {
      setError("Country code is required");
      return;
    }
    const hours = parseFloat(hoursPerWeek.replace(",", "."));
    if (isNaN(hours) || hours <= 0) {
      setError("Hours per week must be a positive number");
      return;
    }
    setSubmitting(true);
    try {
      await createCalendar({
        name: name.trim(),
        country_code: countryCode.trim(),
        hours_per_week: hours,
      });
      setName("");
      setCountryCode("");
      setHoursPerWeek("40");
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add calendar");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setName("");
      setCountryCode("");
      setHoursPerWeek("40");
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange} title="Add calendar">
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
          id="calendar-name"
          label="Name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sweden"
          autoFocus
        />

        <ModalTextInput
          id="calendar-country"
          label="Country code"
          type="text"
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
          placeholder="e.g. SE"
          maxLength={2}
          className="w-24"
        />

        <ModalTextInput
          id="calendar-hours"
          label="Hours per week"
          type="text"
          value={hoursPerWeek}
          onChange={(e) => setHoursPerWeek(e.target.value)}
          placeholder="e.g. 40 or 37.5"
          className="w-32"
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
