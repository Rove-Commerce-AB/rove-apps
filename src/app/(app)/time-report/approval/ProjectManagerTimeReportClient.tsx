"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Circle, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Select,
  FieldValue,
  InlineEditFieldContainer,
  InlineEditTrigger,
  InlineEditStatus,
  type InlineEditStatusState,
  SAVED_DURATION_MS,
  editInputClass,
  Button,
} from "@/components/ui";
import {
  pmSetInvoicingStatus,
  pmSetInvoicingStatusBulk,
  pmUpdateTimeEntry,
  getProjectManagerTimeEntries,
  pmSetProjectMonthInvoicedHoursFixed,
} from "./actions";
import type { ProjectManagerEntry } from "@/types";
import { getMonthLabel } from "@/lib/dateUtils";
import { TIME_REPORT_MONTH_NAMES } from "../timeReportShared";
import { EntryFilterMultiSelect } from "./EntryFilterMultiSelect";

type Customer = { id: string; name: string };
type Project = {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
};

const HOURS_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

/** Select value for “rows without a Jira issue” in the PM entry table filter. */
const PM_JIRA_FILTER_NONE = "__none__";

/** Postgres `date` / `timestamptz::text` can include time or stray whitespace — keep one visual line. */
function formatEntryDateCell(raw: string): string {
  const line = raw.trim().split(/\r?\n/)[0]?.trim() ?? "";
  if (!line) return "—";
  const head = line.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
  return line.replace(/\s+/g, " ").trim();
}

/** Single-line cell: ellipsis when needed; native tooltip only when content overflows. */
function TruncatedWithTooltip({
  text,
  className = "",
  emptyDisplay = "—",
}: {
  text: string;
  className?: string;
  emptyDisplay?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const trimmed = text.trim();
  const display = trimmed ? text : emptyDisplay;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      setOverflowing(trimmed.length > 0 && el.scrollWidth > el.clientWidth + 0.5);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [trimmed]);

  return (
    <div
      ref={ref}
      className={`min-w-0 w-full truncate text-left ${!trimmed ? "text-text-primary/60" : "text-text-primary"} ${className}`}
      title={overflowing ? text : undefined}
    >
      {display}
    </div>
  );
}

