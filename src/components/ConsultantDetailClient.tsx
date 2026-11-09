"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { updateConsultant } from "@/lib/consultantsClient";
import { deleteConsultantAction } from "@/app/(app)/consultants/actions";
import { ROUTES } from "@/lib/routes";
import type { ConsultantForEdit } from "@/lib/consultantsClient";
import {
  ConfirmModal,
  DetailPageHeader,
  DetailFieldStack,
  DrawerFieldRow,
  DrawerSelectField,
  FieldValue,
  InlineEditFieldContainer,
  InlineEditStatus,
  InlineEditTrigger,
  OptionSegments,
  Panel,
  PanelSectionTitle,
  Select,
  CapacityBar,
  SAVED_DURATION_MS,
  editInputClass,
  editTriggerClass,
} from "@/components/ui";
import { getRoles } from "@/lib/rolesClient";
import { getCalendars } from "@/lib/calendarsClient";
import { getTeams } from "@/lib/teamsClient";
import { isInlineEditValueChanged } from "@/lib/inlineEdit";
import { DetailPageDeleteFooter } from "./detail/DetailPageDeleteFooter";

const WORK_PERCENTAGE_OPTIONS = Array.from(
  { length: 20 },
  (_, i) => (i + 1) * 5
);

const OVERHEAD_PERCENTAGE_OPTIONS = Array.from(
  { length: 21 },
  (_, i) => i * 5
); // 0, 5, ..., 100

type EditField =
  | "name"
  | "email"
  | "role"
  | "calendar"
  | "workPercentage"
  | "overheadPercentage"
  | "team"
  | "startDate"
  | "endDate"
  | "birthDate"
  | "employmentNumber"
  | null;

type Props = {
  consultant: ConsultantForEdit;
  isAdmin?: boolean;
  /** When true, skip the page header (the SideDrawer already shows the name). */
  embedded?: boolean;
  /** Account identity is managed on People > Overview for linked users. */
  hideIdentityFields?: boolean;
  /** Destination after deleting an embedded consultant profile. */
  afterDeleteHref?: string;
  deleteLabel?: string;
  deleteTitle?: string;
  deleteMessage?: string;
  deleteConfirmLabel?: string;
  /** Hide delete UI (e.g. when People drawer shows it under Danger). */
  hideDelete?: boolean;
};

function ConsultantField({
  embedded,
  label,
  variant = "field",
  children,
}: {
  embedded: boolean;
  label: string;
  variant?: "field" | "summary";
  children: ReactNode;
}) {
  if (embedded) {
    return (
      <DrawerFieldRow label={label} variant={variant}>
        {children}
      </DrawerFieldRow>
    );
  }
  return <DetailFieldStack label={label}>{children}</DetailFieldStack>;
}

