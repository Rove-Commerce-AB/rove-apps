"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DataTable,
  FilterChip,
  PageHeader,
  Panel,
  PanelSectionTitle,
  Select,
} from "@/components/ui";
import { getTimeReportSummaryAction } from "@/app/(app)/time-report/actions";
import { ROUTES } from "@/lib/routes";
import { compareTextSv } from "@/lib/sort";
import type { ProjectType } from "@/types";
import type {
  TimeReportSummaryBucket,
  TimeReportSummaryData,
} from "@/lib/timeReportSummaryTypes";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const TYPE_FILTERS: { value: ProjectType; label: string }[] = [
  { value: "customer", label: "Customer" },
  { value: "internal", label: "Internal" },
  { value: "absence", label: "Absence" },
];

function formatHours(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 0.05) return "0";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function sumHours(rows: TimeReportSummaryBucket[]): number {
  return rows.reduce((acc, r) => acc + r.hours, 0);
}

function groupBy<K extends string>(
  rows: TimeReportSummaryBucket[],
  keyFn: (row: TimeReportSummaryBucket) => { id: K; name: string }
): { id: K; name: string; hours: number }[] {
  const map = new Map<string, { id: K; name: string; hours: number }>();
  for (const row of rows) {
    const { id, name } = keyFn(row);
    const existing = map.get(id);
    if (existing) existing.hours += row.hours;
    else map.set(id, { id, name, hours: row.hours });
  }
  return [...map.values()]
    .filter((r) => r.hours > 0)
    .sort((a, b) => b.hours - a.hours || compareTextSv(a.name, b.name));
}

type Props = {
  initial: TimeReportSummaryData;
};

