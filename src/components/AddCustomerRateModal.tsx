"use client";

import { useState, useEffect } from "react";
import { getRoles } from "@/lib/rolesClient";
import { getCustomerRates, createCustomerRate } from "@/lib/customerRatesClient";
import {
  Button,
  Dialog,
  ModalField,
  ModalTextInput,
  Select,
  modalFieldLabelClass,
  modalSelectTriggerClass,
} from "@/components/ui";
import { OptionSegments } from "@/components/ui/OptionSegments";
import { hourlyRateLabel } from "@/lib/currency";
import type { Role } from "@/lib/rolesQueries";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  customerId: string;
  billingCurrency?: string;
};

export function AddCustomerRateModal({
  isOpen,
  onClose,
  onSuccess,
  customerId,
  billingCurrency = "SEK",
}: Props) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [usedRoleIds, setUsedRoleIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"role" | "custom">("role");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [customName, setCustomName] = useState("");
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !customerId) return;
    setLoading(true);
    setError(null);
    Promise.all([getRoles(), getCustomerRates(customerId)])
      .then(([r, rates]) => {
        setRoles(r);
        setUsedRoleIds(rates.map((x) => x.role_id).filter((id): id is string => Boolean(id)));
      })
      .catch(() => {
        setRoles([]);
        setUsedRoleIds([]);
      })
      .finally(() => setLoading(false));
  }, [isOpen, customerId]);

  const availableRoles = roles.filter((r) => !usedRoleIds.includes(r.id));

  const handleSubmit = async () => {
    setError(null);
    const rateNum = parseFloat(rate.replace(",", "."));
    if (isNaN(rateNum) || rateNum < 0) {
      setError("Enter a valid rate");
      return;
    }
    if (mode === "role" && !selectedRoleId) {
      setError("Select a role and enter a valid rate");
      return;
    }
    if (mode === "custom" && !customName.trim()) {
      setError("Enter a task name and a valid rate");
      return;
    }
    setSubmitting(true);
    try {
      await createCustomerRate(customerId, {
        roleId: mode === "role" ? selectedRoleId : null,
        name: mode === "custom" ? customName : null,
        ratePerHour: rateNum,
      });
      setSelectedRoleId("");
      setCustomName("");
      setRate("");
      setMode("role");
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add rate");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedRoleId("");
      setCustomName("");
      setRate("");
      setMode("role");
      setError(null);
      onClose();
    }
  };

  const dialogOpen = isOpen && !loading;
  const canSubmit =
    !submitting &&
    !loading &&
    (mode === "custom" || availableRoles.length > 0);

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange} title="Add rate">
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
        {loading ? null : (
          <>
            <div>
              <p className={`mb-1 ${modalFieldLabelClass}`}>Type</p>
              <OptionSegments
                name="add-customer-rate-type"
                value={mode}
                onChange={(v) => setMode(v as "role" | "custom")}
                options={[
                  { value: "role", label: "Global role" },
                  { value: "custom", label: "Custom task" },
                ]}
              />
            </div>
            {mode === "role" ? (
              <ModalField id="add-customer-rate-role" label="Role">
                <Select
                  id="add-customer-rate-role"
                  value={selectedRoleId}
                  onValueChange={setSelectedRoleId}
                  placeholder="Role"
                  variant="modal"
                  triggerClassName={modalSelectTriggerClass}
                  options={availableRoles.map((r) => ({ value: r.id, label: r.name }))}
                />
              </ModalField>
            ) : (
              <ModalTextInput
                id="add-customer-rate-name"
                label="Task name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Workshop"
              />
            )}
            <ModalTextInput
              id="add-customer-rate-value"
              type="number"
              min={0}
              step={1}
              label={hourlyRateLabel(billingCurrency)}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="e.g. 1200"
            />
          </>
        )}
        {mode === "role" && availableRoles.length === 0 && !loading && (
          <p className="text-sm text-text-primary opacity-60">
            All global roles already have rates. Add a custom task, or add more roles in Settings.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {submitting ? "Adding…" : "Add"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
