"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  Select,
  Button,
  ModalField,
  ModalReadonlyField,
  ModalTextInput,
  modalFieldLabelClass,
  modalSegmentedButtonClass,
  modalSegmentedGroupClass,
  modalSelectTriggerClass,
} from "@/components/ui";
import { getConsultantsWithDefaultRole } from "@/lib/consultantsClient";
import {
  getProjectsWithCustomer,
  getProjectsAvailableForConsultant,
} from "@/lib/projectsClient";
import { getRolesWithRateForAllocation } from "@/lib/projectRatesClient";
import { createAllocationsForWeekRange } from "@/lib/allocationsClient";
import {
  createAllocationsByPercent,
  deleteAllocationsInWeekRange,
  revalidateAllocationPage,
  logBulkAllocationHistory,
} from "@/app/(app)/allocation/actions";
import { TO_PLAN_CONSULTANT_ID } from "@/lib/allocationPageTypes";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  year: number;
  weekFrom: number;
  weekTo: number;
  /** Pre-fill consultant and week when opening from a cell click */
  initialConsultantId?: string;
  initialConsultantName?: string;
  initialWeek?: number;
  initialYear?: number;
  /** Pre-fill week range when opening from header drag */
  initialWeekFrom?: number;
  initialWeekTo?: number;
  /** Pre-fill and lock project when opening from project detail planning panel */
  initialProjectId?: string;
  initialProjectLabel?: string;
};

type Consultant = { id: string; name: string; role_id: string | null };
type Project = {
  id: string;
  name: string;
  customerName: string;
  customer_id: string;
  type: "customer" | "internal" | "absence";
};
type Role = { id: string; name: string };

