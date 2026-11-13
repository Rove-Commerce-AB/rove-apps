"use client";

import { useState, useCallback, useMemo } from "react";
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addWeeksToYearWeek } from "@/lib/dateUtils";
import type { Role } from "@/lib/rolesQueries";
import type { Team } from "@/lib/teamsQueries";
import type {
  OccupancyReportResult,
  OccupancyDataPoint,
  OccupancyWeek,
} from "@/types/occupancyReport";
import { getOccupancyReportDataAction } from "@/app/(app)/reports/actions";
import { ListFilterMenu } from "@/components/ListFilterMenu";
import { ListTableToolbar } from "@/components/ListTableToolbar";
import { Panel, PanelSectionTitle } from "@/components/ui";

const WINDOW_SIZE = 28;
const STEP_WEEKS = 4;
const START_OFFSET_FROM_CURRENT = -2;

type ChartPoint = OccupancyWeek &
  OccupancyDataPoint & {
    overheadPct: number;
    customer100Pct: number;
    leadsPct: number;
    internalPct: number;
    absencePct: number;
  };

function buildWeeksForOffset(
  currentYear: number,
  currentWeek: number,
  offset: number
): { year: number; week: number }[] {
  const weeks: { year: number; week: number }[] = [];
  const startDelta = START_OFFSET_FROM_CURRENT + offset * STEP_WEEKS;
  for (let i = 0; i < WINDOW_SIZE; i++) {
    weeks.push(addWeeksToYearWeek(currentYear, currentWeek, startDelta + i));
  }
  return weeks;
}

type Props = {
  initialData: OccupancyReportResult;
  roles: Role[];
  teams: Team[];
  currentYear: number;
  currentWeek: number;
};

function formatPercent(n: number): string {
  return `${n}%`;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; payload?: ChartPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const totalPct =
    (point.overheadPct ?? 0) +
    (point.customer100Pct ?? 0) +
    (point.leadsPct ?? 0) +
    (point.internalPct ?? 0) +
    (point.absencePct ?? 0);
  return (
    <div className="rounded-lg border border-form bg-bg-default px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 font-medium text-text-primary">{label}</p>
      <div className="mt-2 border-t border-form pt-2">
        <p className="mb-1.5 font-medium text-text-primary">
          Total: {Math.round(totalPct)}%
        </p>
        <p className="text-text-primary opacity-70">
          Overhead: {Math.round(point.overheadHours ?? 0)} h ({Math.round(point.overheadPct ?? 0)}%)
        </p>
        <p className="text-text-primary opacity-70">
          Customer projects: {Math.round(point.customer100Hours)} h ({Math.round(point.customer100Pct ?? 0)}%)
        </p>
        <p className="text-text-primary opacity-70">
          Leads: {Math.round(point.leadsHours)} h ({Math.round(point.leadsPct ?? 0)}%)
        </p>
        <p className="text-text-primary opacity-70">
          Internal projects: {Math.round(point.internalHours)} h ({Math.round(point.internalPct ?? 0)}%)
        </p>
        <p className="text-text-primary opacity-70">
          Absence: {Math.round(point.absenceHours)} h ({Math.round(point.absencePct ?? 0)}%)
        </p>
      </div>
    </div>
  );
}

