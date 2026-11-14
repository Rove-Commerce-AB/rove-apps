"use client";

import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { getRoles } from "@/lib/rolesClient";
import { updateAllocation } from "@/lib/allocationsClient";
import {
  revalidateAllocationPage,
  logAllocationHistoryUpdate,
  deleteAllocationWithHistory,
} from "@/app/(app)/allocation/actions";
import {
  Button,
  ConfirmModal,
  Dialog,
  ModalField,
  ModalReadonlyField,
  ModalTextInput,
  Select,
  modalSelectTriggerClass,
} from "@/components/ui";

type AllocationData = {
  id: string;
  consultantName: string;
  projectName: string;
  customerName: string;
  week: number;
  year: number;
  hours: number;
  roleId: string | null;
  roleName: string;
};

type Props = {
  allocation: AllocationData | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function EditAllocationModal({
  allocation,
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  const [roleId, setRoleId] = useState<string | null>(null);
  const [hours, setHours] = useState("");
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (allocation) {
      setRoleId(allocation.roleId);
      setHours(String(allocation.hours));
    }
  }, [allocation]);

  useEffect(() => {
    if (isOpen) {
      getRoles()
        .then(setRoles)
        .catch(() => setRoles([]));
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!allocation) return;
    setError(null);
    const h = parseFloat(hours);
    if (isNaN(h) || h < 0) {
      setError("Hours must be 0 or a positive number");
      return;
    }
    setSubmitting(true);
    try {
      await updateAllocation(allocation.id, {
        role_id: roleId,
        hours: h,
      });
      await revalidateAllocationPage();
      onSuccess();
      resetForm();
      onClose();
      logAllocationHistoryUpdate(allocation.id, h).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update allocation");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!allocation) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteAllocationWithHistory(allocation.id);
      await revalidateAllocationPage();
      onSuccess();
      setShowDeleteConfirm(false);
      resetForm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete allocation");
    } finally {
      setDeleting(false);
    }
  };

  const resetForm = () => {
    setRoleId(null);
    setHours("");
    setError(null);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm();
      onClose();
    }
  };

  if (!allocation) return null;

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        title="Edit allocation"
      >
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

          <ModalReadonlyField label="Consultant">
            {allocation.consultantName}
          </ModalReadonlyField>

          <ModalReadonlyField label="Project">
            {allocation.projectName} ({allocation.customerName})
          </ModalReadonlyField>

          <ModalReadonlyField label="Week">
            v{allocation.week}, {allocation.year}
          </ModalReadonlyField>

          <ModalField id="edit-alloc-role" label="Role">
            <Select
              id="edit-alloc-role"
              value={roleId ?? ""}
              onValueChange={(v) => setRoleId(v ? v : null)}
              placeholder="No role"
              variant="modal"
              triggerClassName={modalSelectTriggerClass}
              options={[
                { value: "", label: "No role" },
                ...roles.map((r) => ({ value: r.id, label: r.name })),
                ...(allocation.roleId && allocation.roleName && !roles.some((r) => r.id === allocation.roleId)
                  ? [{ value: allocation.roleId, label: allocation.roleName }]
                  : []),
              ]}
            />
          </ModalField>

          <div className="w-24">
            <ModalTextInput
              id="edit-alloc-hours"
              label="Hours"
              type="number"
              min={0}
              step={0.5}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
            <p className="mt-1 text-[12px] text-text-tertiary">
              Set to 0 to remove the allocation
            </p>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="dangerSecondary"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <div className="flex gap-2">
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
          </div>
        </form>
      </Dialog>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete allocation"
        message="Delete this allocation? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
      />
    </>
  );
}
