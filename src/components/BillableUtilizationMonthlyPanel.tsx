"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Team } from "@/lib/teamsQueries";
import type {
  BillableUtilizationMonthlyReportResult,
  BillableUtilizationMonth,
  BillableUtilizationMonthPoint,
} from "@/types/billableUtilizationReport";
import { getBillableUtilizationMonthlyReportAction } from "@/app/(app)/reports/actions";
import { ListFilterMenu } from "@/components/ListFilterMenu";
import { ListTableToolbar } from "@/components/ListTableToolbar";
import type { ProbabilityDisplay } from "@/lib/allocationPageView";
import { Panel, PanelSectionTitle, Select } from "@/components/ui";

const MONTH_WINDOW = 12;
const STEP_MONTHS = 3;
const START_OFFSET_MONTHS = -2;

type ChartPoint = BillableUtilizationMonth & BillableUtilizationMonthPoint;

function addCalendarMonths(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  let m = month + delta;
  let y = year;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { year: y, month: m };
}

function buildMonthsForOffset(
  anchorYear: number,
  anchorMonth: number,
  offset: number
): { year: number; month: number }[] {
  const start = addCalendarMonths(
    anchorYear,
    anchorMonth,
    START_OFFSET_MONTHS + offset * STEP_MONTHS
  );
  const months: { year: number; month: number }[] = [];
  let y = start.year;
  let m = start.month;
  for (let i = 0; i < MONTH_WINDOW; i++) {
    months.push({ year: y, month: m });
    const next = addCalendarMonths(y, m, 1);
    y = next.year;
    m = next.month;
  }
  return months;
}

type Props = {
  initialData: BillableUtilizationMonthlyReportResult;
  teams: Team[];
  anchorYear: number;
  anchorMonth: number;
};

function formatPercent(n: number): string {
  return `${n}%`;
}

function formatRevenueCompact(value: number): string {
  if (value <= 0) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return `${Math.round(value / 1000)}k`;
}

function monthShort(label: string): string {
  return label.split(" ")[0] ?? label;
}

function pctLabel(value: number): string {
  return `${Math.round(value)}%`;
}

