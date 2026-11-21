"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  createRadarAudienceAction,
  deleteRadarAudienceAction,
  setRadarAudienceStatusAction,
  updateRadarAudienceAction,
} from "@/app/(app)/radar/actions";
import {
  Badge,
  Button,
  CheckboxList,
  ConfirmModal,
  Dialog,
  EmptyState,
  ModalTextInput,
  PageHeader,
  Panel,
} from "@/components/ui";
import {
  formatOmsattningsklassOption,
  SCB_OMSATTNINGSKLASSER,
} from "@/lib/radar/scb/omsattningsklasser";
import {
  formatSniSectionLabel,
  SNI_SECTIONS,
  SWEDEN_COUNTIES,
} from "@/lib/radar/sniSections";
import type { RadarAudience } from "@/lib/radar/types";

type Props = {
  audiences: RadarAudience[];
};

type FormState = {
  name: string;
  sniPrefixes: string[];
  counties: string[];
  omsKlCodes: string[];
};

const emptyForm: FormState = {
  name: "",
  sniPrefixes: [],
  counties: [],
  omsKlCodes: [],
};

function formFromAudience(audience: RadarAudience): FormState {
  return {
    name: audience.name,
    sniPrefixes: [...audience.sni_prefixes],
    counties: [...audience.counties],
    omsKlCodes: audience.oms_kl_codes.map((c) => String(c)),
  };
}

function formatOmsKlSummary(codes: number[]): string {
  if (codes.length === 0) return "—";
  return codes.map((kod) => String(kod)).join(", ");
}

export function RadarAudiencesClient({ audiences }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<RadarAudience | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RadarAudience | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const sniOptions = useMemo(
    () =>
      SNI_SECTIONS.map((section) => ({
        value: section.code,
        label: formatSniSectionLabel(section),
      })),
    []
  );

  const countyOptions = useMemo(
    () => SWEDEN_COUNTIES.map((county) => ({ value: county, label: county })),
    []
  );

  const omsOptions = useMemo(
    () =>
      SCB_OMSATTNINGSKLASSER.map((row) => ({
        value: String(row.kod),
        label: formatOmsattningsklassOption(row.kod),
      })),
    []
  );

  useEffect(() => {
    if (editing == null) return;
    setError(null);
    if (editing === "new") {
      setForm(emptyForm);
      return;
    }
    setForm(formFromAudience(editing));
  }, [editing]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  function openForm(target: RadarAudience | "new") {
    setEditing(target);
    setError(null);
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (form.sniPrefixes.length === 0) {
      setError("Select at least one SNI prefix");
      return;
    }
    if (form.omsKlCodes.length === 0) {
      setError("Select at least one turnover class");
      return;
    }
    if (editing == null) return;

    const payload = {
      name: form.name,
      sni_prefixes: form.sniPrefixes,
      counties: form.counties,
      oms_kl_codes: form.omsKlCodes.map((c) => Number(c)),
    };

    startSaving(async () => {
      try {
        if (editing === "new") {
          await createRadarAudienceAction({
            ...payload,
            status: "active",
            priority: 50,
          });
        } else {
          await updateRadarAudienceAction(editing.id, payload);
        }
        setEditing(null);
        refresh();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Failed to save target group"
        );
      }
    });
  }

  function remove() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteRadarAudienceAction(deleteTarget.id);
        setDeleteTarget(null);
        refresh();
      } catch (cause) {
        setDeleteTarget(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "Failed to delete target group"
        );
      }
    });
  }

  const title = editing === "new" ? "Add target group" : "Edit target group";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Target groups"
        description="Define who Radar should collect. Only active target groups are processed by import jobs. SCB import queries by turnover class, then filters on SNI and county."
      >
        <Button size="sm" onClick={() => openForm("new")}>
          <Plus className="h-4 w-4" aria-hidden /> Add target group
        </Button>
      </PageHeader>

      {error && editing == null ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      {audiences.length === 0 ? (
        <EmptyState
          title="No target groups yet"
          description="Create a target group with SNI, turnover class, and optional geography."
          actionLabel="Add target group"
          onAction={() => openForm("new")}
        />
      ) : (
        <Panel>
          <div className="overflow-x-auto p-0">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-table-header text-text-secondary">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">SNI</th>
                  <th className="px-4 py-2 font-medium">Turnover class</th>
                  <th className="px-4 py-2 font-medium">Counties</th>
                  <th className="px-4 py-2 font-medium">Companies</th>
                  <th className="px-4 py-2 font-medium">Est.</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {audiences.map((a) => (
                  <tr key={a.id} className="border-t border-border-subtle">
                    <td className="px-4 py-3 text-text-primary">
                      <div className="font-medium">{a.name}</div>
                      <div className="text-text-tertiary">
                        Priority {a.priority}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={a.status === "active" ? "success" : "muted"}
                      >
                        {a.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {a.sni_prefixes.join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {formatOmsKlSummary(a.oms_kl_codes)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {a.counties.join(", ") || "Any"}
                    </td>
                    <td className="px-4 py-3 text-text-primary">
                      {a.company_count}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {a.estimated_company_count ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending || saving}
                          onClick={() => openForm(a)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending || saving}
                          onClick={() => {
                            startTransition(async () => {
                              await setRadarAudienceStatusAction(
                                a.id,
                                a.status === "active" ? "paused" : "active"
                              );
                              refresh();
                            });
                          }}
                        >
                          {a.status === "active" ? "Pause" : "Activate"}
                        </Button>
                        <Button
                          size="sm"
                          variant="dangerSecondary"
                          disabled={pending || saving}
                          onClick={() => setDeleteTarget(a)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next && saving) return;
          if (!next) setEditing(null);
        }}
        title={title}
        subtitle="SCB is queried by turnover class; SNI and county filter the results."
        contentClassName="max-h-[90vh] max-w-lg overflow-y-auto"
      >
        <form onSubmit={save} className="modal-form-discreet mt-4 space-y-3">
          <ModalTextInput
            id="radar-audience-name"
            label="Name"
            value={form.name}
            maxLength={200}
            required
            onChange={(event) =>
              setForm((prev) => ({ ...prev, name: event.target.value }))
            }
          />
          <CheckboxList
            label="SNI prefixes"
            options={sniOptions}
            value={form.sniPrefixes}
            onChange={(next) =>
              setForm((prev) => ({ ...prev, sniPrefixes: next }))
            }
            maxHeightClassName="max-h-48"
            idPrefix="radar-audience-sni"
          />
          <CheckboxList
            label="Turnover class (SCB)"
            options={omsOptions}
            value={form.omsKlCodes}
            onChange={(next) =>
              setForm((prev) => ({ ...prev, omsKlCodes: next }))
            }
            maxHeightClassName="max-h-48"
            idPrefix="radar-audience-oms"
          />
          <CheckboxList
            label="Counties (optional)"
            options={countyOptions}
            value={form.counties}
            onChange={(next) =>
              setForm((prev) => ({ ...prev, counties: next }))
            }
            maxHeightClassName="max-h-40"
            idPrefix="radar-audience-county"
          />
          {error && editing != null ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Delete target group?"
        message="The target group will be removed. Linked companies stay in Radar but lose this audience link."
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
      />
    </div>
  );
}
