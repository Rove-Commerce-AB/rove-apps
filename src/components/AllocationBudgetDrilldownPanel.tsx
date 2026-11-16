"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { isoWeeksInYear } from "@/lib/dateUtils";
import type { AllocationBudgetDrilldownResult } from "@/types/allocationBudgetReport";
import { getAllocationBudgetDrilldownAction } from "@/app/(app)/reports/actions";
import { Button, Panel, PanelSectionTitle } from "@/components/ui";
import { projectHref } from "@/lib/routes";

function formatHours(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

type Props = {
  initialData: AllocationBudgetDrilldownResult;
  initialFrom: { year: number; week: number };
  initialTo: { year: number; week: number };
};

function clampWeek(year: number, week: number): number {
  const max = isoWeeksInYear(year);
  return Math.min(Math.max(1, week), max);
}

function BudgetUse({
  allocated,
  budgetHours,
}: {
  allocated: number;
  budgetHours: number | null;
}) {
  if (budgetHours == null || budgetHours <= 0) {
    return <span className="text-text-primary/50">—</span>;
  }
  const pct = (allocated / budgetHours) * 100;
  const barWidth = Math.min(100, pct);
  return (
    <div className="flex min-w-[108px] max-w-[160px] flex-col gap-0.5">
      <div className="h-1.5 w-full overflow-hidden rounded bg-bg-muted">
        <div
          className="h-full rounded-sm bg-brand-signal"
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-text-primary/70">
        {Math.round(pct)}% of budget
      </span>
    </div>
  );
}

export function AllocationBudgetDrilldownPanel({
  initialData,
  initialFrom,
  initialTo,
}: Props) {
  const [data, setData] = useState(initialData);
  const [fromYear, setFromYear] = useState(initialFrom.year);
  const [fromWeek, setFromWeek] = useState(initialFrom.week);
  const [toYear, setToYear] = useState(initialTo.year);
  const [toWeek, setToWeek] = useState(initialTo.week);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setFromWeek((w) => clampWeek(fromYear, w));
  }, [fromYear]);

  useEffect(() => {
    setToWeek((w) => clampWeek(toYear, w));
  }, [toYear]);

  const yearOptions = useMemo(() => {
    const lo = Math.min(fromYear, toYear, initialFrom.year) - 1;
    const hi = Math.max(fromYear, toYear, initialTo.year) + 1;
    const out: number[] = [];
    for (let y = lo; y <= hi; y++) out.push(y);
    return out;
  }, [fromYear, toYear, initialFrom.year, initialTo.year]);

  const fromWeekOpts = useMemo(
    () => Array.from({ length: isoWeeksInYear(fromYear) }, (_, i) => i + 1),
    [fromYear]
  );
  const toWeekOpts = useMemo(
    () => Array.from({ length: isoWeeksInYear(toYear) }, (_, i) => i + 1),
    [toYear]
  );

  const toggleCustomer = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const applyRange = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fw = clampWeek(fromYear, fromWeek);
      const tw = clampWeek(toYear, toWeek);
      const result = await getAllocationBudgetDrilldownAction(
        { year: fromYear, week: fw },
        { year: toYear, week: tw }
      );
      setData(result);
      setFromWeek(fw);
      setToWeek(tw);
    } catch {
      setError("Could not load data. Try again.");
    } finally {
      setLoading(false);
    }
  }, [fromYear, fromWeek, toYear, toWeek]);

  const rangeLabel = `${data.range.fromYear} W${data.range.fromWeek} – ${data.range.toYear} W${data.range.toWeek}`;

  const selectClass =
    "rounded-md border border-form bg-bg-default px-2 py-1 text-xs text-text-primary";

  return (
    <Panel>
      <PanelSectionTitle>Planning vs budget</PanelSectionTitle>
      <div className="space-y-3 p-3 pt-0">
        <p className="text-xs text-text-primary/75">
          Sum of planned hours per project for the weeks you pick, compared to each
          project&apos;s total budget hours. Expand a client to see projects.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
              From
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <select
                className={selectClass}
                value={fromYear}
                onChange={(e) => setFromYear(parseInt(e.target.value, 10))}
                aria-label="From year"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <select
                className={selectClass}
                value={fromWeek}
                onChange={(e) => setFromWeek(parseInt(e.target.value, 10))}
                aria-label="From ISO week"
              >
                {fromWeekOpts.map((w) => (
                  <option key={w} value={w}>
                    W{w}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
              To
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <select
                className={selectClass}
                value={toYear}
                onChange={(e) => setToYear(parseInt(e.target.value, 10))}
                aria-label="To year"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <select
                className={selectClass}
                value={toWeek}
                onChange={(e) => setToWeek(parseInt(e.target.value, 10))}
                aria-label="To ISO week"
              >
                {toWeekOpts.map((w) => (
                  <option key={w} value={w}>
                    W{w}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={loading}
            onClick={() => void applyRange()}
          >
            {loading ? "Loading…" : "Apply"}
          </Button>
        </div>

        <p className="text-[11px] tabular-nums text-text-primary/70">
          {rangeLabel} · {data.weekCount} week{data.weekCount === 1 ? "" : "s"}
        </p>

        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}

        {data.customers.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-primary/70">
            No planned hours in this period.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-form">
            <table className="w-full min-w-[520px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-form bg-bg-muted/60">
                  <th className="px-2 py-2 font-medium text-text-primary">Client / project</th>
                  <th className="px-2 py-2 font-medium text-text-primary tabular-nums">
                    Hours in range
                  </th>
                  <th className="px-2 py-2 font-medium text-text-primary tabular-nums">
                    Budget (h)
                  </th>
                  <th className="px-2 py-2 font-medium text-text-primary">Use of budget</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((row) => {
                  const isOpen = expanded.has(row.customerId);
                  return (
                    <Fragment key={row.customerId}>
                      <tr
                        className="border-b border-form/80 bg-bg-default hover:bg-bg-muted/40"
                      >
                        <td className="px-1 py-1.5">
                          <button
                            type="button"
                            onClick={() => toggleCustomer(row.customerId)}
                            className="flex w-full min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left font-medium text-text-primary hover:bg-bg-muted/80"
                            aria-expanded={isOpen}
                          >
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
                            )}
                            <span className="truncate">{row.customerName}</span>
                          </button>
                        </td>
                        <td className="px-2 py-1.5 tabular-nums text-text-primary">
                          {formatHours(row.allocatedHours)}
                        </td>
                        <td className="px-2 py-1.5 text-text-primary/50">—</td>
                        <td className="px-2 py-1.5 text-text-primary/50">—</td>
                      </tr>
                      {isOpen &&
                        row.projects.map((p) => (
                          <tr
                            key={p.projectId}
                            className="border-b border-form/50 bg-bg-default/80"
                          >
                            <td className="px-2 py-1 pl-8">
                              <div className="flex min-w-0 items-center gap-1">
                                <span className="truncate text-text-primary/90">
                                  {p.projectName}
                                </span>
                                <Link
                                  href={projectHref(p.projectId)}
                                  prefetch={false}
                                  className="shrink-0 rounded p-0.5 text-text-primary opacity-50 hover:bg-bg-muted hover:opacity-100"
                                  aria-label={`Open ${p.projectName}`}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                              </div>
                            </td>
                            <td className="px-2 py-1 tabular-nums text-text-primary">
                              {formatHours(p.allocatedHours)}
                            </td>
                            <td className="px-2 py-1 tabular-nums text-text-primary">
                              {p.budgetHours != null && p.budgetHours > 0
                                ? formatHours(p.budgetHours)
                                : "—"}
                            </td>
                            <td className="px-2 py-1">
                              <BudgetUse
                                allocated={p.allocatedHours}
                                budgetHours={p.budgetHours}
                              />
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  );
}
