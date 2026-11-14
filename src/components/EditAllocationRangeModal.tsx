"use client";

import { useState, useEffect } from "react";
import {
  createAllocations,
  updateAllocation,
  type CreateAllocationInput,
} from "@/lib/allocationsClient";
import {
  revalidateAllocationPage,
  logAllocationHistoryUpdate,
  logBulkAllocationHistory,
  deleteAllocationWithHistory,
} from "@/app/(app)/allocation/actions";
import {
  Button,
  Dialog,
  ModalReadonlyField,
  ModalTextInput,
  modalSegmentedButtonClass,
  modalSegmentedGroupClass,
} from "@/components/ui";
import { TO_PLAN_CONSULTANT_ID } from "@/lib/allocationPageTypes";

export type EditAllocationRangeWeek = {
  year: number;
  week: number;
  allocationId: string | null;
  currentHours: number;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Single number = same hours for all weeks (hours mode). Array = per-week hours (percent mode). */
  onSuccess: (savedHours: number | { year: number; week: number; hours: number }[]) => void;
  consultantId: string;
  consultantName: string;
  projectId: string;
  projectLabel: string;
  roleId: string | null;
  roleName?: string;
  weeks: EditAllocationRangeWeek[];
  availableHoursByWeek: number[];
};

export function EditAllocationRangeModal({
  isOpen,
  onClose,
  onSuccess,
  consultantId,
  consultantName,
  projectId,
  projectLabel,
  roleId,
  roleName,
  weeks,
  availableHoursByWeek,
}: Props) {
  const [inputMode, setInputMode] = useState<"hours" | "percent">("hours");
  const [hoursStr, setHoursStr] = useState("");
  const [percentStr, setPercentStr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const firstAvailable = availableHoursByWeek[0] ?? 0;

  useEffect(() => {
    if (isOpen && weeks.length > 0) {
      const first = weeks[0];
      const h = first.currentHours;
      setHoursStr(String(h));
      setPercentStr(
        firstAvailable > 0 ? String(Math.round((h / firstAvailable) * 100)) : ""
      );
      setError(null);
    }
  }, [isOpen, weeks, firstAvailable]);

  const hoursFromInput = (): number => {
    if (inputMode === "hours") {
      const h = parseFloat(hoursStr.replace(",", "."));
      return Number.isNaN(h) || h < 0 ? -1 : h;
    }
    const p = parseFloat(percentStr.replace(",", "."));
    if (Number.isNaN(p) || p < 0 || p > 100) return -1;
    if (firstAvailable <= 0) return 0;
    return (p / 100) * firstAvailable;
  };

  const displayPercent = (): string => {
    const h = parseFloat(hoursStr.replace(",", "."));
    if (Number.isNaN(h) || h < 0 || firstAvailable <= 0) return "—";
    return String(Math.round((h / firstAvailable) * 100));
  };

  async function applyWeekHours(
    consultantIdOrNull: string | null,
    hoursByWeek: number[]
  ): Promise<void> {
    const toDelete: string[] = [];
    const toUpdate: { id: string; hours: number }[] = [];
    const toCreate: CreateAllocationInput[] = [];

    for (let i = 0; i < weeks.length; i++) {
      const w = weeks[i]!;
      const hours = hoursByWeek[i] ?? 0;
      if (hours === 0) {
        if (w.allocationId) toDelete.push(w.allocationId);
      } else if (w.allocationId) {
        toUpdate.push({ id: w.allocationId, hours });
      } else {
        toCreate.push({
          consultant_id: consultantIdOrNull,
          project_id: projectId,
          role_id: roleId ?? undefined,
          year: w.year,
          week: w.week,
          hours,
        });
      }
    }

    await Promise.all([
      ...toDelete.map((id) => deleteAllocationWithHistory(id)),
      ...toUpdate.map(async ({ id, hours }) => {
        await updateAllocation(id, { hours });
        await logAllocationHistoryUpdate(id, hours);
      }),
    ]);

    if (toCreate.length > 0) {
      const created = await createAllocations(toCreate);
      await logBulkAllocationHistory(
        created.map((r) => r.id),
        created.reduce((sum, r) => sum + r.hours, 0)
      );
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const consultantIdOrNull =
      consultantId === TO_PLAN_CONSULTANT_ID ? null : consultantId;

    if (inputMode === "hours") {
      const hours = hoursFromInput();
      if (hours < 0) {
        setError("Enter a valid number of hours (≥ 0).");
        return;
      }
      setError(null);
      setSubmitting(true);
      try {
        await applyWeekHours(
          consultantIdOrNull,
          weeks.map(() => hours)
        );
        await revalidateAllocationPage();
        onSuccess(hours);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const p = parseFloat(percentStr.replace(",", "."));
    if (Number.isNaN(p) || p < 0 || p > 100) {
      setError("Enter a valid percent (0–100).");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const hoursPerWeek = weeks.map((_, i) => {
        const available = availableHoursByWeek[i] ?? 0;
        return (p / 100) * available;
      });
      await applyWeekHours(consultantIdOrNull, hoursPerWeek);
      await revalidateAllocationPage();
      onSuccess(
        weeks.map((w, i) => ({ year: w.year, week: w.week, hours: hoursPerWeek[i] ?? 0 }))
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setError(null);
      onClose();
    }
  };

  if (weeks.length === 0) return null;

  const weekRangeLabel =
    weeks.length === 1
      ? `W${weeks[0].week}, ${weeks[0].year}`
      : weeks[0].year !== weeks[weeks.length - 1].year
        ? `W${weeks[0].week} ${weeks[0].year} – W${weeks[weeks.length - 1].week} ${weeks[weeks.length - 1].year}`
        : `W${weeks[0].week}–W${weeks[weeks.length - 1].week}, ${weeks[0].year}`;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange} title="Edit allocation">
      <form onSubmit={handleSubmit} className="modal-form-discreet mt-4 space-y-3">
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <ModalReadonlyField label="Consultant">{consultantName}</ModalReadonlyField>
        <ModalReadonlyField label="Project">{projectLabel}</ModalReadonlyField>
        {roleName != null && roleName !== "" ? (
          <ModalReadonlyField label="Role">{roleName}</ModalReadonlyField>
        ) : null}
        <ModalReadonlyField label="Weeks">{weekRangeLabel}</ModalReadonlyField>

        <div className={modalSegmentedGroupClass} role="group" aria-label="Input mode">
          <button
            type="button"
            aria-pressed={inputMode === "hours"}
            onClick={() => setInputMode("hours")}
            className={modalSegmentedButtonClass(inputMode === "hours")}
          >
            Hours
          </button>
          <button
            type="button"
            aria-pressed={inputMode === "percent"}
            onClick={() => setInputMode("percent")}
            className={modalSegmentedButtonClass(inputMode === "percent")}
          >
            %
          </button>
        </div>

        {inputMode === "hours" ? (
          <div className="w-24">
            <ModalTextInput
              id="edit-range-hours"
              label="Hours per week"
              type="number"
              min={0}
              step={0.5}
              value={hoursStr}
              onChange={(e) => setHoursStr(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
            {firstAvailable > 0 && (
              <p className="mt-1 text-[12px] text-text-tertiary">
                ≈ {displayPercent()}% of capacity (w{weeks[0].week})
              </p>
            )}
          </div>
        ) : (
          <div className="w-24">
            <ModalTextInput
              id="edit-range-percent"
              label={`Percent of capacity (w${weeks[0].week})`}
              type="number"
              min={0}
              max={100}
              step={5}
              value={percentStr}
              onChange={(e) => setPercentStr(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
            {firstAvailable > 0 && percentStr !== "" && !Number.isNaN(parseFloat(percentStr)) && (
              <p className="mt-1 text-[12px] text-text-tertiary">
                ≈ {((parseFloat(percentStr.replace(",", ".")) / 100) * firstAvailable).toFixed(1)} h
              </p>
            )}
          </div>
        )}

        <p className="text-[12px] text-text-tertiary">
          Set 0 to remove allocation in all selected weeks.
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
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
