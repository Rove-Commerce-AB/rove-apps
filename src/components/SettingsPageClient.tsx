"use client";

import dynamic from "next/dynamic";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { getRoles, deleteRole, updateRole } from "@/lib/rolesClient";
import { getTeams, deleteTeam, updateTeam } from "@/lib/teamsClient";
import { getCalendarsWithHolidayCount } from "@/lib/calendarsClient";
import {
  deleteTimeActivity,
  updateTimeActivity,
  type TimeActivity,
} from "@/lib/timeActivitiesClient";
import {
  IconButton,
  ConfirmModal,
  InlineEditStatus,
  ListAddAction,
  SavedCheckmark,
  PageHeader,
  Panel,
  PanelSectionTitle,
  Switch,
  SAVED_DURATION_MS,
  INLINE_EDIT_STATUS_ROW_MIN_H,
  editInputListClass,
  inlineEditTriggerListClassRowHover,
} from "@/components/ui";
import { isInlineEditValueChanged } from "@/lib/inlineEdit";

import { SettingsCalendarsSection } from "./settings/SettingsCalendarsSection";

const AddRoleModal = dynamic(() =>
  import("./AddRoleModal").then((mod) => mod.AddRoleModal)
);
const AddTeamModal = dynamic(() =>
  import("./AddTeamModal").then((mod) => mod.AddTeamModal)
);
const AddCalendarModal = dynamic(() =>
  import("./AddCalendarModal").then((mod) => mod.AddCalendarModal)
);
const AddTimeActivityModal = dynamic(() =>
  import("./AddTimeActivityModal").then((mod) => mod.AddTimeActivityModal)
);

type Props = {
  roles: Awaited<ReturnType<typeof getRoles>>;
  teams: Awaited<ReturnType<typeof getTeams>>;
  calendars: Awaited<ReturnType<typeof getCalendarsWithHolidayCount>>;
  activities: TimeActivity[];
  error: string | null;
};

