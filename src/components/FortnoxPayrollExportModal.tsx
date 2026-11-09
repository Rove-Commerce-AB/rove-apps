"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  buildPayrollPaxmlAction,
  getPayrollExportPreviewAction,
} from "@/lib/paxml/payrollExportActions";
import type {
  PayrollAbsenceRow,
  PayrollExportPreview,
} from "@/lib/paxml/payrollExportQueries";
import { absenceCodeLabel } from "@/lib/paxml/absenceCodes";
import { Button, Dialog, Input } from "@/components/ui";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function previousMonthRange(today = new Date()): { from: string; to: string } {
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed current month
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(from), to: iso(to) };
}

function downloadTextFile(fileName: string, contents: string) {
  const blob = new Blob([contents], { type: "application/xml;charset=ISO-8859-1" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function FortnoxPayrollExportModal({ open, onOpenChange }: Props) {
  const defaults = useMemo(() => previousMonthRange(), []);
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [preview, setPreview] = useState<PayrollExportPreview | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const range = previousMonthRange();
    setFromDate(range.from);
    setToDate(range.to);
    setPreview(null);
    setSelectedIds(new Set());
    setError(null);
  }, [open]);

  async function loadPreview() {
    setLoading(true);
    setError(null);
    try {
      const data = await getPayrollExportPreviewAction(fromDate, toDate);
      setPreview(data);
      setSelectedIds(
        new Set(data.absences.filter((row) => row.includable).map((row) => row.entryId))
      );
    } catch (e) {
      setPreview(null);
      setSelectedIds(new Set());
      setError(e instanceof Error ? e.message : "Failed to load preview");
    } finally {
      setLoading(false);
    }
  }

  function toggleRow(row: PayrollAbsenceRow) {
    if (!row.includable) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(row.entryId)) next.delete(row.entryId);
      else next.add(row.entryId);
      return next;
    });
  }

  function selectAllIncludable() {
    if (!preview) return;
    setSelectedIds(
      new Set(preview.absences.filter((row) => row.includable).map((row) => row.entryId))
    );
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function downloadPaxml() {
    setDownloading(true);
    setError(null);
    try {
      const result = await buildPayrollPaxmlAction({
        fromDate,
        toDate,
        includedEntryIds: [...selectedIds],
      });
      if (!result.xml.includes("<tidtrans ")) {
        setError("No includable absence rows selected.");
        return;
      }
      downloadTextFile(result.fileName, result.xml);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to build PAXML");
    } finally {
      setDownloading(false);
    }
  }

  const selectedCount = selectedIds.size;
  const blockedCount =
    preview?.absences.filter((row) => !row.includable).length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Export Fortnox PAXML"
      subtitle="Preview absence for payroll, then download a .pax file"
      contentClassName="fixed left-1/2 top-1/2 z-50 flex max-h-[min(90vh,840px)] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-default p-8 shadow-xl focus:outline-none"
    >
      <div className="mt-6 flex min-h-0 flex-1 flex-col gap-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <label className="mb-1 block text-label-s text-text-secondary" htmlFor="paxml-from">
              From
            </label>
            <Input
              id="paxml-from"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-label-s text-text-secondary" htmlFor="paxml-to">
              To
            </label>
            <Input
              id="paxml-to"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadPreview()}
            disabled={loading}
          >
            {loading ? "Loading…" : "Load preview"}
          </Button>
        </div>

        {error ? (
          <p className="text-body-m text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {preview ? (
          <>
            <section className="min-h-0 flex-1 overflow-auto rounded-lg border border-border-subtle">
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border-subtle bg-bg-default px-3 py-2">
                <h3 className="text-label-l text-text-primary">
                  Absence ({preview.absences.length})
                </h3>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={selectAllIncludable}>
                    Select all ready
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                    Clear
                  </Button>
                </div>
              </div>
              {preview.absences.length === 0 ? (
                <p className="px-3 py-4 text-sm text-text-secondary">
                  No reported absence in this period.
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-bg-muted text-text-secondary">
                    <tr>
                      <th className="px-3 py-2 font-medium">Include</th>
                      <th className="px-3 py-2 font-medium">Person</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Project</th>
                      <th className="px-3 py-2 font-medium">Code</th>
                      <th className="px-3 py-2 font-medium">Hours</th>
                      <th className="px-3 py-2 font-medium">Issues</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {preview.absences.map((row) => {
                      const checked = selectedIds.has(row.entryId);
                      return (
                        <tr
                          key={row.entryId}
                          className={row.includable ? "" : "bg-status-warning-subtle/40"}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!row.includable}
                              onChange={() => toggleRow(row)}
                              aria-label={`Include ${row.consultantName} ${row.entryDate}`}
                            />
                          </td>
                          <td className="px-3 py-2 text-text-primary">
                            <div>{row.consultantName}</div>
                            <div className="text-xs text-text-tertiary">
                              {row.employmentNumber ?? "No employment number"}
                            </div>
                          </td>
                          <td className="px-3 py-2 tabular-nums">{row.entryDate}</td>
                          <td className="px-3 py-2">{row.projectName}</td>
                          <td className="px-3 py-2">{absenceCodeLabel(row.absenceCode)}</td>
                          <td className="px-3 py-2 tabular-nums">{row.hours}</td>
                          <td className="px-3 py-2 text-xs text-status-warning">
                            {row.issues.join("; ") || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>

            <section className="rounded-lg border border-border-subtle">
              <div className="border-b border-border-subtle px-3 py-2">
                <h3 className="text-label-l text-text-primary">
                  Part-time ({preview.partTime.length})
                </h3>
                <p className="text-xs text-text-secondary">
                  Not written to the PAXML file — verify schema / employment rate in Fortnox.
                </p>
              </div>
              {preview.partTime.length === 0 ? (
                <p className="px-3 py-3 text-sm text-text-secondary">
                  Everyone is at 100% for this period.
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {preview.partTime.map((row) => (
                    <li
                      key={row.consultantId}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <span className="text-text-primary">
                        {row.consultantName}
                        <span className="ml-2 text-xs text-text-tertiary">
                          {row.employmentNumber ?? "No employment number"}
                        </span>
                      </span>
                      <span className="tabular-nums text-text-secondary">
                        {row.workPercentage}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
              <p className="text-sm text-text-secondary">
                {selectedCount} selected
                {blockedCount > 0 ? ` · ${blockedCount} blocked` : ""}
              </p>
              <Button
                type="button"
                onClick={() => void downloadPaxml()}
                disabled={downloading || selectedCount === 0}
              >
                <Download className="h-4 w-4" aria-hidden />
                {downloading ? "Preparing…" : "Download .pax"}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-text-secondary">
            Choose a period and load the preview. Rows missing employment number or
            absence code are highlighted and cannot be exported until fixed.
          </p>
        )}
      </div>
    </Dialog>
  );
}
