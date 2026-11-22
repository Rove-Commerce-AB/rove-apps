"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  createProjectCustomActivity,
  deleteProjectCustomActivity,
  getProjectActivitySettings,
  setProjectCatalogActivityEnabled,
  updateProjectCustomActivity,
  type ProjectTimeActivity,
  type TimeActivity,
} from "@/lib/timeActivitiesClient";
import {
  Button,
  Dialog,
  IconButton,
  ModalTextInput,
  Switch,
} from "@/components/ui";

type Props = {
  projectId: string;
};

export function ProjectActivitiesSection({ projectId }: Props) {
  const [catalog, setCatalog] = useState<TimeActivity[]>([]);
  const [projectRows, setProjectRows] = useState<ProjectTimeActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProjectActivitySettings(projectId);
      setCatalog(data.catalog);
      setProjectRows(data.project);
    } catch (e) {
      const code =
        typeof e === "object" && e && "code" in e
          ? String((e as { code?: unknown }).code ?? "")
          : "";
      if (code === "42P01") {
        setCatalog([]);
        setProjectRows([]);
        setError(
          "Activities tables are not migrated yet. Apply scripts/20261122_time_activities.sql."
        );
      } else {
        setError(e instanceof Error ? e.message : "Failed to load activities");
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const enabledByCatalogId = useMemo(() => {
    const map = new Map<string, ProjectTimeActivity>();
    for (const row of projectRows) {
      if (row.activityId) map.set(row.activityId, row);
    }
    return map;
  }, [projectRows]);

  const customRows = useMemo(
    () => projectRows.filter((row) => row.isCustom),
    [projectRows]
  );

  async function toggleCatalog(activity: TimeActivity, enabled: boolean) {
    setError(null);
    try {
      await setProjectCatalogActivityEnabled(projectId, activity.id, enabled);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update activity");
    }
  }

  async function toggleCustom(row: ProjectTimeActivity, enabled: boolean) {
    setError(null);
    try {
      await updateProjectCustomActivity(row.id, { isEnabled: enabled });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update activity");
    }
  }

  async function removeCustom(row: ProjectTimeActivity) {
    setError(null);
    try {
      await deleteProjectCustomActivity(row.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete activity");
    }
  }

  async function addCustom() {
    setError(null);
    if (!customName.trim()) {
      setError("Activity name is required");
      return;
    }
    setSubmitting(true);
    try {
      await createProjectCustomActivity(projectId, customName.trim());
      setCustomName("");
      setAddOpen(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add activity");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <p className="px-6 py-4 text-sm text-text-secondary">Loading activities…</p>
    );
  }

  return (
    <div className="px-6 py-4">
      {error ? (
        <p className="mb-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-text-primary">
            Catalog activities
          </h3>
        </div>
        <p className="mb-3 text-caption text-text-secondary">
          From General settings. Enabled ones appear in the time report picker.
        </p>
        <ul className="space-y-1">
          {catalog.map((activity) => {
            const row = enabledByCatalogId.get(activity.id);
            const enabled = row?.isEnabled === true;
            return (
              <li
                key={activity.id}
                className="flex h-9 items-center justify-between gap-3 rounded-md px-2 hover:bg-bg-muted/50"
              >
                <span className="min-w-0 truncate text-sm text-text-primary">
                  {activity.name}
                </span>
                <Switch
                  id={`proj-act-${activity.id}`}
                  checked={enabled}
                  onCheckedChange={(checked) => {
                    void toggleCatalog(activity, checked);
                  }}
                  className="shrink-0"
                />
              </li>
            );
          })}
          {catalog.length === 0 ? (
            <li className="px-2 py-2 text-sm text-text-secondary">
              No catalog activities. Add them under Settings → General.
            </li>
          ) : null}
        </ul>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-text-primary">
            Project-specific
          </h3>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="!h-7 gap-1"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add
          </Button>
        </div>
        <ul className="space-y-1">
          {customRows.map((row) => (
            <li
              key={row.id}
              className="flex h-9 items-center gap-3 rounded-md px-2 hover:bg-bg-muted/50"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                {row.name}
              </span>
              <Switch
                id={`proj-custom-act-${row.id}`}
                checked={row.isEnabled}
                onCheckedChange={(checked) => {
                  void toggleCustom(row, checked);
                }}
                className="shrink-0"
              />
              <IconButton
                variant="ghostDanger"
                aria-label={`Delete ${row.name}`}
                onClick={() => void removeCustom(row)}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
          {customRows.length === 0 ? (
            <li className="px-2 py-2 text-sm text-text-secondary">
              No project-specific activities.
            </li>
          ) : null}
        </ul>
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAddOpen(false);
            setCustomName("");
          }
        }}
        title="Add project activity"
      >
        <form
          className="modal-form-discreet mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void addCustom();
          }}
        >
          <ModalTextInput
            id="project-activity-name"
            label="Activity name"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="e.g. Customer workshop"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Adding…" : "Add"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