export function OccupancyChartPanel({
  initialData,
  roles,
  teams,
  currentYear,
  currentWeek,
}: Props) {
  const [data, setData] = useState<OccupancyReportResult>(initialData);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  const weeksForOffset = useMemo(
    () => buildWeeksForOffset(currentYear, currentWeek, offset),
    [currentYear, currentWeek, offset]
  );

  const fetchData = useCallback(
    async (
      weeks: { year: number; week: number }[],
      roles: string[],
      teams: string[]
    ) => {
      setLoading(true);
      try {
        const result = await getOccupancyReportDataAction(
          weeks,
          roles.length === 0 ? null : roles,
          teams.length === 0 ? null : teams
        );
        setData(result);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const onRoleChange = useCallback(
    (value: string[]) => {
      setRoleIds(value);
      fetchData(weeksForOffset, value, teamIds);
    },
    [weeksForOffset, fetchData, teamIds]
  );

  const onTeamChange = useCallback(
    (value: string[]) => {
      setTeamIds(value);
      fetchData(weeksForOffset, roleIds, value);
    },
    [weeksForOffset, fetchData, roleIds]
  );

  const onPrev = useCallback(() => {
    const newOffset = offset - 1;
    setOffset(newOffset);
    const weeks = buildWeeksForOffset(currentYear, currentWeek, newOffset);
    fetchData(weeks, roleIds, teamIds);
  }, [offset, currentYear, currentWeek, roleIds, teamIds, fetchData]);

  const onNext = useCallback(() => {
    const newOffset = offset + 1;
    setOffset(newOffset);
    const weeks = buildWeeksForOffset(currentYear, currentWeek, newOffset);
    fetchData(weeks, roleIds, teamIds);
  }, [offset, currentYear, currentWeek, roleIds, teamIds, fetchData]);

  const chartData: ChartPoint[] = data.weeks.map((w, i) => {
    const p = data.points[i];
    const cap = p.capacity || 0;
    const overheadH = p.overheadHours ?? 0;
    const totalBase = cap + overheadH;
    const overheadPct = totalBase > 0 ? (overheadH / totalBase) * 100 : 0;
    const customer100Pct = totalBase > 0 ? (p.customer100Hours / totalBase) * 100 : 0;
    const leadsPct = totalBase > 0 ? (p.leadsHours / totalBase) * 100 : 0;
    const internalPct = totalBase > 0 ? (p.internalHours / totalBase) * 100 : 0;
    const absencePct = totalBase > 0 ? (p.absenceHours / totalBase) * 100 : 0;
    return {
      ...w,
      ...p,
      overheadPct: Math.round(overheadPct * 10) / 10,
      customer100Pct: Math.round(customer100Pct * 10) / 10,
      leadsPct: Math.round(leadsPct * 10) / 10,
      internalPct: Math.round(internalPct * 10) / 10,
      absencePct: Math.round(absencePct * 10) / 10,
    };
  });

  const currentWeekLabel = chartData.find(
    (p) => p.year === currentYear && p.week === currentWeek
  )?.label;

  const roleOptions = roles.map((r) => ({ id: r.id, name: r.name }));
  const teamOptions = teams.map((t) => ({ id: t.id, name: t.name }));

  return (
    <Panel>
      <PanelSectionTitle>OCCUPANCY</PanelSectionTitle>
      <div className="p-3 pt-0">
        <ListTableToolbar
          trailing={
            <>
              <ListFilterMenu
                ariaLabel="Filter occupancy"
                sections={[
                  {
                    id: "role",
                    label: "Role",
                    allLabel: "All roles",
                    options: roleOptions,
                    selectedIds: roleIds,
                    onChange: onRoleChange,
                  },
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
          <div className="h-[300px] w-full min-h-0">
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
                  tick={{ fontSize: 11, fill: "var(--color-text-primary)", opacity: 0.8 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border)" }}
                />
                <YAxis
                  domain={[0, 120]}
                  ticks={[0, 20, 40, 60, 80, 100, 120]}
                  tickFormatter={formatPercent}
                  tick={{ fontSize: 11, fill: "var(--color-text-primary)", opacity: 0.8 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border)" }}
                />
                <ReferenceLine
                  y={100}
                  stroke="var(--color-brand-lilac)"
                  strokeOpacity={0.6}
                  strokeDasharray="4 4"
                />
                {currentWeekLabel != null && (
                  <ReferenceLine
                    x={currentWeekLabel}
                    stroke="var(--color-text-primary)"
                    strokeOpacity={0.7}
                    strokeWidth={2}
                  />
                )}
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value) => (
                    <span className="text-text-primary opacity-90">
                      {value}
                    </span>
                  )}
                />
                {/* Stack: Customer projects, Leads, Internal, Absence, Overhead (on top). 100% = dashed line only. */}
                <Area
                  type="monotone"
                  dataKey="customer100Pct"
                  name="Customer projects"
                  stackId="occupancy"
                  fill="rgb(34, 197, 94)"
                  fillOpacity={0.75}
                  stroke="none"
                />
                <Area
                  type="monotone"
                  dataKey="leadsPct"
                  name="Leads"
                  stackId="occupancy"
                  fill="rgb(74, 222, 128)"
                  fillOpacity={0.8}
                  stroke="none"
                />
                <Area
                  type="monotone"
                  dataKey="internalPct"
                  name="Internal projects"
                  stackId="occupancy"
                  fill="var(--color-brand-lilac)"
                  fillOpacity={0.7}
                  stroke="none"
                />
                <Area
                  type="monotone"
                  dataKey="absencePct"
                  name="Absence"
                  stackId="occupancy"
                  fill="rgb(148, 163, 184)"
                  fillOpacity={0.8}
                  stroke="none"
                />
                <Area
                  type="monotone"
                  dataKey="overheadPct"
                  name="Overhead"
                  stackId="occupancy"
                  fill="rgb(148, 163, 184)"
                  fillOpacity={0.5}
                  stroke="none"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Panel>
  );
}