function ChartValueTable({
  rows,
  months,
}: {
  months: ChartPoint[];
  rows: { key: string; label: string; format: (p: ChartPoint) => string }[];
}) {
  return (
    <div className="mt-1 overflow-x-auto">
      <table className="w-full min-w-0 border-collapse text-[9px] tabular-nums leading-tight text-text-primary/85">
        <thead>
          <tr>
            <th className="w-12 pb-0.5 text-left font-normal text-text-primary/50" />
            {months.map((m) => (
              <th
                key={m.label}
                className="min-w-[2.25rem] px-0.5 pb-0.5 text-center font-normal text-text-primary/50"
              >
                {monthShort(m.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="py-0.5 pr-1 text-left text-text-primary/55">{row.label}</td>
              {months.map((m) => (
                <td key={`${row.key}-${m.label}`} className="px-0.5 py-0.5 text-center">
                  {row.format(m)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BillableUtilizationMonthlyPanel({
  initialData,
  teams,
  anchorYear,
  anchorMonth,
}: Props) {
  const [data, setData] = useState(initialData);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [probabilityDisplay, setProbabilityDisplay] =
    useState<ProbabilityDisplay>("weighted");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  const monthsForOffset = useMemo(
    () => buildMonthsForOffset(anchorYear, anchorMonth, offset),
    [anchorYear, anchorMonth, offset]
  );

  const fetchData = useCallback(
    async (
      months: { year: number; month: number }[],
      teams: string[],
      probability: ProbabilityDisplay
    ) => {
      setLoading(true);
      try {
        const result = await getBillableUtilizationMonthlyReportAction(
          months,
          teams.length === 0 ? null : teams,
          probability
        );
        setData(result);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const onTeamChange = useCallback(
    (value: string[]) => {
      setTeamIds(value);
      fetchData(monthsForOffset, value, probabilityDisplay);
    },
    [monthsForOffset, fetchData, probabilityDisplay]
  );

  const onProbabilityChange = useCallback(
    (value: string) => {
      const next = value as ProbabilityDisplay;
      setProbabilityDisplay(next);
      fetchData(monthsForOffset, teamIds, next);
    },
    [monthsForOffset, fetchData, teamIds]
  );

  const onPrev = useCallback(() => {
    const newOffset = offset - 1;
    setOffset(newOffset);
    const months = buildMonthsForOffset(anchorYear, anchorMonth, newOffset);
    fetchData(months, teamIds, probabilityDisplay);
  }, [offset, anchorYear, anchorMonth, teamIds, probabilityDisplay, fetchData]);

  const onNext = useCallback(() => {
    const newOffset = offset + 1;
    setOffset(newOffset);
    const months = buildMonthsForOffset(anchorYear, anchorMonth, newOffset);
    fetchData(months, teamIds, probabilityDisplay);
  }, [offset, anchorYear, anchorMonth, teamIds, probabilityDisplay, fetchData]);

  const chartData: ChartPoint[] = data.months.map((m, i) => ({
    ...m,
    ...(data.points[i] ?? {
      actualBillableHours: 0,
      forecastBillableHours: 0,
      monthCapacityHours: 0,
      actualUtilizationPct: 0,
      forecastUtilizationPct: 0,
      budgetUtilizationPct: null,
      actualRevenue: 0,
      forecastRevenue: 0,
      currency: "SEK",
    }),
  }));

  const teamOptions = teams.map((t) => ({ id: t.id, name: t.name }));

  const maxRevenue = Math.max(
    0,
    ...chartData.map((p) => Math.max(p.actualRevenue, p.forecastRevenue))
  );
  const revenueAxisMax =
    maxRevenue > 0 ? Math.ceil(maxRevenue * 1.15 / 100_000) * 100_000 : 100_000;

  const showBudgetLine = chartData.some((p) => p.budgetUtilizationPct != null);

  return (
    <Panel>
      <PanelSectionTitle>BILLABLE UTILIZATION & REVENUE</PanelSectionTitle>
      <div className="p-3 pt-0">
        <p className="mb-4 text-xs text-text-primary/75">
          Utilization is billable hours ÷ capacity hours (calendar month × each consultant&apos;s
          capacity %; no overhead adjustment). Forecast uses planned allocation;
          outcome from time reports. View matches the allocation page for probability on
          forecast hours and revenue.
        </p>
        <ListTableToolbar
          leading={
            <Select
              variant="filter"
              value={probabilityDisplay}
              onValueChange={onProbabilityChange}
              options={[
                { value: "weighted", label: "With probability" },
                { value: "none", label: "Without probability" },
              ]}
              className="w-auto min-w-0"
              triggerClassName={`h-7 min-w-[160px] ${probabilityDisplay === "weighted" ? "bg-brand-blue/25 text-text-primary" : ""}`}
            />
          }
          trailing={
            <>
              <ListFilterMenu
                ariaLabel="Filter billable utilization"
                sections={[
                  {
                    id: "team",
                    label: "Team",
                    allLabel: "All teams",
                    options: teamOptions,
                    selectedIds: teamIds,
                    onChange: onTeamChange,
                  },
                ]}
              />
              <button
                type="button"
                onClick={onPrev}
                className="rounded-sm p-1 text-text-primary opacity-80 hover:bg-bg-muted hover:opacity-100"
                aria-label="Previous period"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onNext}
                className="rounded-sm p-1 text-text-primary opacity-80 hover:bg-bg-muted hover:opacity-100"
                aria-label="Next period"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          }
        />

        {loading ? (
          <p className="py-8 text-center text-sm text-text-primary opacity-70">
            Loading…
          </p>
        ) : chartData.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-primary opacity-70">
            No data for the selected period.
          </p>
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-heading-xs text-text-muted">
                Utilization (%)
              </h3>
              <div className="h-[260px] w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      opacity={0.5}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{
                        fontSize: 11,
                        fill: "var(--color-text-primary)",
                        opacity: 0.8,
                      }}
                      tickLine={false}
                      axisLine={{ stroke: "var(--color-border)" }}
                    />
                    <YAxis
                      domain={[0, 120]}
                      ticks={[0, 25, 50, 75, 100, 120]}
                      tickFormatter={formatPercent}
                      tick={{
                        fontSize: 11,
                        fill: "var(--color-text-primary)",
                        opacity: 0.8,
                      }}
                      tickLine={false}
                      axisLine={{ stroke: "var(--color-border)" }}
                    />
                    <ReferenceLine
                      y={100}
                      stroke="var(--color-brand-lilac)"
                      strokeOpacity={0.5}
                      strokeDasharray="4 4"
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(value) => (
                        <span className="text-text-primary opacity-90">{value}</span>
                      )}
                    />
                    <Line
                      type="monotone"
                      dataKey="actualUtilizationPct"
                      name="Outcome"
                      stroke="var(--color-brand-signal)"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "var(--color-brand-signal)" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="forecastUtilizationPct"
                      name="Forecast (allocated)"
                      stroke="var(--color-brand-lilac)"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={{ r: 3, fill: "var(--color-brand-lilac)" }}
                    />
                    {showBudgetLine && (
                      <Line
                        type="monotone"
                        dataKey="budgetUtilizationPct"
                        name="Budget target"
                        stroke="var(--color-status-warning)"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "var(--color-status-warning)" }}
                        connectNulls={false}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <ChartValueTable
                months={chartData}
                rows={[
                  {
                    key: "outcome",
                    label: "Out",
                    format: (p) => pctLabel(p.actualUtilizationPct),
                  },
                  {
                    key: "forecast",
                    label: "Fcst",
                    format: (p) => pctLabel(p.forecastUtilizationPct),
                  },
                  ...(showBudgetLine
                    ? [
                        {
                          key: "budget",
                          label: "Bdgt",
                          format: (p: ChartPoint) =>
                            p.budgetUtilizationPct != null
                              ? pctLabel(p.budgetUtilizationPct)
                              : "—",
                        },
                      ]
                    : []),
                ]}
              />
            </div>

            <div>
              <h3 className="mb-2 text-heading-xs text-text-muted">
                Revenue (not mixed across currencies)
              </h3>
              <div className="h-[260px] w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      opacity={0.5}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{
                        fontSize: 11,
                        fill: "var(--color-text-primary)",
                        opacity: 0.8,
                      }}
                      tickLine={false}
                      axisLine={{ stroke: "var(--color-border)" }}
                    />
                    <YAxis
                      domain={[0, revenueAxisMax]}
                      tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                      tick={{
                        fontSize: 11,
                        fill: "var(--color-text-primary)",
                        opacity: 0.8,
                      }}
                      tickLine={false}
                      axisLine={{ stroke: "var(--color-border)" }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(value) => (
                        <span className="text-text-primary opacity-90">{value}</span>
                      )}
                    />
                    <Bar
                      dataKey="actualRevenue"
                      name="Reported"
                      fill="var(--color-brand-blue)"
                      fillOpacity={0.75}
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar
                      dataKey="forecastRevenue"
                      name="Forecast"
                      fill="var(--color-brand-lilac)"
                      fillOpacity={0.55}
                      radius={[2, 2, 0, 0]}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <ChartValueTable
                months={chartData}
                rows={[
                  {
                    key: "reported",
                    label: "Rep",
                    format: (p) => formatRevenueCompact(p.actualRevenue),
                  },
                  {
                    key: "forecast",
                    label: "Fcst",
                    format: (p) => formatRevenueCompact(p.forecastRevenue),
                  },
                ]}
              />
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
