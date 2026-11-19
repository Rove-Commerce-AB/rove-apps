"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createRadarAudienceAction,
  deleteRadarAudienceAction,
  setRadarAudienceStatusAction,
} from "@/app/(app)/radar/actions";
import {
  Badge,
  Button,
  CheckboxList,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Panel,
} from "@/components/ui";
import {
  formatSniSectionLabel,
  SNI_SECTIONS,
  SWEDEN_COUNTIES,
} from "@/lib/radar/sniSections";
import type { RadarAudience } from "@/lib/radar/types";

type Props = {
  audiences: RadarAudience[];
};

export function RadarAudiencesClient({ audiences }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sniPrefixes, setSniPrefixes] = useState<string[]>(["47"]);
  const [counties, setCounties] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  function refresh() {
    startTransition(() => router.refresh());
  }

  function resetForm() {
    setName("");
    setSniPrefixes(["47"]);
    setCounties([]);
    setError(null);
  }

  async function handleCreate() {
    setError(null);
    if (sniPrefixes.length === 0) {
      setError("Select at least one SNI prefix");
      return;
    }
    try {
      await createRadarAudienceAction({
        name,
        status: "active",
        priority: 50,
        sni_prefixes: sniPrefixes,
        counties,
      });
      setOpen(false);
      resetForm();
      refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to create target group"
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Target groups"
        description="Define who Radar should collect. Only active target groups are processed by import jobs."
      >
        <Button size="sm" onClick={() => setOpen(true)}>
          New target group
        </Button>
      </PageHeader>

      {audiences.length === 0 ? (
        <EmptyState
          title="No target groups yet"
          description="Create a target group with SNI, geography, and size filters."
          actionLabel="New target group"
          onAction={() => setOpen(true)}
        />
      ) : (
        <Panel>
          <div className="overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-table-header text-text-secondary">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">SNI</th>
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
                      <div className="text-text-tertiary">Priority {a.priority}</div>
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
                      {a.counties.join(", ") || "Any"}
                    </td>
                    <td className="px-4 py-3 text-text-primary">{a.company_count}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      {a.estimated_company_count ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={async () => {
                            await setRadarAudienceStatusAction(
                              a.id,
                              a.status === "active" ? "paused" : "active"
                            );
                            refresh();
                          }}
                        >
                          {a.status === "active" ? "Pause" : "Activate"}
                        </Button>
                        <Button
                          size="sm"
                          variant="dangerSecondary"
                          disabled={pending}
                          onClick={async () => {
                            if (
                              !confirm(`Delete target group “${a.name}”?`)
                            )
                              return;
                            await deleteRadarAudienceAction(a.id);
                            refresh();
                          }}
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
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetForm();
        }}
        title="New target group"
        subtitle="Companies matching these filters are imported when the company import job runs."
        contentClassName="max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-secondary">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <CheckboxList
            label="SNI prefixes"
            options={sniOptions}
            value={sniPrefixes}
            onChange={setSniPrefixes}
            maxHeightClassName="max-h-56"
            idPrefix="radar-audience-sni"
          />
          <CheckboxList
            label="Counties (optional)"
            options={countyOptions}
            value={counties}
            onChange={setCounties}
            maxHeightClassName="max-h-40"
            idPrefix="radar-audience-county"
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || sniPrefixes.length === 0}
            >
              Create
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