export function ProjectManagerTimeReportClient({
  isAdmin,
  consultantId,
  customers,
  projects,
  initialYear,
  initialMonth,
}: {
  isAdmin: boolean;
  consultantId: string | null;
  customers: Customer[];
  projects: Project[];
  initialYear: number;
  initialMonth: number;
}) {
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    customers[0]?.id ?? ""
  );
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [entries, setEntries] = useState<ProjectManagerEntry[]>([]);
  /** Persisted sum for this project/month (COALESCE(pm, reported)); refreshed on each load. */
  const [invoicedHoursFromLines, setInvoicedHoursFromLines] = useState(0);
  const [invoicedHoursFixed, setInvoicedHoursFixed] = useState<number | null>(null);
  const [fixedHoursDraft, setFixedHoursDraft] = useState("");
  const [fixedSaveError, setFixedSaveError] = useState<string | null>(null);
  const [fixedSaving, setFixedSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterConsultantIds, setFilterConsultantIds] = useState<string[]>([]);
  const [filterRoleIds, setFilterRoleIds] = useState<string[]>([]);
  const [filterJiraKeys, setFilterJiraKeys] = useState<string[]>([]);

  type InlineField = "pmHours" | "pmComment";
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<InlineField | null>(null);
  const [editHoursStr, setEditHoursStr] = useState("");
  const [editCommentStr, setEditCommentStr] = useState("");
  const [inlineEditStatus, setInlineEditStatus] = useState<InlineEditStatusState>("idle");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const lastSavedFieldRef = useRef<InlineField | null>(null);
  const lastSavedEntryIdRef = useRef<string | null>(null);

  const canEdit = Boolean(consultantId) || isAdmin;

  useEffect(() => {
    setSelectedCustomerId(customers[0]?.id ?? "");
  }, [customers]);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) =>
      selectedCustomerId ? p.customerId === selectedCustomerId : true
    );
  }, [projects, selectedCustomerId]);

  useEffect(() => {
    const first = filteredProjects[0]?.id ?? "";
    setSelectedProjectId((prev) =>
      prev && filteredProjects.some((p) => p.id === prev) ? prev : first
    );
  }, [filteredProjects]);

  async function reload() {
    if (!selectedProjectId) return;
    setLoading(true);
    setError(null);
    setFixedSaveError(null);
    try {
      const res = await getProjectManagerTimeEntries({
        projectId: selectedProjectId,
        year,
        month,
      });
      setEntries(res.entries);
      setInvoicedHoursFromLines(res.invoicedHoursFromLines);
      setInvoicedHoursFixed(res.invoicedHoursFixed ?? null);
      setFixedHoursDraft(
        res.invoicedHoursFixed != null ? String(res.invoicedHoursFixed) : ""
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load entries");
    } finally {
      setLoading(false);
    }
  }

  const allInvoiced = entries.length > 0 && entries.every((e) => e.invoicedAt != null);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, year, month]);

  useEffect(() => {
    setFilterConsultantIds([]);
    setFilterRoleIds([]);
    setFilterJiraKeys([]);
  }, [selectedProjectId, year, month]);

  useEffect(() => {
    const consultantIds = new Set(entries.map((e) => e.consultantId));
    const roleIds = new Set(entries.map((e) => e.roleId));
    const jiraKeys = new Set(
      entries.map((e) => e.jiraKey).filter((k): k is string => Boolean(k))
    );
    const hasWithoutJira = entries.some((e) => !e.jiraKey);
    setFilterConsultantIds((prev) => prev.filter((id) => consultantIds.has(id)));
    setFilterRoleIds((prev) => prev.filter((id) => roleIds.has(id)));
    setFilterJiraKeys((prev) =>
      prev.filter(
        (k) =>
          (k === PM_JIRA_FILTER_NONE && hasWithoutJira) ||
          (k !== PM_JIRA_FILTER_NONE && jiraKeys.has(k))
      )
    );
  }, [entries]);

  const projectOptions = useMemo(() => {
    return filteredProjects.map((p) => ({
      value: p.id,
      label: p.name,
    }));
  }, [filteredProjects]);

  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: c.id, label: c.name })),
    [customers]
  );

  const consultantFilterOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const e of entries) {
      byId.set(e.consultantId, e.consultantName);
    }
    const sorted = [...byId.entries()].sort((a, b) =>
      a[1].localeCompare(b[1], undefined, { sensitivity: "base" })
    );
    return sorted.map(([value, label]) => ({ value, label }));
  }, [entries]);

  const roleFilterOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const e of entries) {
      byId.set(e.roleId, e.roleName);
    }
    const sorted = [...byId.entries()].sort((a, b) =>
      a[1].localeCompare(b[1], undefined, { sensitivity: "base" })
    );
    return sorted.map(([value, label]) => ({ value, label }));
  }, [entries]);

  const jiraFilterOptions = useMemo(() => {
    const hasWithoutJira = entries.some((e) => !e.jiraKey);
    const keyLabels = new Map<string, string>();
    for (const e of entries) {
      if (!e.jiraKey) continue;
      if (!keyLabels.has(e.jiraKey)) {
        keyLabels.set(
          e.jiraKey,
          e.jiraTitle ? `${e.jiraKey} — ${e.jiraTitle}` : e.jiraKey
        );
      }
    }
    const sortedKeys = [...keyLabels.keys()].sort((a, b) => a.localeCompare(b));
    return [
      ...(hasWithoutJira
        ? [{ value: PM_JIRA_FILTER_NONE, label: "No Jira issue" }]
        : []),
      ...sortedKeys.map((key) => ({ value: key, label: keyLabels.get(key) ?? key })),
    ];
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (filterConsultantIds.length > 0 && !filterConsultantIds.includes(e.consultantId)) {
        return false;
      }
      if (filterRoleIds.length > 0 && !filterRoleIds.includes(e.roleId)) {
        return false;
      }
      if (filterJiraKeys.length > 0) {
        const wantNone = filterJiraKeys.includes(PM_JIRA_FILTER_NONE);
        const wantKeys = filterJiraKeys.filter((k) => k !== PM_JIRA_FILTER_NONE);
        const okNone = wantNone && !e.jiraKey;
        const okKey = Boolean(e.jiraKey && wantKeys.includes(e.jiraKey));
        if (!okNone && !okKey) return false;
      }
      return true;
    });
  }, [entries, filterConsultantIds, filterRoleIds, filterJiraKeys]);

  const monthLabel = getMonthLabel(month, year);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  type SortKey =
    | "entryDate"
    | "consultantName"
    | "role"
    | "jira"
    | "task"
    | "internalComment"
    | "reportedHours"
    | "pmHours"
    | "pmComment"
    | "status";
  type SortDir = "asc" | "desc";

  const [sortKey, setSortKey] = useState<SortKey>("entryDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sortedEntries = useMemo(() => {
    const isInvoiced = (e: ProjectManagerEntry) => e.invoicedAt != null;

    const baseCompare = (a: ProjectManagerEntry, b: ProjectManagerEntry) => {
      let res = 0;
      switch (sortKey) {
        case "entryDate":
          res = a.entryDate.localeCompare(b.entryDate);
          break;
        case "consultantName":
          res = a.consultantName.localeCompare(b.consultantName);
          break;
        case "role":
          res = a.roleName.localeCompare(b.roleName);
          break;
        case "task":
          res = (a.task ?? "").localeCompare(b.task ?? "");
          break;
        case "jira":
          res = [a.jiraKey ?? "", a.jiraTitle ?? ""]
            .join(" ")
            .localeCompare([b.jiraKey ?? "", b.jiraTitle ?? ""].join(" "));
          break;
        case "internalComment":
          res = (a.internalComment ?? "").localeCompare(b.internalComment ?? "");
          break;
        case "pmComment":
          res = (a.pmEditedComment ?? "").localeCompare(b.pmEditedComment ?? "");
          break;
        case "reportedHours":
          res = a.hours - b.hours;
          break;
        case "pmHours": {
          // Keep unedited entries (pmEditedHours === null) grouped at the end when sorting desc.
          const aPm = a.pmEditedHours ?? -1;
          const bPm = b.pmEditedHours ?? -1;
          res = aPm - bPm;
          break;
        }
        case "status":
          res = Number(isInvoiced(a)) - Number(isInvoiced(b));
          break;
        default:
          res = 0;
      }
      return sortDir === "asc" ? res : -res;
    };

    return [...filteredEntries].sort(baseCompare);
  }, [filteredEntries, sortKey, sortDir]);

  const hourColumnTotals = useMemo(() => {
    const totalReported = sortedEntries.reduce((s, e) => s + e.hours, 0);
    const totalPmEdited = sortedEntries.reduce((s, e) => s + (e.pmEditedHours ?? 0), 0);
    return { totalReported, totalPmEdited };
  }, [sortedEntries]);

  const displayedInvoicedHours =
    invoicedHoursFixed != null ? invoicedHoursFixed : invoicedHoursFromLines;

  async function saveInvoicedHoursFixed(next: number | null) {
    if (!selectedProjectId || !canEdit) return;
    setFixedSaving(true);
    setFixedSaveError(null);
    try {
      const res = await pmSetProjectMonthInvoicedHoursFixed({
        projectId: selectedProjectId,
        year,
        month,
        invoicedHoursFixed: next,
      });
      if (!res.ok) throw new Error(res.error ?? "Failed to save");
      await reload();
    } catch (e) {
      setFixedSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setFixedSaving(false);
    }
  }

  async function applyFixedHoursDraft() {
    const trimmed = fixedHoursDraft.trim().replace(",", ".");
    if (trimmed === "") {
      await saveInvoicedHoursFixed(null);
      return;
    }
    const parsed = parseFloat(trimmed);
    if (Number.isNaN(parsed) || parsed < 0) {
      setFixedSaveError("Enter a valid non-negative number, or leave blank to use the line sum.");
      return;
    }
    await saveInvoicedHoursFixed(parsed);
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    // Default directions: newest/ready/highest first.
    setSortDir(
      key === "consultantName" ||
        key === "role" ||
        key === "task" ||
        key === "jira" ||
        key === "internalComment" ||
        key === "pmComment"
        ? "asc"
        : "desc"
    );
  };

  const goPrevMonth = () => {
    const d = new Date(year, month - 1, 1);
    d.setMonth(d.getMonth() - 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const goNextMonth = () => {
    const d = new Date(year, month - 1, 1);
    d.setMonth(d.getMonth() + 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const closeInlineEdit = () => {
    setEditingEntryId(null);
    setEditingField(null);
    setEditHoursStr("");
    setEditCommentStr("");
    setInlineEditStatus("idle");
    setInlineError(null);
  };

  const startInlineEdit = (entry: ProjectManagerEntry, field: InlineField) => {
    const isInvoiced = entry.invoicedAt != null;
    const canEditEntry = canEdit && (isAdmin || !isInvoiced);
    if (!canEditEntry) return;

    setEditingEntryId(entry.id);
    setEditingField(field);
    setInlineEditStatus("idle");
    setInlineError(null);

    if (field === "pmHours") {
      // Empty pmEditedHours should start as empty string so PM can clear the value.
      setEditHoursStr(entry.pmEditedHours != null ? String(entry.pmEditedHours) : "");
    } else {
      setEditCommentStr(entry.pmEditedComment ?? "");
    }
  };

  const commitInlineEdit = async () => {
    if (!editingEntryId || !editingField) return;
    if (inlineEditStatus === "saving") return;

    const entry = entries.find((e) => e.id === editingEntryId);
    if (!entry) {
      closeInlineEdit();
      return;
    }

    const isInvoiced = entry.invoicedAt != null;
    const canEditEntry = canEdit && (isAdmin || !isInvoiced);
    if (!canEditEntry) {
      closeInlineEdit();
      return;
    }

    setInlineEditStatus("saving");
    setInlineError(null);

    let pmHours: number | null | undefined;
    if (editingField === "pmHours") {
      const trimmed = editHoursStr.trim().replace(",", ".");
      if (trimmed === "") {
        pmHours = null; // Clear pm_edited_hours
      } else {
        const parsed = parseFloat(trimmed);
        if (Number.isNaN(parsed) || parsed < 0) {
          // PM hours has no inline error message; invalid value is ignored.
          closeInlineEdit();
          return;
        }
        pmHours = parsed;
      }
    }

    const pmComment =
      editingField === "pmComment" ? editCommentStr : String(entry.pmEditedComment ?? "");
    const pmHoursForSave = editingField === "pmHours" ? pmHours : undefined;

    try {
      const res = await pmUpdateTimeEntry({
        entryId: entry.id,
        pmHours: pmHoursForSave,
        pmComment,
        markInvoicing: false,
      });
      if (!res.ok) throw new Error(res.error ?? "Failed to update entry");

      lastSavedFieldRef.current = editingField;
      lastSavedEntryIdRef.current = entry.id;
      setShowSaved(true);
      closeInlineEdit();
      await reload();
      window.setTimeout(() => {
        setShowSaved(false);
        setInlineEditStatus("idle");
      }, SAVED_DURATION_MS);
    } catch (e) {
      setInlineEditStatus("error");
      setInlineError(e instanceof Error ? e.message : "Failed to save entry");
    }
  };

  const toggleInvoicing = async (entry: ProjectManagerEntry) => {
    if (!isAdmin) return;

    const ready = entry.invoicedAt == null;
    setLoading(true);
    setError(null);
    try {
      const res = await pmSetInvoicingStatus({
        entryId: entry.id,
        ready,
      });
      if (!res.ok) throw new Error(res.error ?? "Failed to update invoicing status");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update invoicing status");
    } finally {
      setLoading(false);
    }
  };

  const toggleAllInvoicing = async () => {
    if (!isAdmin) return;
    if (!entries.length) return;

    const ready = !allInvoiced;
    setLoading(true);
    setError(null);
    try {
      const res = await pmSetInvoicingStatusBulk({
        entryIds: entries.map((e) => e.id),
        ready,
      });
      if (!res.ok) throw new Error(res.error ?? "Failed to update invoicing status");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update invoicing status");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        {/* Month selector ABOVE */}
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex items-center justify-start gap-2">
            <button
              type="button"
              className="rounded p-1 text-text-primary opacity-80 hover:bg-bg-muted hover:opacity-100"
              onClick={goPrevMonth}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[120px] text-left text-sm font-medium text-text-primary">
              {monthLabel}
            </span>
            <button
              type="button"
              className="rounded p-1 text-text-primary opacity-80 hover:bg-bg-muted hover:opacity-100"
              onClick={goNextMonth}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center justify-start gap-1.5">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const isSelected = month === m;
                const isCurrentMonth = year === currentYear && m === currentMonth;
                return (
                  <button
                    key={`${year}-${m}`}
                    type="button"
                    onClick={() => setMonth(m)}
                    className={`w-[4.0rem] cursor-pointer shrink-0 rounded-md px-2 py-1 text-center text-xs font-medium transition-colors whitespace-nowrap ${
                      isSelected
                        ? "bg-interactive-primary text-text-inverse"
                        : "border border-border-subtle bg-bg-default text-text-primary hover:bg-bg-muted"
                    } ${
                      !isSelected && isCurrentMonth
                        ? "ring-2 ring-interactive-primary ring-offset-1 ring-offset-bg-default"
                        : ""
                    }`}
                    aria-label={`Month ${m}`}
                    aria-pressed={isSelected}
                    title={isCurrentMonth ? "Current month" : undefined}
                  >
                    {TIME_REPORT_MONTH_NAMES[m - 1]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Customer/Project selects BELOW (smaller) */}
        <div className="flex flex-wrap items-start gap-3 justify-start">
          <div className="w-full sm:w-[160px] lg:w-[180px]">
            <Select
              id="pm-time-report-customer-select"
              value={selectedCustomerId}
              onValueChange={setSelectedCustomerId}
              options={customerOptions}
              placeholder="Select customer"
              size="sm"
              variant="filter"
              className="w-full min-w-0"
              triggerClassName="h-9"
            />
          </div>
          <div className="w-full sm:w-[160px] lg:w-[180px]">
            <Select
              id="pm-time-report-project-select"
              value={selectedProjectId}
              onValueChange={setSelectedProjectId}
              options={projectOptions}
              placeholder="Select project"
              size="sm"
              variant="filter"
              className="w-full min-w-0"
              triggerClassName="h-9"
            />
          </div>
        </div>

        {selectedProjectId ? (
          <div className="rounded-lg border border-border-subtle bg-bg-default px-4 py-3 shadow-sm sm:max-w-2xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[0.65rem] font-medium uppercase tracking-wide text-text-muted">
                  Invoiced hours
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
                  {loading ? "—" : HOURS_NUMBER_FORMATTER.format(displayedInvoicedHours)}
                </p>
                <p className="mt-1 max-w-md text-xs leading-snug text-text-secondary">
                  {loading ? (
                    "Loading…"
                  ) : invoicedHoursFixed != null ? (
                    <>
                      Using a <span className="font-medium text-text-primary">fixed</span> total for
                      this month. Stored line sum for this month is{" "}
                      {HOURS_NUMBER_FORMATTER.format(invoicedHoursFromLines)} h.
                    </>
                  ) : (
                    <>
                      Stored for this month from time entries (PM hour when set, else reported):{" "}
                      {HOURS_NUMBER_FORMATTER.format(invoicedHoursFromLines)} h. Refreshes when you open
                      Time approval.
                    </>
                  )}
                </p>
              </div>
              {canEdit ? (
                <div className="flex w-full min-w-0 shrink-0 flex-col gap-2 sm:w-[min(100%,18rem)]">
                  <label
                    htmlFor="pm-invoiced-fixed"
                    className="text-xs font-medium text-text-secondary"
                  >
                    Fixed amount to invoice (optional)
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      id="pm-invoiced-fixed"
                      type="text"
                      inputMode="decimal"
                      value={fixedHoursDraft}
                      onChange={(ev) => setFixedHoursDraft(ev.target.value)}
                      placeholder="Leave blank for line sum"
                      disabled={fixedSaving}
                      className={`${editInputClass} h-9 w-[min(100%,10rem)] text-right text-sm tabular-nums`}
                    />
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={fixedSaving || loading}
                      onClick={() => void applyFixedHoursDraft()}
                    >
                      Save
                    </Button>
                    {invoicedHoursFixed != null ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={fixedSaving || loading}
                        onClick={() => void saveInvoicedHoursFixed(null)}
                      >
                        Use line sum
                      </Button>
                    ) : null}
                  </div>
                  {fixedSaveError ? (
                    <p className="text-xs text-danger" role="alert">
                      {fixedSaveError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-bg-default p-6 text-sm text-text-secondary">
          No projects to manage.
        </div>
      ) : null}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      {projects.length > 0 ? (
        <div className="rounded-lg border border-border-subtle bg-bg-default p-3">
          {loading && entries.length === 0 ? (
            <div className="py-8 text-sm text-text-secondary">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="py-8 text-sm text-text-secondary">No reported time entries.</div>
          ) : (
            <div>
            <div className="mb-1.5 flex flex-wrap items-start justify-end gap-2">
              <EntryFilterMultiSelect
                id="pm-entry-filter-consultant"
                filterLabel="Consultant"
                options={consultantFilterOptions}
                selectedValues={filterConsultantIds}
                onSelectedValuesChange={setFilterConsultantIds}
                emptySummary="All consultants"
                className="w-full sm:w-[11rem]"
              />
              <EntryFilterMultiSelect
                id="pm-entry-filter-role"
                filterLabel="Role"
                options={roleFilterOptions}
                selectedValues={filterRoleIds}
                onSelectedValuesChange={setFilterRoleIds}
                emptySummary="All roles"
                className="w-full sm:w-[11rem]"
              />
              <EntryFilterMultiSelect
                id="pm-entry-filter-jira"
                filterLabel="Jira"
                options={jiraFilterOptions}
                selectedValues={filterJiraKeys}
                onSelectedValuesChange={setFilterJiraKeys}
                emptySummary="All Jira"
                className="w-full sm:min-w-[12rem] sm:max-w-[22rem]"
              />
            </div>
            {filteredEntries.length === 0 ? (
              <div className="py-6 text-sm text-text-secondary">No entries match the filters.</div>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[836px] table-fixed border-separate border-spacing-0 text-xs leading-none">
                <colgroup>
                  <col className="w-[7.25rem]" />
                  <col />
                  <col className="w-[min(7.5rem,12%)]" />
                  <col className="w-[min(12rem,18%)]" />
                  <col />
                  <col />
                  <col className="w-[3.25rem]" />
                  <col className="w-[3.75rem]" />
                  <col className="w-[min(11rem,16%)]" />
                  <col className="w-[5.5rem]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border-subtle bg-bg-muted/25 text-[0.65rem] font-medium uppercase tracking-wide text-text-muted">
                    <th className="px-3 py-1.5 text-left">
                      <button
                        type="button"
                        onClick={() => toggleSort("entryDate")}
                        className={`w-full text-left transition-colors hover:text-text-primary ${
                          sortKey === "entryDate" ? "font-semibold text-text-primary" : ""
                        }`}
                      >
                        Date
                      </button>
                    </th>
                    <th className="px-3 py-1.5 text-left">
                      <button
                        type="button"
                        onClick={() => toggleSort("consultantName")}
                        className={`w-full text-left transition-colors hover:text-text-primary ${
                          sortKey === "consultantName" ? "font-semibold text-text-primary" : ""
                        }`}
                      >
                        Consultant
                      </button>
                    </th>
                    <th className="px-3 py-1.5 text-left">
                      <button
                        type="button"
                        onClick={() => toggleSort("role")}
                        className={`w-full text-left transition-colors hover:text-text-primary ${
                          sortKey === "role" ? "font-semibold text-text-primary" : ""
                        }`}
                      >
                        Role
                      </button>
                    </th>
                    <th className="px-3 py-1.5 text-left">
                      <button
                        type="button"
                        onClick={() => toggleSort("jira")}
                        className={`w-full text-left transition-colors hover:text-text-primary ${
                          sortKey === "jira" ? "font-semibold text-text-primary" : ""
                        }`}
                      >
                        Jira
                      </button>
                    </th>
                    <th className="px-3 py-1.5 text-left">
                      <button
                        type="button"
                        onClick={() => toggleSort("task")}
                        className={`w-full text-left transition-colors hover:text-text-primary ${
                          sortKey === "task" ? "font-semibold text-text-primary" : ""
                        }`}
                      >
                        Task
                      </button>
                    </th>
                    <th className="px-3 py-1.5 text-left">
                      <button
                        type="button"
                        onClick={() => toggleSort("internalComment")}
                        className={`w-full text-left transition-colors hover:text-text-primary ${
                          sortKey === "internalComment" ? "font-semibold text-text-primary" : ""
                        }`}
                      >
                        Internal
                      </button>
                    </th>
                    <th className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort("reportedHours")}
                        className={`flex w-full items-center justify-end transition-colors hover:text-text-primary ${
                          sortKey === "reportedHours" ? "font-semibold text-text-primary" : ""
                        }`}
                      >
                        Hrs
                      </button>
                    </th>
                    <th className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort("pmHours")}
                        className={`flex w-full items-center justify-end transition-colors hover:text-text-primary ${
                          sortKey === "pmHours" ? "font-semibold text-text-primary" : ""
                        }`}
                      >
                        PM hrs
                      </button>
                    </th>
                    <th className="px-3 py-1.5 text-left">
                      <button
                        type="button"
                        onClick={() => toggleSort("pmComment")}
                        className={`w-full text-left transition-colors hover:text-text-primary ${
                          sortKey === "pmComment" ? "font-semibold text-text-primary" : ""
                        }`}
                      >
                        PM comment
                      </button>
                    </th>
                    <th className="px-3 py-1.5 text-right align-middle">
                      <div className="flex w-full min-w-0 items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleSort("status")}
                          className={`shrink-0 leading-none text-[0.65rem] font-medium uppercase tracking-wide transition-colors hover:text-text-primary ${
                            sortKey === "status"
                              ? "font-semibold text-text-primary"
                              : "text-text-muted"
                          }`}
                        >
                          Inv.
                        </button>
                        {isAdmin ? (
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                            <button
                              type="button"
                              onClick={() => toggleAllInvoicing()}
                              disabled={!entries.length || loading}
                              aria-label={allInvoiced ? "Unmark all invoicing" : "Mark all invoicing"}
                              title={allInvoiced ? "Unmark all invoicing" : "Mark all invoicing"}
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-md border border-border-subtle/80 transition-colors ${
                                allInvoiced
                                  ? "border-success/35 bg-success/10 text-success"
                                  : "bg-bg-muted/30 text-text-muted hover:bg-bg-muted/50"
                              }`}
                            >
                              {allInvoiced ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="text-text-primary">
                  {sortedEntries.map((e) => {
                    const isInvoiced = e.invoicedAt != null;
                    const canEditEntry = canEdit && (isAdmin || !isInvoiced);
                    const reportedHours = e.hours;
                    const pmHoursValue = e.pmEditedHours ?? null;
                    const pmComment = e.pmEditedComment ?? "";
                    const internalComment = e.internalComment ?? "";
                    const jiraLine =
                      e.jiraKey != null && e.jiraKey !== ""
                        ? e.jiraTitle
                          ? `${e.jiraKey} — ${e.jiraTitle}`
                          : e.jiraKey
                        : "";

                    return (
                      <tr
                        key={e.id}
                        className="border-b border-border-subtle/70 transition-colors odd:bg-bg-muted/25 even:bg-transparent last:border-b-0 hover:bg-bg-muted/45"
                      >
                        <td className="max-w-0 px-3 py-1 align-middle">
                          <div
                            className="truncate whitespace-nowrap tabular-nums text-text-secondary"
                            title={e.entryDate.trim()}
                          >
                            {formatEntryDateCell(e.entryDate)}
                          </div>
                        </td>
                        <td className="max-w-0 px-3 py-1 align-middle">
                          <TruncatedWithTooltip text={e.consultantName} />
                        </td>
                        <td className="max-w-0 px-3 py-1 align-middle">
                          <TruncatedWithTooltip text={e.roleName} />
                        </td>
                        <td className="max-w-0 px-3 py-1 align-middle">
                          {jiraLine ? (
                            <TruncatedWithTooltip text={jiraLine} className="font-medium" />
                          ) : (
                            <span className="text-text-primary/60">—</span>
                          )}
                        </td>
                        <td className="max-w-0 px-3 py-1 align-middle">
                          <TruncatedWithTooltip text={e.task ?? ""} className="font-medium" />
                        </td>
                        <td className="max-w-0 px-3 py-1 align-middle">
                          <TruncatedWithTooltip
                            text={internalComment}
                            className="text-text-secondary"
                          />
                        </td>
                        <td className="max-w-0 px-3 py-1 align-middle text-right font-semibold tabular-nums">
                          {HOURS_NUMBER_FORMATTER.format(reportedHours)}
                        </td>
                        <td className="max-w-0 px-3 py-1 align-middle text-right">
                          {editingEntryId === e.id && editingField === "pmHours" ? (
                            <input
                              type="text"
                              value={editHoursStr}
                              onChange={(ev) => setEditHoursStr(ev.target.value)}
                              onFocus={(ev) => ev.target.select()}
                              onBlur={commitInlineEdit}
                              onKeyDown={(ev) => {
                                if (ev.key === "Enter") {
                                  ev.preventDefault();
                                  commitInlineEdit();
                                }
                                if (ev.key === "Escape") {
                                  ev.preventDefault();
                                  closeInlineEdit();
                                }
                              }}
                              className={`${editInputClass} text-right text-xs`}
                              placeholder="0"
                              inputMode="decimal"
                              autoFocus
                            />
                          ) : canEditEntry ? (
                            <button
                              type="button"
                              aria-label="Edit PM hours"
                              onClick={() => startInlineEdit(e, "pmHours")}
                              className="group flex h-6 w-full min-w-0 cursor-pointer items-center justify-end rounded-md border border-transparent px-1 text-right transition-colors hover:bg-bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-inset"
                            >
                              <span className="min-w-0 flex-1 truncate font-semibold tabular-nums">
                                {pmHoursValue != null
                                  ? HOURS_NUMBER_FORMATTER.format(pmHoursValue)
                                  : "—"}
                              </span>
                            </button>
                          ) : (
                            <FieldValue className="!text-right text-xs tabular-nums">
                              {pmHoursValue != null
                                ? HOURS_NUMBER_FORMATTER.format(pmHoursValue)
                                : "—"}
                            </FieldValue>
                          )}
                        </td>
                        <td className="max-w-0 px-3 py-1 align-middle">
                          <InlineEditFieldContainer
                            className="[&_[data-inline-edit-value-row]]:!min-h-0"
                            isEditing={editingEntryId === e.id && editingField === "pmComment"}
                            onRequestClose={commitInlineEdit}
                            reserveStatusRow={false}
                            showSavedIndicator={
                              showSaved &&
                              lastSavedEntryIdRef.current === e.id &&
                              lastSavedFieldRef.current === "pmComment"
                            }
                            displayContent={
                              canEditEntry ? (
                                <InlineEditTrigger
                                  className="!min-h-[1.25rem] !py-0 !text-xs !leading-none"
                                  onClick={() => startInlineEdit(e, "pmComment")}
                                >
                                  <TruncatedWithTooltip text={pmComment} className="font-semibold" />
                                </InlineEditTrigger>
                              ) : (
                                <TruncatedWithTooltip text={pmComment} className="font-semibold" />
                              )
                            }
                            editContent={
                              <div className="flex w-full min-w-0 flex-col gap-1">
                                <textarea
                                  rows={3}
                                  value={editCommentStr}
                                  onChange={(ev) => setEditCommentStr(ev.target.value)}
                                  onBlur={commitInlineEdit}
                                  onKeyDown={(ev) => {
                                    if (ev.key === "Escape") {
                                      ev.preventDefault();
                                      closeInlineEdit();
                                    }
                                  }}
                                  className={`${editInputClass} resize-none text-xs`}
                                  placeholder="Add comment (optional)"
                                  autoFocus
                                />
                                <InlineEditStatus status={inlineEditStatus} message={inlineError} />
                              </div>
                            }
                            statusContent={
                              <InlineEditStatus status={inlineEditStatus} message={inlineError} />
                            }
                          />
                        </td>
                        <td className="max-w-0 px-3 py-1 align-middle text-right">
                          <div className="flex w-full min-w-0 items-center justify-end">
                            <button
                              type="button"
                              aria-label={isInvoiced ? "Turn off invoicing" : "Turn on invoicing"}
                              title={isInvoiced ? "Ready for invoicing" : "Not ready for invoicing"}
                              onClick={() => toggleInvoicing(e)}
                              disabled={!isAdmin}
                              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border-subtle/80 transition-colors ${
                                isInvoiced
                                  ? "border-success/35 bg-success/10 text-success"
                                  : "bg-bg-muted/25 text-text-muted"
                              } ${!isAdmin ? "cursor-not-allowed opacity-40" : "hover:bg-bg-muted/45"}`}
                            >
                              {isInvoiced ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : (
                                <Circle className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border-subtle bg-bg-muted/50 text-text-primary">
                    <td colSpan={6} className="px-3 py-1.5" aria-hidden />
                    <td className="max-w-0 px-3 py-1.5 text-right text-xs font-semibold tabular-nums">
                      {HOURS_NUMBER_FORMATTER.format(hourColumnTotals.totalReported)}
                    </td>
                    <td className="max-w-0 px-3 py-1.5 text-right text-xs font-semibold tabular-nums">
                      {HOURS_NUMBER_FORMATTER.format(hourColumnTotals.totalPmEdited)}
                    </td>
                    <td colSpan={2} className="px-3 py-1.5" aria-hidden />
                  </tr>
                </tfoot>
              </table>
            </div>
            )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