export function TimeReportSummaryClient({ initial }: Props) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  /** Empty = all types. */
  const [typeFilterIds, setTypeFilterIds] = useState<ProjectType[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const typeScoped = useMemo(() => {
    return data.buckets.filter((b) => {
      if (
        typeFilterIds.length > 0 &&
        !typeFilterIds.includes(b.projectType)
      ) {
        return false;
      }
      if (monthFilter != null && b.month !== monthFilter) return false;
      return true;
    });
  }, [data.buckets, typeFilterIds, monthFilter]);

  const scoped = useMemo(() => {
    return data.buckets.filter((b) => {
      if (monthFilter != null && b.month !== monthFilter) return false;
      if (customerId && b.customerId !== customerId) return false;
      if (projectId && b.projectId !== projectId) return false;
      return true;
    });
  }, [data.buckets, customerId, projectId, monthFilter]);

  const totals = useMemo(() => {
    const customer = sumHours(scoped.filter((b) => b.projectType === "customer"));
    const internal = sumHours(scoped.filter((b) => b.projectType === "internal"));
    const absence = sumHours(scoped.filter((b) => b.projectType === "absence"));
    return {
      customer,
      internal,
      absence,
      total: customer + internal + absence,
    };
  }, [scoped]);

  const byCustomer = useMemo(
    () =>
      groupBy(typeScoped, (b) => ({
        id: b.customerId,
        name: b.customerName,
      })),
    [typeScoped]
  );

  const byProject = useMemo(
    () =>
      groupBy(
        typeScoped.filter((b) => !customerId || b.customerId === customerId),
        (b) => ({
          id: b.projectId,
          name:
            b.projectType === "customer"
              ? `${b.projectName} · ${b.customerName}`
              : b.projectName,
        })
      ),
    [typeScoped, customerId]
  );

  const absenceProjects = useMemo(
    () =>
      groupBy(
        data.buckets.filter(
          (b) =>
            b.projectType === "absence" &&
            (monthFilter == null || b.month === monthFilter)
        ),
        (b) => ({ id: b.projectId, name: b.projectName })
      ),
    [data.buckets, monthFilter]
  );

  /** Month chart ignores monthFilter so all bars stay visible while one is selected. */
  const monthChartBuckets = useMemo(() => {
    return data.buckets.filter((b) => {
      if (
        typeFilterIds.length > 0 &&
        !typeFilterIds.includes(b.projectType)
      ) {
        return false;
      }
      if (customerId && b.customerId !== customerId) return false;
      if (projectId && b.projectId !== projectId) return false;
      return true;
    });
  }, [data.buckets, typeFilterIds, customerId, projectId]);

  const showAbsencePanel =
    typeFilterIds.length === 0 || typeFilterIds.includes("absence");
  const showCustomerPanel =
    typeFilterIds.length === 0 ||
    typeFilterIds.some((t) => t === "customer" || t === "internal");

  function toggleTypeFilter(value: ProjectType) {
    setTypeFilterIds((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value]
    );
  }

  const byMonth = useMemo(() => {
    const hours = Array.from({ length: 12 }, () => 0);
    for (const b of monthChartBuckets) {
      if (b.month >= 1 && b.month <= 12) hours[b.month - 1]! += b.hours;
    }
    return hours;
  }, [monthChartBuckets]);

  const maxMonth = Math.max(1, ...byMonth);

  const changeYear = (yearStr: string) => {
    const year = Number(yearStr);
    startTransition(async () => {
      const next = await getTimeReportSummaryAction(year);
      setData(next);
      setCustomerId(null);
      setProjectId(null);
      setMonthFilter(null);
    });
  };

  const toggleMonth = (month: number) => {
    setMonthFilter((prev) => (prev === month ? null : month));
  };

  const toggleCustomer = (id: string) => {
    if (customerId === id) {
      setCustomerId(null);
      setProjectId(null);
      return;
    }
    setCustomerId(id);
    setProjectId((prev) => {
      if (!prev) return null;
      const stillOnCustomer = data.buckets.some(
        (b) => b.projectId === prev && b.customerId === id
      );
      return stillOnCustomer ? prev : null;
    });
  };

  const toggleProject = (id: string) => {
    if (projectId === id) {
      setProjectId(null);
      return;
    }
    setProjectId(id);
    const match = data.buckets.find((b) => b.projectId === id);
    if (match) setCustomerId(match.customerId);
  };

  if (!data.consultantId) {
    return (
      <div>
        <PageHeader
          title="Time report"
          description="Your reported hours across the year."
          className="mb-6"
        />
        <p className="text-sm text-text-secondary">
          Your user is not linked to a consultant, so there is no time report to
          summarise.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Time report"
        description={
          data.consultantName
            ? `Reported hours for ${data.consultantName}. Calendar year ${data.year}.`
            : `Reported hours for calendar year ${data.year}.`
        }
        className="mb-6"
      >
        <Select
          id="time-report-summary-year"
          label="Year"
          value={String(data.year)}
          onValueChange={changeYear}
          options={data.availableYears.map((y) => ({
            value: String(y),
            label: String(y),
          }))}
          variant="filter"
          size="sm"
          disabled={pending}
          className="w-28"
        />
      </PageHeader>

      <div className="mb-1.5 flex flex-wrap gap-1.5">
        <FilterChip
          selected={typeFilterIds.length === 0}
          onClick={() => setTypeFilterIds([])}
        >
          All
        </FilterChip>
        {TYPE_FILTERS.map((f) => (
          <FilterChip
            key={f.value}
            selected={typeFilterIds.includes(f.value)}
            onClick={() => toggleTypeFilter(f.value)}
          >
            {f.label}
          </FilterChip>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            { label: "Total", hours: totals.total },
            { label: "Customer", hours: totals.customer },
            { label: "Internal", hours: totals.internal },
            { label: "Absence", hours: totals.absence },
          ] as const
        ).map((card) => (
          <div
            key={card.label}
            className="rounded-panel border border-panel px-4 py-3"
            style={{ backgroundColor: "var(--panel-bg)" }}
          >
            <p className="text-xs text-text-tertiary">{card.label}</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-text-primary">
              {formatHours(card.hours)}
              <span className="ml-1 text-sm font-medium text-text-secondary">h</span>
            </p>
          </div>
        ))}
      </div>

      {data.buckets.length === 0 ? (
        <p className="text-sm text-text-secondary">
          No hours reported in {data.year}.{" "}
          <button
            type="button"
            className="font-medium text-brand-signal underline underline-offset-2"
            onClick={() => router.push(ROUTES.timeReport)}
          >
            Open time report
          </button>
        </p>
      ) : (
        <div className="space-y-4">
          {showAbsencePanel ? (
            <Panel>
              <PanelSectionTitle>Absence</PanelSectionTitle>
              <div className="px-1 pb-1">
                {absenceProjects.length === 0 ? (
                  <p className="px-3 pb-3 text-sm text-text-secondary">
                    No absence reported this year.
                  </p>
                ) : (
                  <DataTable
                    density="compact"
                    columns={[
                      {
                        id: "name",
                        header: "Project",
                        cell: (row) => row.name,
                      },
                      {
                        id: "hours",
                        header: "Hours",
                        align: "right",
                        cell: (row) => (
                          <span className="tabular-nums">{formatHours(row.hours)}</span>
                        ),
                      },
                    ]}
                    rows={absenceProjects}
                    getRowId={(row) => row.id}
                    selectedRowId={projectId ?? undefined}
                    onRowClick={(row) => toggleProject(row.id)}
                  />
                )}
              </div>
            </Panel>
          ) : null}

          <Panel>
            <PanelSectionTitle>By month</PanelSectionTitle>
            <div className="grid grid-cols-4 gap-3 px-3 pb-3 sm:grid-cols-6 lg:grid-cols-12">
              {byMonth.map((hours, i) => {
                const month = i + 1;
                const selected = monthFilter === month;
                return (
                  <button
                    key={MONTH_LABELS[i]}
                    type="button"
                    aria-pressed={selected}
                    title={`Filter ${MONTH_LABELS[i]}: ${formatHours(hours)} h`}
                    onClick={() => toggleMonth(month)}
                    className={`min-w-0 rounded-md px-0.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal focus-visible:ring-offset-2 ${
                      selected
                        ? "bg-interactive-primary/10 ring-1 ring-interactive-primary"
                        : "hover:bg-bg-muted"
                    }`}
                  >
                    <div className="flex h-16 items-end">
                      <div
                        className={`w-full rounded-sm ${
                          selected ? "bg-interactive-primary" : "bg-brand-signal/80"
                        }`}
                        style={{
                          height: `${Math.max(hours > 0 ? 8 : 0, (hours / maxMonth) * 100)}%`,
                        }}
                      />
                    </div>
                    <p
                      className={`mt-1 text-center text-[10px] ${
                        selected ? "font-medium text-text-primary" : "text-text-tertiary"
                      }`}
                    >
                      {MONTH_LABELS[i]}
                    </p>
                    <p
                      className={`text-center text-[11px] tabular-nums ${
                        selected ? "text-text-primary" : "text-text-secondary"
                      }`}
                    >
                      {formatHours(hours)}
                    </p>
                  </button>
                );
              })}
            </div>
          </Panel>

          {showCustomerPanel ? (
            <Panel>
              <PanelSectionTitle>By customer</PanelSectionTitle>
              <div className="px-1 pb-1">
                {byCustomer.length === 0 ? (
                  <p className="px-3 pb-3 text-sm text-text-secondary">
                    No customer hours in this filter.
                  </p>
                ) : (
                  <DataTable
                    density="compact"
                    columns={[
                      {
                        id: "name",
                        header: "Customer",
                        cell: (row) => row.name,
                      },
                      {
                        id: "hours",
                        header: "Hours",
                        align: "right",
                        cell: (row) => (
                          <span className="tabular-nums">{formatHours(row.hours)}</span>
                        ),
                      },
                    ]}
                    rows={byCustomer}
                    getRowId={(row) => row.id}
                    selectedRowId={customerId ?? undefined}
                    onRowClick={(row) => toggleCustomer(row.id)}
                  />
                )}
              </div>
            </Panel>
          ) : null}

          <Panel>
            <PanelSectionTitle>By project</PanelSectionTitle>
            <div className="px-1 pb-1">
              {byProject.length === 0 ? (
                <p className="px-3 pb-3 text-sm text-text-secondary">
                  No project hours in this filter.
                </p>
              ) : (
                <DataTable
                  density="compact"
                  columns={[
                    {
                      id: "name",
                      header: "Project",
                      cell: (row) => row.name,
                    },
                    {
                      id: "hours",
                      header: "Hours",
                      align: "right",
                      cell: (row) => (
                        <span className="tabular-nums">{formatHours(row.hours)}</span>
                      ),
                    },
                  ]}
                  rows={byProject}
                  getRowId={(row) => row.id}
                  selectedRowId={projectId ?? undefined}
                  onRowClick={(row) => toggleProject(row.id)}
                />
              )}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
