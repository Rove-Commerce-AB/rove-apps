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
import { Button, DataTable, Dialog, Input, type DataTableColumn } from "@/components/ui";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function displayProjectName(name: string): string {
  return name.replace(/^Absence\s*[-–—]\s*/i, "").trim() || name;
}

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
  const showIssuesColumn =
    preview?.absences.some((row) => row.issues.length > 0) ?? false;

  const absenceColumns = useMemo((): DataTableColumn<PayrollAbsenceRow>[] => {
    const columns: DataTableColumn<PayrollAbsenceRow>[] = [
      {
        id: "include",
        header: "",
        width: "2.5rem",
        align: "center",
        cell: (row) => (
          <input
            type="checkbox"
            checked={selectedIds.has(row.entryId)}
            disabled={!row.includable}
            onChange={() => toggleRow(row)}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Include ${row.consultantName} ${row.entryDate}`}
            className="align-middle"
          />
        ),
      },
      {
        id: "person",
        header: "Person",
        cell: (row) => (
          <span className="whitespace-nowrap text-text-primary">
            {row.consultantName}
            <span className="ml-2 text-text-tertiary">
              {row.employmentNumber ?? "—"}
            </span>
          </span>
        ),
      },
      {
        id: "date",
        header: "Date",
        width: "7.5rem",
        cell: (row) => (
          <span className="whitespace-nowrap tabular-nums">{row.entryDate}</span>
        ),
      },
      {
        id: "type",
        header: "Type",
        cell: (row) => (
          <span className="whitespace-nowrap">
            {displayProjectName(row.projectName)}
          </span>
        ),
      },
      {
        id: "code",
        header: "Code",
        width: "5rem",
        cell: (row) => (
          <span className="whitespace-nowrap font-medium tabular-nums">
            {row.absenceCode ?? "—"}
          </span>
        ),
      },
      {
        id: "hours",
        header: "Hours",
        width: "4.5rem",
        align: "right",
        cell: (row) => (
          <span className="whitespace-nowrap tabular-nums">{row.hours}</span>
        ),
      },
    ];
    if (showIssuesColumn) {
      columns.push({
        id: "issues",
        header: "Issues",
        cell: (row) =>
          row.issues.length > 0 ? (
            <span className="whitespace-nowrap text-status-warning">
              {row.issues.join("; ")}
            </span>
          ) : (
            "—"
          ),
      });
    }
    return columns;
  }, [selectedIds, showIssuesColumn]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Export Fortnox PAXML"
      subtitle="Preview absence for payroll, then download a .pax file"
      contentClassName="fixed left-1/2 top-1/2 z-50 flex max-h-[min(90vh,880px)] w-full max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-default p-8 shadow-xl focus:outline-none"
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
            <section className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
              <div className="flex shrink-0 items-center justify-between gap-3">
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
              <div className="min-h-0 flex-1 overflow-auto">
                {preview.absences.length === 0 ? (
                  <p className="px-1 py-3 text-sm text-text-secondary">
                    No reported absence in this period.
                  </p>
                ) : (
                  <DataTable
                    columns={absenceColumns}
                    rows={preview.absences}
                    getRowId={(row) => row.entryId}
                    density="compact"
                    stickyHeader
                    getRowClassName={(row) =>
                      row.includable ? undefined : "bg-status-warning-subtle/40"
                    }
                  />
                )}
              </div>
            </section>

            <section className="shrink-0">
              <div className="mb-2">
                <h3 className="text-label-l text-text-primary">
                  Part-time ({preview.partTime.length})
                </h3>
                <p className="text-xs text-text-secondary">
                  Not written to the PAXML file — verify schema / employment rate in Fortnox.
                </p>
              </div>
              {preview.partTime.length === 0 ? (
                <p className="text-sm text-text-secondary">
                  Everyone is at 100% for this period.
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                  {preview.partTime.map((row) => (
                    <li
                      key={row.consultantId}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <span className="whitespace-nowrap text-text-primary">
                        {row.consultantName}
                        <span className="ml-2 text-text-tertiary">
                          {row.employmentNumber ?? "—"}
                        </span>
                      </span>
                      <span className="whitespace-nowrap tabular-nums text-text-secondary">
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