function ConsultantValue({
  embedded,
  children,
  className = "",
}: {
  embedded: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (embedded) {
    return <span className={`truncate ${className}`.trim()}>{children}</span>;
  }
  return <FieldValue className={className}>{children}</FieldValue>;
}

export function ConsultantDetailClient({
  consultant: initial,
  isAdmin = false,
  embedded = false,
  hideIdentityFields = false,
  afterDeleteHref = ROUTES.consultants,
  deleteLabel = "Delete consultant",
  deleteTitle = "Delete consultant",
  deleteMessage,
  deleteConfirmLabel = "Delete",
  hideDelete = false,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [roleId, setRoleId] = useState(initial.role_id);
  const [email, setEmail] = useState(initial.email ?? "");
  const [calendarId, setCalendarId] = useState(initial.calendar_id);
  const [teamId, setTeamId] = useState<string | null>(initial.team_id);
  const [workPercentage, setWorkPercentage] = useState(initial.workPercentage);
  const [overheadPercentage, setOverheadPercentage] = useState(initial.overheadPercentage);
  const [startDate, setStartDate] = useState(initial.startDate ?? "");
  const [endDate, setEndDate] = useState(initial.endDate ?? "");
  const [birthDate, setBirthDate] = useState(initial.birthDate ?? "");
  const [employmentNumber, setEmploymentNumber] = useState(
    initial.employmentNumber ?? ""
  );
  const [isExternal, setIsExternal] = useState(initial.isExternal);
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
  const [editingField, setEditingField] = useState<EditField>(null);
  const [editValue, setEditValue] = useState<string>("");
  const originalEditValueRef = useRef<string>("");
  const [showSaved, setShowSaved] = useState(false);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedFieldRef = useRef<EditField>(null);

  const syncFromInitial = useCallback(() => {
    setName(initial.name);
    setRoleId(initial.role_id);
    setEmail(initial.email ?? "");
    setCalendarId(initial.calendar_id);
    setTeamId(initial.team_id);
    setWorkPercentage(initial.workPercentage);
    setOverheadPercentage(initial.overheadPercentage);
    setStartDate(initial.startDate ?? "");
    setEndDate(initial.endDate ?? "");
    setBirthDate(initial.birthDate ?? "");
    setEmploymentNumber(initial.employmentNumber ?? "");
    setIsExternal(initial.isExternal);
  }, [initial]);

  useEffect(() => {
    syncFromInitial();
  }, [syncFromInitial]);

  useEffect(() => {
    setOptionsReady(false);
    Promise.all([getRoles(), getCalendars(), getTeams()])
      .then(([r, c, t]) => {
        setRoles(r);
        setCalendars(c);
        setTeams(t);
        setOptionsReady(true);
      })
      .catch(() => setOptionsReady(true));
  }, []);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  const saveField = async (field: EditField, value: string) => {
    if (field == null) return;
    setError(null);
    const trimmed = value.trim();
    switch (field) {
      case "name":
        setName(trimmed);
        break;
      case "email":
        setEmail(trimmed);
        break;
      case "role":
        setRoleId(value);
        break;
      case "calendar":
        setCalendarId(value);
        break;
      case "workPercentage":
        setWorkPercentage(parseInt(value, 10));
        break;
      case "overheadPercentage":
        setOverheadPercentage(parseInt(value, 10));
        break;
      case "team":
        setTeamId(value || null);
        break;
      case "startDate":
        setStartDate(trimmed);
        break;
      case "endDate":
        setEndDate(trimmed);
        break;
      case "birthDate":
        setBirthDate(trimmed);
        break;
      case "employmentNumber":
        setEmploymentNumber(trimmed);
        break;
      default:
        break;
    }
    lastSavedFieldRef.current = field;
    setEditingField(null);
    setShowSaved(true);
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    savedTimeoutRef.current = setTimeout(() => {
      savedTimeoutRef.current = null;
      lastSavedFieldRef.current = null;
      setShowSaved(false);
    }, SAVED_DURATION_MS);
    setSubmitting(true);
    try {
      switch (field) {
        case "name":
          await updateConsultant(initial.id, { name: trimmed });
          break;
        case "email":
          await updateConsultant(initial.id, { email: trimmed || null });
          break;
        case "role":
          await updateConsultant(initial.id, { role_id: value });
          break;
        case "calendar":
          await updateConsultant(initial.id, { calendar_id: value });
          break;
        case "workPercentage":
          await updateConsultant(initial.id, { work_percentage: parseInt(value, 10) });
          break;
        case "overheadPercentage":
          await updateConsultant(initial.id, { overhead_percentage: parseInt(value, 10) });
          break;
        case "team":
          await updateConsultant(initial.id, { team_id: value || null });
          break;
        case "startDate":
          await updateConsultant(initial.id, { start_date: trimmed || null });
          break;
        case "endDate":
          await updateConsultant(initial.id, { end_date: trimmed || null });
          break;
        case "birthDate":
          await updateConsultant(initial.id, { birth_date: trimmed || null });
          break;
        case "employmentNumber":
          await updateConsultant(initial.id, {
            employment_number: trimmed || null,
          });
          break;
        default:
          break;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
      setShowSaved(false);
      lastSavedFieldRef.current = null;
      switch (field) {
        case "name": setName(initial.name); break;
        case "email": setEmail(initial.email ?? ""); break;
        case "role": setRoleId(initial.role_id); break;
        case "calendar": setCalendarId(initial.calendar_id); break;
        case "team": setTeamId(initial.team_id); break;
        case "workPercentage": setWorkPercentage(initial.workPercentage); break;
        case "overheadPercentage": setOverheadPercentage(initial.overheadPercentage); break;
        case "startDate": setStartDate(initial.startDate ?? ""); break;
        case "endDate": setEndDate(initial.endDate ?? ""); break;
        case "birthDate": setBirthDate(initial.birthDate ?? ""); break;
        case "employmentNumber":
          setEmploymentNumber(initial.employmentNumber ?? "");
          break;
        default: break;
      }
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (field: EditField, value: string) => {
    setError(null);
    originalEditValueRef.current = value;
    setEditValue(value);
    setEditingField(field);
  };

  const cancelEdit = () => {
    setEditValue(originalEditValueRef.current);
    setEditingField(null);
    setError(null);
  };

  const commitEdit = (overrideValue?: string) => {
    if (editingField == null) return;
    const val = overrideValue ?? editValue;
    if (!isInlineEditValueChanged(originalEditValueRef.current, val)) {
      setEditingField(null);
      return;
    }
    saveField(editingField, val);
  };

  const inlineEditStatus =
    submitting ? "saving" : showSaved ? "saved" : error ? "error" : "idle";

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      await deleteConsultantAction(initial.id);
      setShowDeleteConfirm(false);
      router.push(afterDeleteHref);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const setExternal = async (next: boolean) => {
    if (next === isExternal) return;
    setError(null);
    setSubmitting(true);
    try {
      await updateConsultant(initial.id, { is_external: next });
      setIsExternal(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSubmitting(false);
    }
  };

  const initials = initial.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const roleOptions = (() => {
    const base = roles.map((r) => ({ value: r.id, label: r.name }));
    if (roleId && initial.roleName && !base.some((o) => o.value === roleId)) {
      return [{ value: roleId, label: initial.roleName }, ...base];
    }
    return base;
  })();

  const calendarOptions = (() => {
    const base = calendars.map((c) => ({
      value: c.id,
      label: `${c.name} (${c.hours_per_week}h/week)`,
    }));
    if (
      calendarId &&
      initial.calendarName &&
      !base.some((o) => o.value === calendarId)
    ) {
      return [{ value: calendarId, label: initial.calendarName }, ...base];
    }
    return base;
  })();

  const teamOptions = [
    { value: "", label: "No team" },
    ...(teamId && initial.teamName && !teams.some((t) => t.id === teamId)
      ? [{ value: teamId, label: initial.teamName }]
      : []),
    ...teams.map((t) => ({ value: t.id, label: t.name })),
  ];

  const hoursPerWeek =
    calendars.find((c) => c.id === calendarId)?.hours_per_week ?? 40;
  const dateTriggerClass = embedded ? "" : "text-brand-signal";

  const nameField = (
    <ConsultantField embedded={embedded} label="Name">
      <InlineEditFieldContainer
        isEditing={editingField === "name"}
        onRequestClose={commitEdit}
        hideAccessory={embedded}
        reserveStatusRow={!embedded}
        showSavedIndicator={showSaved && lastSavedFieldRef.current === "name"}
        displayContent={
          <InlineEditTrigger boxed={embedded} onClick={() => startEdit("name", name)}>
            <ConsultantValue embedded={embedded}>{name}</ConsultantValue>
          </InlineEditTrigger>
        }
        editContent={
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={() => commitEdit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            className={editInputClass}
            autoFocus
          />
        }
        statusContent={<InlineEditStatus status={inlineEditStatus} message={error} />}
      />
    </ConsultantField>
  );

  const teamField = (
    <ConsultantField embedded={embedded} label="Team">
      {embedded ? (
        <DrawerSelectField
          value={teamId ?? ""}
          onValueChange={(value) => {
            if (!isInlineEditValueChanged(teamId ?? "", value)) return;
            void saveField("team", value);
          }}
          options={teamOptions}
          placeholder="No team"
          isLoading={!optionsReady}
        />
      ) : (
        <InlineEditFieldContainer
          isEditing={editingField === "team"}
          onRequestClose={commitEdit}
          hideAccessory={embedded}
          reserveStatusRow={!embedded}
          showSavedIndicator={showSaved && lastSavedFieldRef.current === "team"}
          displayContent={
            <InlineEditTrigger
              boxed={embedded}
              showChevron={embedded}
              onClick={() => startEdit("team", teamId ?? "")}
            >
              <ConsultantValue embedded={embedded}>
                {teamOptions.find((o) => o.value === (teamId ?? ""))?.label ??
                  initial.teamName ??
                  "—"}
              </ConsultantValue>
            </InlineEditTrigger>
          }
          editContent={
            <Select
              value={editValue}
              onValueChange={(v) => {
                setEditValue(v);
                commitEdit(v);
              }}
              onBlur={() => commitEdit()}
              variant="inlineEdit"
              options={teamOptions}
              placeholder="No team"
              className="min-w-0 flex-1 w-full"
              triggerClassName={editTriggerClass}
            />
          }
          statusContent={<InlineEditStatus status={inlineEditStatus} message={error} />}
        />
      )}
    </ConsultantField>
  );

  const roleField = (
    <ConsultantField embedded={embedded} label="Role">
      {embedded ? (
        <DrawerSelectField
          value={roleId}
          onValueChange={(value) => {
            if (!isInlineEditValueChanged(roleId, value)) return;
            void saveField("role", value);
          }}
          options={roleOptions}
          placeholder="Select role"
          isLoading={!optionsReady}
        />
      ) : (
        <InlineEditFieldContainer
          isEditing={editingField === "role"}
          onRequestClose={commitEdit}
          hideAccessory={embedded}
          reserveStatusRow={!embedded}
          showSavedIndicator={showSaved && lastSavedFieldRef.current === "role"}
          displayContent={
            <InlineEditTrigger
              boxed={embedded}
              showChevron={embedded}
              onClick={() => startEdit("role", roleId)}
            >
              <ConsultantValue embedded={embedded}>
                {roleOptions.find((o) => o.value === roleId)?.label ?? initial.roleName ?? "—"}
              </ConsultantValue>
            </InlineEditTrigger>
          }
          editContent={
            <Select
              value={editValue}
              onValueChange={(v) => {
                setEditValue(v);
                commitEdit(v);
              }}
              onBlur={() => commitEdit()}
              variant="inlineEdit"
              options={roleOptions}
              placeholder="Select role"
              className="min-w-0 flex-1 w-full"
              triggerClassName={editTriggerClass}
            />
          }
          statusContent={<InlineEditStatus status={inlineEditStatus} message={error} />}
        />
      )}
    </ConsultantField>
  );

  const emailField = (
    <ConsultantField embedded={embedded} label="Email">
      <InlineEditFieldContainer
        isEditing={editingField === "email"}
        onRequestClose={commitEdit}
        hideAccessory={embedded}
        reserveStatusRow={!embedded}
        showSavedIndicator={showSaved && lastSavedFieldRef.current === "email"}
        displayContent={
          <InlineEditTrigger
            boxed={embedded}
            className={email ? "" : "text-text-primary opacity-70"}
            onClick={() => startEdit("email", email)}
          >
            <ConsultantValue embedded={embedded} className={email ? "text-text-link" : ""}>
              {email || "—"}
            </ConsultantValue>
          </InlineEditTrigger>
        }
        editContent={
          <input
            type="email"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={() => commitEdit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            className={editInputClass}
            autoFocus
          />
        }
        statusContent={<InlineEditStatus status={inlineEditStatus} message={error} />}
      />
    </ConsultantField>
  );

  const calendarTimeField = (
    <ConsultantField embedded={embedded} label="Calendar time" variant="summary">
      <span className="text-sm font-medium tabular-nums text-text-primary">{hoursPerWeek}h</span>
    </ConsultantField>
  );

  const capacityField = (
    <ConsultantField embedded={embedded} label="Capacity" variant={embedded ? "summary" : "field"}>
      <InlineEditFieldContainer
        isEditing={editingField === "workPercentage"}
        onRequestClose={commitEdit}
        hideAccessory={embedded}
        reserveStatusRow={!embedded}
        className={embedded ? "w-[14.5rem]" : ""}
        showSavedIndicator={showSaved && lastSavedFieldRef.current === "workPercentage"}
        displayContent={
          embedded ? (
            <button
              type="button"
              onClick={() => startEdit("workPercentage", String(workPercentage))}
              className="flex cursor-pointer items-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-inset"
            >
              <CapacityBar value={workPercentage} size="drawer" />
            </button>
          ) : (
            <InlineEditTrigger onClick={() => startEdit("workPercentage", String(workPercentage))}>
              <FieldValue>{workPercentage}%</FieldValue>
            </InlineEditTrigger>
          )
        }
        editContent={
          <Select
            value={editValue}
            onValueChange={(v) => {
              setEditValue(v);
              commitEdit(v);
            }}
            onBlur={() => commitEdit()}
            defaultOpen={embedded}
            variant="inlineEdit"
            options={WORK_PERCENTAGE_OPTIONS.map((p) => ({
              value: String(p),
              label: `${p}%`,
            }))}
            placeholder="Select"
            className="min-w-0 w-full flex-1"
            triggerClassName={editTriggerClass}
          />
        }
        statusContent={<InlineEditStatus status={inlineEditStatus} message={error} />}
      />
    </ConsultantField>
  );

  const overheadField = (
    <ConsultantField embedded={embedded} label={embedded ? "Overhead" : "Overhead (%)"} variant={embedded ? "summary" : "field"}>
      <InlineEditFieldContainer
        isEditing={editingField === "overheadPercentage"}
        onRequestClose={commitEdit}
        hideAccessory={embedded}
        reserveStatusRow={!embedded}
        className={embedded ? "w-[14.5rem]" : ""}
        showSavedIndicator={showSaved && lastSavedFieldRef.current === "overheadPercentage"}
        displayContent={
          embedded ? (
            <button
              type="button"
              onClick={() =>
                startEdit("overheadPercentage", String(overheadPercentage ?? 0))
              }
              className="flex cursor-pointer items-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-inset"
            >
              <CapacityBar value={overheadPercentage ?? 0} size="drawer" />
            </button>
          ) : (
            <InlineEditTrigger
              onClick={() =>
                startEdit("overheadPercentage", String(overheadPercentage ?? 0))
              }
            >
              <FieldValue>{overheadPercentage ?? 0}%</FieldValue>
            </InlineEditTrigger>
          )
        }
        editContent={
          <Select
            value={editValue}
            onValueChange={(v) => {
              setEditValue(v);
              commitEdit(v);
            }}
            onBlur={() => commitEdit()}
            defaultOpen={embedded}
            variant="inlineEdit"
            options={OVERHEAD_PERCENTAGE_OPTIONS.map((p) => ({
              value: String(p),
              label: `${p}%`,
            }))}
            placeholder="Select"
            className="min-w-0 flex-1 w-full"
            triggerClassName={editTriggerClass}
          />
        }
        statusContent={<InlineEditStatus status={inlineEditStatus} message={error} />}
      />
    </ConsultantField>
  );

  const startDateField = (
    <ConsultantField embedded={embedded} label="Start date">
      <InlineEditFieldContainer
        isEditing={editingField === "startDate"}
        onRequestClose={commitEdit}
        hideAccessory={embedded}
        reserveStatusRow={!embedded}
        showSavedIndicator={showSaved && lastSavedFieldRef.current === "startDate"}
        displayContent={
          <InlineEditTrigger
            boxed={embedded}
            className={embedded || !startDate ? "" : dateTriggerClass}
            onClick={() => startEdit("startDate", startDate)}
          >
            <ConsultantValue embedded={embedded} className={!startDate ? "opacity-70" : ""}>
              {startDate || "—"}
            </ConsultantValue>
          </InlineEditTrigger>
        }
        editContent={
          <input
            type="date"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={() => commitEdit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            className={editInputClass}
            autoFocus
          />
        }
        statusContent={<InlineEditStatus status={inlineEditStatus} message={error} />}
      />
    </ConsultantField>
  );

  const endDateField = (
    <ConsultantField embedded={embedded} label="End date">
      <InlineEditFieldContainer
        isEditing={editingField === "endDate"}
        onRequestClose={commitEdit}
        hideAccessory={embedded}
        reserveStatusRow={!embedded}
        showSavedIndicator={showSaved && lastSavedFieldRef.current === "endDate"}
        displayContent={
          <InlineEditTrigger
            boxed={embedded}
            className={embedded || !endDate ? "" : dateTriggerClass}
            onClick={() => startEdit("endDate", endDate)}
          >
            <ConsultantValue embedded={embedded} className={!endDate ? "opacity-70" : ""}>
              {endDate || "—"}
            </ConsultantValue>
          </InlineEditTrigger>
        }
        editContent={
          <input
            type="date"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={() => commitEdit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            className={editInputClass}
            autoFocus
          />
        }
        statusContent={<InlineEditStatus status={inlineEditStatus} message={error} />}
      />
    </ConsultantField>
  );

  const birthDateField = (
    <ConsultantField embedded={embedded} label="Date of birth">
      <InlineEditFieldContainer
        isEditing={editingField === "birthDate"}
        onRequestClose={commitEdit}
        hideAccessory={embedded}
        reserveStatusRow={!embedded}
        showSavedIndicator={showSaved && lastSavedFieldRef.current === "birthDate"}
        displayContent={
          <InlineEditTrigger
            boxed={embedded}
            className={embedded || !birthDate ? "" : dateTriggerClass}
            onClick={() => startEdit("birthDate", birthDate)}
          >
            <ConsultantValue embedded={embedded} className={!birthDate ? "opacity-70" : ""}>
              {birthDate || "—"}
            </ConsultantValue>
          </InlineEditTrigger>
        }
        editContent={
          <input
            type="date"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={() => commitEdit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            className={editInputClass}
            autoFocus
          />
        }
        statusContent={<InlineEditStatus status={inlineEditStatus} message={error} />}
      />
    </ConsultantField>
  );

  const employmentNumberField = (
    <ConsultantField embedded={embedded} label="Employment number">
      <InlineEditFieldContainer
        isEditing={editingField === "employmentNumber"}
        onRequestClose={commitEdit}
        hideAccessory={embedded}
        reserveStatusRow={!embedded}
        showSavedIndicator={
          showSaved && lastSavedFieldRef.current === "employmentNumber"
        }
        displayContent={
          <InlineEditTrigger
            boxed={embedded}
            className={employmentNumber ? "" : "text-text-primary opacity-70"}
            onClick={() => startEdit("employmentNumber", employmentNumber)}
          >
            <ConsultantValue embedded={embedded}>
              {employmentNumber || "—"}
            </ConsultantValue>
          </InlineEditTrigger>
        }
        editContent={
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={() => commitEdit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            className={editInputClass}
            autoFocus
            placeholder="Fortnox anställningsnr"
          />
        }
        statusContent={<InlineEditStatus status={inlineEditStatus} message={error} />}
      />
    </ConsultantField>
  );

  const calendarField = (
    <ConsultantField embedded={embedded} label="Calendar">
      {embedded ? (
        <DrawerSelectField
          value={calendarId}
          onValueChange={(value) => {
            if (!isInlineEditValueChanged(calendarId, value)) return;
            void saveField("calendar", value);
          }}
          options={calendarOptions}
          placeholder="Select calendar"
          isLoading={!optionsReady}
        />
      ) : (
        <InlineEditFieldContainer
          isEditing={editingField === "calendar"}
          onRequestClose={commitEdit}
          hideAccessory={embedded}
          reserveStatusRow={!embedded}
          showSavedIndicator={showSaved && lastSavedFieldRef.current === "calendar"}
          displayContent={
            <InlineEditTrigger
              boxed={embedded}
              showChevron={embedded}
              onClick={() => startEdit("calendar", calendarId)}
            >
              <ConsultantValue embedded={embedded}>
                {calendarOptions.find((o) => o.value === calendarId)?.label ??
                  initial.calendarName ??
                  "—"}
              </ConsultantValue>
            </InlineEditTrigger>
          }
          editContent={
            <Select
              value={editValue}
              onValueChange={(v) => {
                setEditValue(v);
                commitEdit(v);
              }}
              onBlur={() => commitEdit()}
              variant="inlineEdit"
              options={calendarOptions}
              placeholder="Select calendar"
              className="min-w-0 flex-1 w-full"
              triggerClassName={editTriggerClass}
            />
          }
          statusContent={<InlineEditStatus status={inlineEditStatus} message={error} />}
        />
      )}
    </ConsultantField>
  );

  const typeField = (
    <ConsultantField embedded={embedded} label="Type">
      <OptionSegments
        name="Type"
        value={isExternal ? "external" : "internal"}
        onChange={(value) => void setExternal(value === "external")}
        disabled={submitting}
        options={[
          { value: "internal", label: "Internal" },
          { value: "external", label: "External" },
        ]}
      />
    </ConsultantField>
  );

  return (
    <>
      {!embedded && (
        <DetailPageHeader
          avatar={<span>{initials}</span>}
          title={name}
        />
      )}

      {error && (
        <p className="mb-4 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {embedded ? (
        <div className="flex min-h-full flex-1 flex-col">
          <div className="px-6 pt-4">
            {hideIdentityFields ? null : nameField}
            {teamField}
            {roleField}
            {hideIdentityFields ? null : emailField}
            {startDateField}
            {endDateField}
            {isAdmin ? birthDateField : null}
            {isAdmin ? employmentNumberField : null}
          </div>
          <div className="border-t border-border-subtle px-6">
            {calendarTimeField}
            {capacityField}
            {overheadField}
          </div>
          <div className="border-t border-border-subtle px-6">
            {calendarField}
            {typeField}
          </div>
          {isAdmin && !hideDelete ? (
            <div className="mt-auto border-t border-border-subtle px-6 pb-6 pt-2">
              <DetailPageDeleteFooter
                onRequestDelete={() => setShowDeleteConfirm(true)}
                disabled={submitting || deleting}
                label={deleteLabel}
                className="pt-2"
              />
            </div>
          ) : null}
        </div>
      ) : (
        <Panel>
          <PanelSectionTitle>GENERAL INFORMATION</PanelSectionTitle>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {nameField}
            {emailField}
            {roleField}
            {teamField}
            {capacityField}
            {overheadField}
            {startDateField}
            {endDateField}
            {isAdmin ? birthDateField : null}
            {isAdmin ? employmentNumberField : null}
            {calendarField}
            {typeField}
          </div>
        </Panel>
      )}

      {isAdmin && !embedded && !hideDelete && (
        <DetailPageDeleteFooter
          onRequestDelete={() => setShowDeleteConfirm(true)}
          disabled={submitting || deleting}
          label={deleteLabel}
          className="pt-4"
        />
      )}

      {isAdmin && !hideDelete && (
        <ConfirmModal
          isOpen={showDeleteConfirm}
          title={deleteTitle}
          message={
            deleteMessage ?? `Delete ${name}? This cannot be undone.`
          }
          confirmLabel={deleteConfirmLabel}
          variant="danger"
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
