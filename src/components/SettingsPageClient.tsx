"use client";

import dynamic from "next/dynamic";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { getRoles, deleteRole, updateRole } from "@/lib/rolesClient";
import { getTeams, deleteTeam, updateTeam } from "@/lib/teamsClient";
import { getCalendarsWithHolidayCount } from "@/lib/calendarsClient";
import {
  IconButton,
  ConfirmModal,
  InlineEditStatus,
  ListAddAction,
  SavedCheckmark,
  PageHeader,
  Panel,
  PanelSectionTitle,
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

type Props = {
  roles: Awaited<ReturnType<typeof getRoles>>;
  teams: Awaited<ReturnType<typeof getTeams>>;
  calendars: Awaited<ReturnType<typeof getCalendarsWithHolidayCount>>;
  error: string | null;
};

export function SettingsPageClient({
  roles: initialRoles,
  teams: initialTeams,
  calendars: initialCalendars,
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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    return () => {
      if (savedRoleTimeoutRef.current) clearTimeout(savedRoleTimeoutRef.current);
      if (savedTeamTimeoutRef.current) clearTimeout(savedTeamTimeoutRef.current);
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

  const handleSuccess = () => {
    router.refresh();
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
        description="Manage calendars, roles and system configuration"
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
              {initialRoles.map((role) => (
                <li
                  key={role.id}
                  className={`flex items-center gap-4 rounded-md px-2 transition-colors hover:bg-bg-muted/50 ${editingRoleId === role.id ? "py-1" : "h-[2.25rem]"}`}
                >
                  <div className="min-w-0 flex-1 flex flex-col">
                    <div className="min-h-[2rem] flex items-center gap-2">
                      {editingRoleId === role.id ? (
                        <input
                          type="text"
                          value={editingRoleValue}
                          onChange={(e) => setEditingRoleValue(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          onBlur={() => saveRoleInline(role.name)}
                          className={editInputListClass}
                          autoFocus
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
                    {editingRoleId === role.id && (
                      <div className={`shrink-0 ${INLINE_EDIT_STATUS_ROW_MIN_H}`}>
                        <InlineEditStatus
                          status={
                            savingRole ? "saving" : showSavedRole ? "saved" : roleError ? "error" : "idle"
                          }
                          message={roleError}
                        />
                      </div>
                    )}
                  </div>
                  {editingRoleId !== role.id && (
                    <IconButton
                      variant="ghostDanger"
                      onClick={() => setRoleToDelete(role)}
                      aria-label={`Delete ${role.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  )}
                </li>
              ))}
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
              {initialTeams.map((team) => (
                <li
                  key={team.id}
                  className={`flex items-center gap-4 rounded-md px-2 transition-colors hover:bg-bg-muted/50 ${editingTeamId === team.id ? "py-1" : "h-[2.25rem]"}`}
                >
                  <div className="min-w-0 flex-1 flex flex-col">
                    <div className="min-h-[2rem] flex items-center gap-2">
                      {editingTeamId === team.id ? (
                        <input
                          type="text"
                          value={editingTeamValue}
                          onChange={(e) => setEditingTeamValue(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          onBlur={() => saveTeamInline(team.name)}
                          className={editInputListClass}
                          autoFocus
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
                    {editingTeamId === team.id && (
                      <div className={`shrink-0 ${INLINE_EDIT_STATUS_ROW_MIN_H}`}>
                        <InlineEditStatus
                          status={
                            savingTeam ? "saving" : showSavedTeam ? "saved" : teamError ? "error" : "idle"
                          }
                          message={teamError}
                        />
                      </div>
                    )}
                  </div>
                  {editingTeamId !== team.id && (
                    <IconButton
                      variant="ghostDanger"
                      onClick={() => setTeamToDelete(team)}
                      aria-label={`Delete ${team.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  )}
                </li>
              ))}
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
    </>
  );
}