export function SettingsPageClient({
  roles: initialRoles,
  teams: initialTeams,
  calendars: initialCalendars,
  activities: initialActivities,
  error,
}: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingRoleValue, setEditingRoleValue] = useState("");
  const [savingRole, setSavingRole] = useState(false);
  const [showSavedRole, setShowSavedRole] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const savedRoleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRoleIdRef = useRef<string | null>(null);
  const [addCalendarOpen, setAddCalendarOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamValue, setEditingTeamValue] = useState("");
  const [savingTeam, setSavingTeam] = useState(false);
  const [showSavedTeam, setShowSavedTeam] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const savedTeamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedTeamIdRef = useRef<string | null>(null);
  const [teamToDelete, setTeamToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [addActivityOpen, setAddActivityOpen] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(
    null
  );
  const [editingActivityValue, setEditingActivityValue] = useState("");
  const [savingActivity, setSavingActivity] = useState(false);
  const [showSavedActivity, setShowSavedActivity] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const savedActivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastSavedActivityIdRef = useRef<string | null>(null);
  const [activityToDelete, setActivityToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    return () => {
      if (savedRoleTimeoutRef.current) clearTimeout(savedRoleTimeoutRef.current);
      if (savedTeamTimeoutRef.current) clearTimeout(savedTeamTimeoutRef.current);
      if (savedActivityTimeoutRef.current) {
        clearTimeout(savedActivityTimeoutRef.current);
      }
    };
  }, []);

  const handleRoleDelete = async () => {
    if (!roleToDelete) return;
    try {
      await deleteRole(roleToDelete.id);
      setRoleToDelete(null);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete role");
    }
  };

  const handleTeamDelete = async () => {
    if (!teamToDelete) return;
    try {
      await deleteTeam(teamToDelete.id);
      setTeamToDelete(null);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete team");
    }
  };

  const handleActivityDelete = async () => {
    if (!activityToDelete) return;
    try {
      await deleteTimeActivity(activityToDelete.id);
      setActivityToDelete(null);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete activity");
    }
  };

  const handleSuccess = () => {
    router.refresh();
  };

  const saveActivityInline = async (originalName: string) => {
    if (!editingActivityId) return;
    if (!editingActivityValue.trim()) {
      setEditingActivityId(null);
      setEditingActivityValue("");
      return;
    }
    if (!isInlineEditValueChanged(originalName, editingActivityValue)) {
      setEditingActivityId(null);
      setEditingActivityValue("");
      return;
    }
    setSavingActivity(true);
    setActivityError(null);
    try {
      await updateTimeActivity(editingActivityId, {
        name: editingActivityValue.trim(),
      });
      lastSavedActivityIdRef.current = editingActivityId;
      setEditingActivityId(null);
      setEditingActivityValue("");
      setShowSavedActivity(true);
      if (savedActivityTimeoutRef.current) {
        clearTimeout(savedActivityTimeoutRef.current);
      }
      savedActivityTimeoutRef.current = setTimeout(() => {
        setShowSavedActivity(false);
      }, SAVED_DURATION_MS);
      router.refresh();
    } catch (e) {
      setActivityError(
        e instanceof Error ? e.message : "Failed to update activity"
      );
    } finally {
      setSavingActivity(false);
    }
  };

  const cancelActivityEdit = (originalName: string) => {
    setEditingActivityValue(originalName);
    setEditingActivityId(null);
    setActivityError(null);
  };

  /** Focus without scrolling the page/panel (autoFocus causes jump). */
  const focusInlineInput = (el: HTMLInputElement | null) => {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select();
  };

  const saveRoleInline = async (originalName: string) => {
    if (!editingRoleId) return;
    if (!editingRoleValue.trim()) {
      setEditingRoleId(null);
      setEditingRoleValue("");
      return;
    }
    if (!isInlineEditValueChanged(originalName, editingRoleValue)) {
      setEditingRoleId(null);
      setEditingRoleValue("");
      return;
    }
    setRoleError(null);
    const roleIdToSave = editingRoleId;
    const valueToSave = editingRoleValue.trim();
    lastSavedRoleIdRef.current = roleIdToSave;
    setEditingRoleId(null);
    setEditingRoleValue("");
    setShowSavedRole(true);
    if (savedRoleTimeoutRef.current) clearTimeout(savedRoleTimeoutRef.current);
    savedRoleTimeoutRef.current = setTimeout(() => {
      savedRoleTimeoutRef.current = null;
      lastSavedRoleIdRef.current = null;
      setShowSavedRole(false);
    }, SAVED_DURATION_MS);
    setSavingRole(true);
    try {
      await updateRole(roleIdToSave, valueToSave);
      router.refresh();
    } catch (e) {
      setRoleError(e instanceof Error ? e.message : "Failed to update role");
      setShowSavedRole(false);
      lastSavedRoleIdRef.current = null;
    } finally {
      setSavingRole(false);
    }
  };

  const cancelRoleEdit = (restoreName: string) => {
    setEditingRoleValue(restoreName);
    setEditingRoleId(null);
    setRoleError(null);
  };

  const saveTeamInline = async (originalName: string) => {
    if (!editingTeamId) return;
    if (!editingTeamValue.trim()) {
      setEditingTeamId(null);
      setEditingTeamValue("");
      return;
    }
    if (!isInlineEditValueChanged(originalName, editingTeamValue)) {
      setEditingTeamId(null);
      setEditingTeamValue("");
      return;
    }
    setTeamError(null);
    const teamIdToSave = editingTeamId;
    const valueToSave = editingTeamValue.trim();
    lastSavedTeamIdRef.current = teamIdToSave;
    setEditingTeamId(null);
    setEditingTeamValue("");
    setShowSavedTeam(true);
    if (savedTeamTimeoutRef.current) clearTimeout(savedTeamTimeoutRef.current);
    savedTeamTimeoutRef.current = setTimeout(() => {
      savedTeamTimeoutRef.current = null;
      lastSavedTeamIdRef.current = null;
      setShowSavedTeam(false);
    }, SAVED_DURATION_MS);
    setSavingTeam(true);
    try {
      await updateTeam(teamIdToSave, valueToSave);
      router.refresh();
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : "Failed to update team");
      setShowSavedTeam(false);
      lastSavedTeamIdRef.current = null;
    } finally {
      setSavingTeam(false);
    }
  };

  const cancelTeamEdit = (restoreName: string) => {
    setEditingTeamValue(restoreName);
    setEditingTeamId(null);
    setTeamError(null);
  };

  return (
    <>
      <PageHeader
        title="General"
        description="Manage calendars, roles, activities and system configuration"
        className="mb-6"
      />

      {error && (
        <p className="mb-4 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-5">
        <Panel>
          <PanelSectionTitle
            action={
              <ListAddAction
                label="Add role"
                onClick={() => setAddRoleOpen(true)}
              />
            }
          >
            ROLES
          </PanelSectionTitle>
          <div className="overflow-x-auto p-3 pt-0">
            <ul className="space-y-0.5">
              {initialRoles.map((role) => {
                const isEditing = editingRoleId === role.id;
                return (
                <li
                  key={role.id}
                  className="relative flex h-[2.25rem] items-center gap-4 rounded-md px-2 transition-colors hover:bg-bg-muted/50"
                >
                  <div className="flex min-h-[2rem] min-w-0 flex-1 items-center gap-2">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingRoleValue}
                        onChange={(e) => setEditingRoleValue(e.target.value)}
                        onBlur={() => saveRoleInline(role.name)}
                        className={editInputListClass}
                        ref={focusInlineInput}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRoleInline(role.name);
                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelRoleEdit(role.name);
                          }
                        }}
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setRoleError(null);
                            setEditingRoleId(role.id);
                            setEditingRoleValue(role.name);
                          }}
                          className={inlineEditTriggerListClassRowHover}
                        >
                          {role.name}
                        </button>
                        {showSavedRole && lastSavedRoleIdRef.current === role.id && <SavedCheckmark />}
                      </>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="pointer-events-none absolute left-2 top-full z-10 pt-0.5">
                      <div className={INLINE_EDIT_STATUS_ROW_MIN_H}>
                        <InlineEditStatus
                          status={
                            savingRole ? "saving" : showSavedRole ? "saved" : roleError ? "error" : "idle"
                          }
                          message={roleError}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className={`shrink-0 ${isEditing ? "invisible" : ""}`}>
                    <IconButton
                      variant="ghostDanger"
                      onClick={() => setRoleToDelete(role)}
                      aria-label={`Delete ${role.name}`}
                      tabIndex={isEditing ? -1 : undefined}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </li>
              );
              })}
            </ul>
          </div>
        </Panel>

        <Panel>
          <PanelSectionTitle
            action={
              <ListAddAction
                label="Add team"
                onClick={() => setAddTeamOpen(true)}
              />
            }
          >
            TEAMS
          </PanelSectionTitle>
          <div className="overflow-x-auto p-3 pt-0">
            <ul className="space-y-0.5">
              {initialTeams.map((team) => {
                const isEditing = editingTeamId === team.id;
                return (
                <li
                  key={team.id}
                  className="relative flex h-[2.25rem] items-center gap-4 rounded-md px-2 transition-colors hover:bg-bg-muted/50"
                >
                  <div className="flex min-h-[2rem] min-w-0 flex-1 items-center gap-2">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingTeamValue}
                        onChange={(e) => setEditingTeamValue(e.target.value)}
                        onBlur={() => saveTeamInline(team.name)}
                        className={editInputListClass}
                        ref={focusInlineInput}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveTeamInline(team.name);
                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelTeamEdit(team.name);
                          }
                        }}
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setTeamError(null);
                            setEditingTeamId(team.id);
                            setEditingTeamValue(team.name);
                          }}
                          className={inlineEditTriggerListClassRowHover}
                        >
                          {team.name}
                        </button>
                        {showSavedTeam && lastSavedTeamIdRef.current === team.id && <SavedCheckmark />}
                      </>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="pointer-events-none absolute left-2 top-full z-10 pt-0.5">
                      <div className={INLINE_EDIT_STATUS_ROW_MIN_H}>
                        <InlineEditStatus
                          status={
                            savingTeam ? "saving" : showSavedTeam ? "saved" : teamError ? "error" : "idle"
                          }
                          message={teamError}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className={`shrink-0 ${isEditing ? "invisible" : ""}`}>
                    <IconButton
                      variant="ghostDanger"
                      onClick={() => setTeamToDelete(team)}
                      aria-label={`Delete ${team.name}`}
                      tabIndex={isEditing ? -1 : undefined}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </li>
              );
              })}
            </ul>
          </div>
        </Panel>

        <Panel>
          <PanelSectionTitle
            action={
              <ListAddAction
                label="Add activity"
                onClick={() => setAddActivityOpen(true)}
              />
            }
          >
            OTHER ACTIVITIES
          </PanelSectionTitle>
          <p className="px-3 pb-2 text-caption text-text-secondary">
            Non-board time buckets (e.g. project management). Enable per project
            in master data; they appear in the time report issue picker.
          </p>
          <div className="overflow-x-auto p-3 pt-0">
            <ul className="space-y-0.5">
              {initialActivities.map((activity) => {
                const isEditing = editingActivityId === activity.id;
                return (
                <li
                  key={activity.id}
                  className="relative flex h-[2.25rem] items-center gap-4 rounded-md px-2 transition-colors hover:bg-bg-muted/50"
                >
                  <div className="flex min-h-[2rem] min-w-0 flex-1 items-center gap-2">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingActivityValue}
                        onChange={(e) =>
                          setEditingActivityValue(e.target.value)
                        }
                        onBlur={() => void saveActivityInline(activity.name)}
                        className={editInputListClass}
                        ref={focusInlineInput}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            void saveActivityInline(activity.name);
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelActivityEdit(activity.name);
                          }
                        }}
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setActivityError(null);
                            setEditingActivityId(activity.id);
                            setEditingActivityValue(activity.name);
                          }}
                          className={inlineEditTriggerListClassRowHover}
                        >
                          {activity.name}
                        </button>
                        {showSavedActivity &&
                          lastSavedActivityIdRef.current === activity.id && (
                            <SavedCheckmark />
                          )}
                      </>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="pointer-events-none absolute left-2 top-full z-10 pt-0.5">
                      <div className={INLINE_EDIT_STATUS_ROW_MIN_H}>
                        <InlineEditStatus
                          status={
                            savingActivity
                              ? "saving"
                              : showSavedActivity
                                ? "saved"
                                : activityError
                                  ? "error"
                                  : "idle"
                          }
                          message={activityError}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div
                    className={`flex shrink-0 items-center gap-4 ${isEditing ? "invisible" : ""}`}
                  >
                    <Switch
                      id={`activity-default-${activity.id}`}
                      checked={activity.defaultOnNewProjects}
                      onCheckedChange={(checked) => {
                        void updateTimeActivity(activity.id, {
                          defaultOnNewProjects: checked,
                        })
                          .then(() => router.refresh())
                          .catch((e) =>
                            alert(
                              e instanceof Error
                                ? e.message
                                : "Failed to update activity"
                            )
                          );
                      }}
                      label="Auto-enable on new projects"
                      labelClassName="text-caption text-text-secondary whitespace-nowrap"
                      className="shrink-0"
                      tabIndex={isEditing ? -1 : undefined}
                    />
                    <IconButton
                      variant="ghostDanger"
                      onClick={() => setActivityToDelete(activity)}
                      aria-label={`Delete ${activity.name}`}
                      tabIndex={isEditing ? -1 : undefined}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </li>
              );
              })}
              {initialActivities.length === 0 ? (
                <li className="px-2 py-2 text-sm text-text-secondary">
                  No activities yet.
                </li>
              ) : null}
            </ul>
          </div>
        </Panel>

        {mounted ? (
          <SettingsCalendarsSection
            calendars={initialCalendars}
            onRefresh={handleSuccess}
            onAddClick={() => setAddCalendarOpen(true)}
          />
        ) : (
          <Panel>
            <PanelSectionTitle>CALENDARS</PanelSectionTitle>
          </Panel>
        )}
      </div>

      <AddRoleModal
        isOpen={addRoleOpen}
        onClose={() => setAddRoleOpen(false)}
        onSuccess={handleSuccess}
      />

      <ConfirmModal
        isOpen={roleToDelete !== null}
        title="Delete role"
        message="Delete this role? Consultants using it may be affected."
        confirmLabel="Delete"
        variant="danger"
        onClose={() => setRoleToDelete(null)}
        onConfirm={handleRoleDelete}
      />

      <AddTeamModal
        isOpen={addTeamOpen}
        onClose={() => setAddTeamOpen(false)}
        onSuccess={handleSuccess}
      />

      <ConfirmModal
        isOpen={teamToDelete !== null}
        title="Delete team"
        message="Delete this team? Consultants using it may be affected."
        confirmLabel="Delete"
        variant="danger"
        onClose={() => setTeamToDelete(null)}
        onConfirm={handleTeamDelete}
      />

      <AddCalendarModal
        isOpen={addCalendarOpen}
        onClose={() => setAddCalendarOpen(false)}
        onSuccess={handleSuccess}
      />

      <AddTimeActivityModal
        isOpen={addActivityOpen}
        onClose={() => setAddActivityOpen(false)}
        onSuccess={handleSuccess}
      />

      <ConfirmModal
        isOpen={activityToDelete !== null}
        title="Delete activity"
        message="Delete this activity from the catalog? Projects that already use it must disable it first."
        confirmLabel="Delete"
        variant="danger"
        onClose={() => setActivityToDelete(null)}
        onConfirm={handleActivityDelete}
      />
    </>
  );
}
