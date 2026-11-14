"use client";

import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { CapacityBar } from "@/components/ui";
import { ROUTES } from "@/lib/routes";
import {
  plannerWeekKey,
  type HomePlannerSurface,
} from "@/lib/homeDashboardTypes";
import { HomeAppSurface } from "./HomeAppSurface";

function formatHours(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function occupancyPct(booked: number, available: number): number {
  if (available <= 0) return booked > 0 ? 100 : 0;
  return Math.round((booked / available) * 100);
}

type Props = {
  planner: HomePlannerSurface;
};

export function HomePlannerPanel({ planner }: Props) {
  const [selected, setSelected] = useState(() => ({
    year: planner.currentYear,
    week: planner.currentWeek,
  }));

  const selectedWeek =
    planner.weeks.find(
      (w) => w.year === selected.year && w.week === selected.week
    ) ??
    planner.weeks[0] ??
    null;

  const projects = selectedWeek
    ? (planner.projectsByWeek[
        plannerWeekKey(selectedWeek.year, selectedWeek.week)
      ] ?? [])
    : [];

  const capacityRef =
    planner.weeks.find(
      (w) =>
        w.year === planner.currentYear && w.week === planner.currentWeek
    )?.availableHours ??
    selectedWeek?.availableHours ??
    40;

  const isToday =
    selectedWeek != null &&
    selectedWeek.year === planner.currentYear &&
    selectedWeek.week === planner.currentWeek;

  return (
    <HomeAppSurface
      title="Planner"
      href={ROUTES.plannerConsultant}
      icon={CalendarCheck}
      brand="planner"
      description={
        planner.consultantName
          ? `Booked for ${planner.consultantName}`
          : "Your upcoming allocation"
      }
    >
      {selectedWeek ? (
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-text-tertiary">
                {isToday ? "This week" : `Week ${selectedWeek.week}`}
                {!isToday ? (
                  <span className="text-text-tertiary"> · {selectedWeek.year}</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-text-primary">
                {formatHours(selectedWeek.bookedHours)}
                <span className="ml-1 text-sm font-normal text-text-secondary">
                  h booked
                </span>
              </p>
            </div>
            <CapacityBar
              value={occupancyPct(
                selectedWeek.bookedHours,
                selectedWeek.availableHours || capacityRef
              )}
            />
          </div>

          {planner.weeks.length > 0 ? (
            <div>
              <p className="mb-2 text-xs text-text-tertiary">
                Click a week to preview
              </p>
              <div className="flex gap-1.5" role="listbox" aria-label="Weeks">
                {planner.weeks.map((w) => {
                  const pct = occupancyPct(w.bookedHours, capacityRef);
                  const isSelected =
                    w.year === selectedWeek.year && w.week === selectedWeek.week;
                  return (
                    <button
                      key={`${w.year}-${w.week}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      title={`W${w.week}: ${formatHours(w.bookedHours)}h`}
                      onClick={() => setSelected({ year: w.year, week: w.week })}
                      className={`flex h-[5.25rem] min-w-0 flex-1 flex-col items-center justify-between rounded-lg border px-1 pb-1.5 pt-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-signal ${
                        isSelected
                          ? "border-brand-signal bg-brand-signal/10 shadow-sm"
                          : "border-transparent bg-bg-muted hover:border-border-subtle"
                      }`}
                    >
                      <div className="flex min-h-0 w-full flex-1 items-end justify-center px-0.5">
                        <div
                          className={`w-2.5 rounded-sm ${
                            isSelected ? "bg-brand-signal" : "bg-brand-signal/50"
                          }`}
                          style={{
                            height: `${Math.max(8, Math.min(100, pct))}%`,
                          }}
                        />
                      </div>
                      <span
                        className={`mt-1.5 text-[11px] tabular-nums leading-none ${
                          isSelected
                            ? "font-semibold text-brand-signal"
                            : "font-medium text-text-secondary"
                        }`}
                      >
                        {w.week}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {projects.length > 0 ? (
            <ul className="divide-y divide-border-subtle border-t border-border-subtle">
              {projects.map((p) => (
                <li
                  key={p.projectId}
                  className="flex items-baseline justify-between gap-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-text-primary">
                    <span className="text-text-secondary">{p.customerName}</span>
                    <span className="text-text-tertiary"> · </span>
                    {p.projectName}
                  </span>
                  <span className="shrink-0 tabular-nums text-text-secondary">
                    {formatHours(p.hours)}h
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-secondary">
              Nothing booked this week.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-text-secondary">
          Link a consultant profile under Settings → People to see your bookings
          here.
        </p>
      )}
    </HomeAppSurface>
  );
}
