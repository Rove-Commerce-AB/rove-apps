"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  Select,
  Button,
  modalInputClass,
  modalSelectTriggerClass,
} from "@/components/ui";
import { createWorkBoardAction } from "@/app/(app)/work/actions";
import { CreateProjectAppAvailability } from "@/components/CreateProjectAppAvailability";
import { createProject } from "@/lib/projectsClient";
import { getCustomers } from "@/lib/customersClient";
import { suggestWorkBoardPrefix } from "@/lib/workIssueKey";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** When set, customer is pre-filled and hidden (e.g. when adding from customer page). */
  initialCustomerId?: string;
  /** When false, stay on current page after create and refresh (default: true = open project settings). */
  redirectToProject?: boolean;
};

export function AddProjectModal({
  isOpen,
  onClose,
  onSuccess,
  initialCustomerId,
  redirectToProject = true,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [alsoCreateWork, setAlsoCreateWork] = useState(false);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialCustomerId) {
        setCustomerId(initialCustomerId);
      }
      getCustomers()
        .then((c) => {
          setCustomers(c);
          if (!initialCustomerId) {
            setCustomerId((prev) => (prev || c[0]?.id) ?? "");
          }
        })
        .catch(() => setCustomers([]));
    }
  }, [isOpen, initialCustomerId]);

  const handleSubmit = async () => {
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
      const trimmed = name.trim();
      const project = await createProject({
        name: trimmed,
        customer_id: customerId,
      });

      if (alsoCreateWork) {
        const customerName =
          customers.find((c) => c.id === customerId)?.name ?? trimmed;
        const workResult = await createWorkBoardAction(
          customerId,
          trimmed,
          suggestWorkBoardPrefix(customerName, trimmed),
          undefined,
          project.id
        );
        if (!workResult.ok) {
          setError(
            `Project created, but Work project failed: ${workResult.error}`
          );
          setSubmitting(false);
          onSuccess();
          router.refresh();
          if (redirectToProject) {
            router.push(`/projects/${project.id}`);
          }
          return;
        }
      }

      resetForm();
      onSuccess();
      onClose();
      router.refresh();
      if (redirectToProject) {
        router.push(`/projects/${project.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setName("");
    setAlsoCreateWork(false);
    setCustomerId(initialCustomerId ?? "");
    setError(null);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange} title="Add project">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        className="modal-form-discreet mt-6 space-y-4"
      >
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label
              htmlFor="project-name"
              className="block text-sm font-medium text-text-primary"
            >
              Project name
            </label>
            <input
              id="project-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Website redesign"
              className={`mt-1 ${modalInputClass}`}
              autoFocus
            />
          </div>
          <CreateProjectAppAvailability
            createWork={alsoCreateWork}
            onCreateWorkChange={setAlsoCreateWork}
            idPrefix="modal-create-project-app"
          />
        </div>

        {!initialCustomerId && (
          <Select
            id="project-customer"
            label="Customer"
            value={customerId}
            onValueChange={setCustomerId}
            placeholder="Select customer"
            variant="modal"
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
            triggerClassName={modalSelectTriggerClass}
          />
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create project"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