export function AddAllocationModal({
  isOpen,
  onClose,
  onSuccess,
  year,
  weekFrom,
  weekTo,
  initialConsultantId,
  initialConsultantName,
  initialWeek,
  initialYear,
  initialWeekFrom,
  initialWeekTo,
  initialProjectId,
  initialProjectLabel,
}: Props) {
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [consultantId, setConsultantId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [roleId, setRoleId] = useState<string | null>(null);
  const [fromWeek, setFromWeek] = useState(weekFrom);
  const [toWeek, setToWeek] = useState(weekTo);
  const [allocYear, setAllocYear] = useState(year);
  const [inputMode, setInputMode] = useState<"hours" | "percent">("hours");
  const [hoursPerWeek, setHoursPerWeek] = useState("8");
  const [percent, setPercent] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);


  useEffect(() => {
    if (isOpen) {
      const allocY = initialYear ?? year;
      setAllocYear(allocY);
      setConsultantId(initialConsultantId ?? "");
      setProjectId(initialProjectId ?? "");
      if (initialWeekFrom != null && initialWeekTo != null) {
        setFromWeek(initialWeekFrom);
        setToWeek(initialWeekTo);
      } else {
        const week = initialWeek ?? weekFrom;
        setFromWeek(week);
        setToWeek(week);
      }
      getConsultantsWithDefaultRole()
        .then(setConsultants)
        .catch(() => setConsultants([]));
    }
  }, [isOpen, year, weekFrom, weekTo, initialConsultantId, initialConsultantName, initialWeek, initialYear, initialWeekFrom, initialWeekTo, initialProjectId]);

  // When consultant changes, load projects available for that consultant (or all if empty / To plan).
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    if (!consultantId || consultantId === TO_PLAN_CONSULTANT_ID) {
      getProjectsWithCustomer()
        .then((list) => {
          if (!cancelled) setProjects(list);
        })
        .catch(() => {
          if (!cancelled) setProjects([]);
        });
      return () => {
        cancelled = true;
      };
    }
    setProjects([]);
    getProjectsAvailableForConsultant(consultantId)
      .then((list) => {
        if (!cancelled) setProjects(list);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, consultantId]);

  // Set initial consultant only when opening with a pre-selected consultant (e.g. from cell click)
  useEffect(() => {
    if (isOpen && consultants.length > 0 && initialConsultantId) {
      if (consultants.some((c) => c.id === initialConsultantId)) {
        setConsultantId(initialConsultantId);
      }
    }
  }, [isOpen, consultants, initialConsultantId]);

  // When project changes: for customer type load roles with rate and clear role; for internal/absence hide role
  useEffect(() => {
    if (!isOpen || !projectId || projects.length === 0) {
      setRoles([]);
      return;
    }
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      setRoles([]);
      return;
    }
    if (project.type !== "customer") {
      setRoleId(null);
      setRoles([]);
      return;
    }
    setRoleId("");
    let cancelled = false;
    getRolesWithRateForAllocation(projectId, project.customer_id)
      .then((list) => {
        if (!cancelled) setRoles(list);
      })
      .catch(() => {
        if (!cancelled) setRoles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, projectId, projects]);

  // Pre-fill role with consultant's default when project is customer and roles loaded (if that role has a rate)
  useEffect(() => {
    if (!consultantId || !projectId || roles.length === 0) return;
    const project = projects.find((p) => p.id === projectId);
    if (!project || project.type !== "customer") return;
    if (roleId !== "" && roleId !== null) return;
    const consultant = consultants.find((c) => c.id === consultantId);
    const defaultRoleId = consultant?.role_id ?? null;
    if (defaultRoleId && roles.some((r) => r.id === defaultRoleId)) {
      setRoleId(defaultRoleId);
    }
  }, [consultantId, projectId, projects, roles, roleId]);

  const isToPlan = consultantId === TO_PLAN_CONSULTANT_ID;
  const effectiveConsultantId = isToPlan ? null : consultantId;
  /** When opened from consultant row drag: lock consultant; lock project when pre-filled (project page) or after user selects one. */
  const lockFromDrag = !!initialConsultantId;
  const lockConsultant = lockFromDrag;
  const lockProject = lockFromDrag && !!initialProjectId;
  const selectedConsultantName =
    initialConsultantName ??
    consultants.find((c) => c.id === consultantId)?.name ??
    "";
  const dialogTitle = lockConsultant && selectedConsultantName
    ? selectedConsultantName
    : "Add allocation";
  const dialogSubtitle = lockConsultant && selectedConsultantName
    ? "Add allocation"
    : undefined;

  const handleSubmit = async () => {
    setError(null);
    if (!effectiveConsultantId && !isToPlan) {
      setError("Select a consultant");
      return;
    }
    if (!projectId) {
      setError("Select a project");
      return;
    }
    const project = projects.find((p) => p.id === projectId);
    const effectiveRoleId = project?.type === "customer" ? (roleId || null) : null;
    setSubmitting(true);
    try {
      if (inputMode === "percent") {
        const pct = parseFloat(percent);
        if (isNaN(pct) || pct < 0 || pct > 100) {
          setError("Percent must be between 0 and 100");
          setSubmitting(false);
          return;
        }
        await createAllocationsByPercent(
          effectiveConsultantId ?? null,
          projectId,
          effectiveRoleId,
          allocYear,
          fromWeek,
          toWeek,
          pct
        );
        onSuccess();
        handleClose();
      } else {
        const hours = parseFloat(hoursPerWeek);
        if (isNaN(hours) || hours < 0) {
          setError("Hours must be 0 or a positive number");
          setSubmitting(false);
          return;
        }
        if (hours === 0) {
          await deleteAllocationsInWeekRange(
            effectiveConsultantId ?? null,
            projectId,
            effectiveRoleId,
            allocYear,
            fromWeek,
            toWeek
          );
          await revalidateAllocationPage();
          onSuccess();
          handleClose();
        } else if (hours < 0.01) {
          setError("Hours must be at least 0.01");
          setSubmitting(false);
          return;
        } else {
          const records = await createAllocationsForWeekRange(
            effectiveConsultantId ?? null,
            projectId,
            effectiveRoleId,
            allocYear,
            fromWeek,
            toWeek,
            hours
          );
          await revalidateAllocationPage();
          onSuccess();
          handleClose();
          if (records.length > 0) {
            logBulkAllocationHistory(
              records.map((r) => r.id),
              records.reduce((s, r) => s + r.hours, 0)
            ).catch(() => {});
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add allocation");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setConsultantId("");
    setProjectId("");
    setRoleId(null);
    setFromWeek(weekFrom);
    setToWeek(weekTo);
    setAllocYear(year);
    setInputMode("hours");
    setHoursPerWeek("8");
    setPercent("100");
    onClose();
  };

  useEffect(() => {
    if (!isOpen) {
      setConsultantId("");
      setProjectId("");
      setRoleId(null);
      setInputMode("hours");
      setHoursPerWeek("8");
      setPercent("100");
    }
  }, [isOpen]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && handleClose()}
      title={dialogTitle}
      subtitle={dialogSubtitle}
      contentClassName="max-w-[400px]"
      subtitleClassName="mb-1"
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

          {!isToPlan && !lockConsultant && (
            <ModalField id="alloc-consultant" label="Consultant">
              <Select
                id="alloc-consultant"
                value={consultantId === TO_PLAN_CONSULTANT_ID ? "" : consultantId}
                onValueChange={(v) => {
                  setConsultantId(v);
                  setProjectId("");
                }}
                placeholder="Select consultant"
                variant="modal"
                triggerClassName={modalSelectTriggerClass}
                options={[
                  { value: "", label: "Select consultant" },
                  { value: TO_PLAN_CONSULTANT_ID, label: "To plan" },
                  ...(consultantId && initialConsultantName && consultantId !== TO_PLAN_CONSULTANT_ID && !consultants.some((c) => c.id === consultantId)
                    ? [{ value: consultantId, label: initialConsultantName }]
                    : []),
                  ...consultants.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </ModalField>
          )}
          {isToPlan && (
            <p className="text-[12px] font-medium text-text-tertiary">
              Adding to <strong>To plan</strong>
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            {lockProject ? (
              <ModalReadonlyField label="Project">
                <span id="alloc-project">
                  {initialProjectLabel ?? (() => {
                    const p = projects.find((x) => x.id === projectId);
                    return p ? `${p.customerName} - ${p.name}` : projectId;
                  })()}
                </span>
              </ModalReadonlyField>
            ) : (
              <ModalField id="alloc-project" label="Project">
                <Select
                  id="alloc-project"
                  value={projectId}
                  onValueChange={setProjectId}
                  placeholder="Select project"
                  variant="modal"
                  triggerClassName={modalSelectTriggerClass}
                  options={[...projects]
                    .sort((a, b) => a.customerName.localeCompare(b.customerName))
                    .map((p) => ({
                      value: p.id,
                      label: `${p.customerName} - ${p.name}`,
                    }))}
                />
              </ModalField>
            )}

            <ModalField id="alloc-role" label="Role">
              <Select
                id="alloc-role"
                value={roleId ?? ""}
                onValueChange={(v) => setRoleId(v || null)}
                placeholder={
                  projects.find((p) => p.id === projectId)?.type !== "customer"
                    ? "Select a customer project first"
                    : "Select role"
                }
                disabled={projects.find((p) => p.id === projectId)?.type !== "customer"}
                variant="modal"
                triggerClassName={modalSelectTriggerClass}
                options={roles.map((r) => ({ value: r.id, label: r.name }))}
              />
            </ModalField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ModalTextInput
              id="alloc-from-week"
              label="From week"
              type="number"
              min={1}
              max={52}
              value={fromWeek}
              onChange={(e) => setFromWeek(parseInt(e.target.value, 10) || 1)}
              onFocus={(e) => e.target.select()}
            />
            <ModalTextInput
              id="alloc-to-week"
              label="To week"
              type="number"
              min={1}
              max={52}
              value={toWeek}
              onChange={(e) => setToWeek(parseInt(e.target.value, 10) || 1)}
              onFocus={(e) => e.target.select()}
            />
          </div>

          <div>
            <p className={modalFieldLabelClass}>Type</p>
            <div
              className={`mt-1 ${modalSegmentedGroupClass}`}
              role="group"
              aria-label="Input mode"
            >
              <button
                type="button"
                aria-pressed={inputMode === "hours"}
                onClick={() => setInputMode("hours")}
                className={modalSegmentedButtonClass(inputMode === "hours")}
              >
                Hours / week
              </button>
              <button
                type="button"
                aria-pressed={inputMode === "percent"}
                onClick={() => setInputMode("percent")}
                className={modalSegmentedButtonClass(inputMode === "percent")}
              >
                % of week
              </button>
            </div>
            {inputMode === "hours" ? (
              <div className="mt-4 w-24">
                <ModalTextInput
                  id="alloc-hours"
                  label="Hours"
                  type="number"
                  min={0}
                  step={0.5}
                  value={hoursPerWeek}
                  onChange={(e) => setHoursPerWeek(e.target.value)}
                  onFocus={(e) => e.target.select()}
                />
              </div>
            ) : (
              <div className="mt-4 w-24">
                <ModalTextInput
                  id="alloc-percent"
                  label="Percent"
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  onFocus={(e) => e.target.select()}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="flex-[2]"
            >
              {submitting ? "Adding…" : "Add"}
            </Button>
          </div>
        </form>
    </Dialog>
  );
}
