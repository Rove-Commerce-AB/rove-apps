"use client";

import { useState, useEffect } from "react";
import { updateConsultant } from "@/lib/consultantsClient";
import { deleteConsultantAction } from "@/app/(app)/consultants/actions";
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
import { getRoles } from "@/lib/rolesClient";
import { getCalendars } from "@/lib/calendarsClient";
import { getTeams } from "@/lib/teamsClient";
import type { ConsultantWithDetails } from "@/types";

const WORK_PERCENTAGE_OPTIONS = Array.from(
  { length: 20 },
  (_, i) => (i + 1) * 5
); // 5, 10, ..., 100

const OVERHEAD_PERCENTAGE_OPTIONS = Array.from(
  { length: 21 },
  (_, i) => i * 5
); // 0, 5, 10, ..., 100

type Props = {
  consultant: ConsultantWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  isAdmin?: boolean;
};

export function EditConsultantModal({
  consultant,
  isOpen,
  onClose,
  onSuccess,
  isAdmin = false,
}: Props) {
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [email, setEmail] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [workPercentage, setWorkPercentage] = useState(100);
  const [overheadPercentage, setOverheadPercentage] = useState(0);
  const [isExternal, setIsExternal] = useState(false);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [calendars, setCalendars] = useState<
    { id: string; name: string; hours_per_week: number }[]
  >([]);
  const [optionsReady, setOptionsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen && consultant) {
      setName(consultant.name);
      setEmail(consultant.email ?? "");
      setWorkPercentage(consultant.workPercentage ?? 100);
      setOverheadPercentage(consultant.overheadPercentage ?? 0);
      setIsExternal(consultant.isExternal ?? false);
      setOptionsReady(false);
      Promise.all([getRoles(), getCalendars(), getTeams()])
        .then(([r, c, t]) => {
          setRoles(r);
          setCalendars(c);
          setTeams(t);
          setRoleId(consultant.role_id ?? "");
          setCalendarId(consultant.calendar_id ?? "");
          setTeamId(consultant.team_id ?? null);
          setOptionsReady(true);
        })
        .catch(() => {
          setRoles([]);
          setCalendars([]);
          setTeams([]);
          setRoleId(consultant.role_id ?? "");
          setCalendarId(consultant.calendar_id ?? "");
          setTeamId(consultant.team_id ?? null);
          setOptionsReady(true);
        });
    }
  }, [isOpen, consultant]);

  const handleSubmit = async () => {
    if (!consultant) return;
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!roleId) {
      setError("Default role is required");
      return;
    }
    if (!calendarId) {
      setError("Calendar is required");
      return;
    }
    setSubmitting(true);
    try {
      await updateConsultant(consultant.id, {
        name: name.trim(),
        email: email.trim() || null,
        role_id: roleId,
        calendar_id: calendarId,
        team_id: teamId ?? null,
        work_percentage: workPercentage,
        overhead_percentage: overheadPercentage,
        is_external: isExternal,
      });
      resetForm();
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update consultant");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!consultant) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteConsultantAction(consultant.id);
      setShowDeleteConfirm(false);
      resetForm();
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete consultant");
    } finally {
      setDeleting(false);
    }
  };

  const resetForm = () => {
    setName("");
    setRoleId("");
    setEmail("");
    setCalendarId("");
    setTeamId(null);
    setWorkPercentage(100);
    setOverheadPercentage(0);
    setIsExternal(false);
    setOptionsReady(false);
    setError(null);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm();
      onClose();
    }
  };

  if (!consultant) return null;

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        title="Edit consultant"
        contentClassName="max-h-[90vh] overflow-y-auto"
      >
        <form
          id="edit-consultant-form"
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
            id="edit-consultant-name"
            label="Name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Anna Andersson"
          />

          <ModalField id="edit-consultant-role" label="Default role">
            <Select
              key={`role-${optionsReady}-${roleId}`}
              id="edit-consultant-role"
              value={roleId}
              onValueChange={setRoleId}
              placeholder="Select role"
              variant="modal"
              options={(() => {
                const base = roles.map((r) => ({ value: r.id, label: r.name }));
                if (roleId && consultant.roleName && !base.some((o) => o.value === roleId)) {
                  return [{ value: roleId, label: consultant.roleName }, ...base];
                }
                return base;
              })()}
              triggerClassName={modalSelectTriggerClass}
            />
          </ModalField>

          <ModalTextInput
            id="edit-consultant-email"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="anna@company.com"
          />

          <ModalField id="edit-consultant-calendar" label="Calendar">
            <Select
              key={`calendar-${optionsReady}-${calendarId}`}
              id="edit-consultant-calendar"
              value={calendarId}
              onValueChange={setCalendarId}
              placeholder="Select calendar"
              variant="modal"
              options={(() => {
                const base = calendars.map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.hours_per_week}h/week)`,
                }));
                if (calendarId && consultant.calendarName && !base.some((o) => o.value === calendarId)) {
                  return [{ value: calendarId, label: consultant.calendarName }, ...base];
                }
                return base;
              })()}
              triggerClassName={modalSelectTriggerClass}
            />
          </ModalField>

          <ModalField id="edit-consultant-work-percentage" label="Capacity (%)">
            <Select
              id="edit-consultant-work-percentage"
              value={String(workPercentage)}
              onValueChange={(v) => setWorkPercentage(parseInt(v, 10))}
              placeholder="Select"
              variant="modal"
              options={WORK_PERCENTAGE_OPTIONS.map((p) => ({
                value: String(p),
                label: `${p}%`,
              }))}
              triggerClassName={modalSelectTriggerClass}
            />
          </ModalField>

          <ModalField id="edit-consultant-overhead" label="Overhead (%)">
            <Select
              id="edit-consultant-overhead"
              value={String(overheadPercentage)}
              onValueChange={(v) => setOverheadPercentage(parseInt(v, 10))}
              placeholder="Select"
              variant="modal"
              options={OVERHEAD_PERCENTAGE_OPTIONS.map((p) => ({
                value: String(p),
                label: `${p}%`,
              }))}
              triggerClassName={modalSelectTriggerClass}
            />
          </ModalField>

          <ModalField id="edit-consultant-team" label="Team (optional)">
            <Select
              id="edit-consultant-team"
              value={teamId ?? ""}
              onValueChange={(v) => setTeamId(v ? v : null)}
              placeholder="No team"
              variant="modal"
              options={[
                { value: "", label: "No team" },
                ...(teamId && consultant.teamName && !teams.some((t) => t.id === teamId)
                  ? [{ value: teamId, label: consultant.teamName }]
                  : []),
                ...teams.map((t) => ({ value: t.id, label: t.name })),
              ]}
              triggerClassName={modalSelectTriggerClass}
            />
          </ModalField>

          <Switch
            id="edit-consultant-external"
            checked={isExternal}
            onCheckedChange={setIsExternal}
            label="External consultant"
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
              form="edit-consultant-form"
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
          title="Delete consultant"
          message={`Delete ${consultant?.name}? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
