"use client";

import { useState, useEffect } from "react";
import { updateProject, getProjectWithDetailsById } from "@/lib/projectsClient";
import { deleteProjectAction } from "@/app/(app)/projects/actions";
import {
  Button,
  ConfirmModal,
  Dialog,
  ModalField,
  ModalTextInput,
  Select,
  Switch,
  modalSelectTriggerClass,
} from "@/components/ui";
import { getCustomers } from "@/lib/customersClient";
import type { ProjectWithDetails } from "@/types";

type Props = {
  project: ProjectWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  isAdmin?: boolean;
};

export function EditProjectModal({
  project,
  isOpen,
  onClose,
  onSuccess,
  isAdmin = false,
}: Props) {
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen && project?.id) {
      getProjectWithDetailsById(project.id)
        .then((fresh) => {
          if (fresh) {
            setName(fresh.name);
            setCustomerId(fresh.customer_id ?? "");
            setIsActive(fresh.isActive);
            setStartDate(fresh.startDate ?? "");
            setEndDate(fresh.endDate ?? "");
          }
        })
        .catch(() => {
          if (project) {
            setName(project.name);
            setCustomerId(project.customer_id ?? "");
            setIsActive(project.isActive);
            setStartDate(project.startDate ?? "");
            setEndDate(project.endDate ?? "");
          }
        });
    }
  }, [isOpen, project]);

  useEffect(() => {
    if (isOpen) {
      getCustomers()
        .then((c) => setCustomers(c))
        .catch(() => setCustomers([]));
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!project) return;
    setError(null);
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    if (!customerId) {
      setError("Customer is required");
      return;
    }
    setSubmitting(true);
    try {
      await updateProject(project.id, {
        name: name.trim(),
        customer_id: customerId,
        is_active: isActive,
        start_date: startDate.trim() || null,
        end_date: endDate.trim() || null,
      });
      resetForm();
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update project");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteProjectAction(project.id, project.customer_id ?? null);
      setShowDeleteConfirm(false);
      resetForm();
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete project");
    } finally {
      setDeleting(false);
    }
  };

  const resetForm = () => {
    setName("");
    setCustomerId("");
    setIsActive(true);
    setStartDate("");
    setEndDate("");
    setError(null);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm();
      onClose();
    }
  };

  if (!project) return null;

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        title="Edit project"
        contentClassName="max-h-[90vh] overflow-y-auto"
      >
        <form
          id="edit-project-form"
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
            id="edit-project-name"
            label="Project name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Website redesign"
          />

          <ModalField id="edit-project-customer" label="Customer">
            <Select
              id="edit-project-customer"
              value={customerId}
              onValueChange={setCustomerId}
              placeholder="Select customer"
              variant="modal"
              options={(
                customerId && !customers.some((c) => c.id === customerId) && project
                  ? [{ value: customerId, label: project.customerName }]
                  : []
              ).concat(customers.map((c) => ({ value: c.id, label: c.name })))}
              triggerClassName={modalSelectTriggerClass}
            />
          </ModalField>

          <div className="grid grid-cols-2 gap-4">
            <ModalTextInput
              id="edit-project-start-date"
              label="Start date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <ModalTextInput
              id="edit-project-end-date"
              label="End date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <Switch
            id="edit-project-active"
            checked={isActive}
            onCheckedChange={setIsActive}
            label="Active project"
          />
        </form>

        <div className="mt-4 flex items-center justify-between gap-2">
          {isAdmin ? (
            <Button
              type="button"
              variant="dangerSecondary"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={submitting || deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              form="edit-project-form"
              disabled={submitting || deleting}
            >
              {submitting ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Dialog>

      {isAdmin && (
        <ConfirmModal
          isOpen={showDeleteConfirm}
          title="Delete project"
          message={`Delete ${project?.name}? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
