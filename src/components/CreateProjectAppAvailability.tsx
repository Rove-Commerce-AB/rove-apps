"use client";

import { Switch } from "@/components/ui";
import { APP_ACCESS_ITEMS } from "@/components/AppAccessList";
import type { AppKey } from "@/lib/peopleTypes";

const CREATE_PROJECT_APPS: AppKey[] = ["planner", "time_report", "work"];

/**
 * Where a new masterdata project appears. Planner + Time report are always on;
 * Work is optional and creates a linked Work board when enabled.
 */
export function CreateProjectAppAvailability({
  createWork,
  onCreateWorkChange,
  idPrefix = "create-project-app",
}: {
  createWork: boolean;
  onCreateWorkChange: (value: boolean) => void;
  idPrefix?: string;
}) {
  return (
    <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle px-3">
      {CREATE_PROJECT_APPS.map((key) => {
        const item = APP_ACCESS_ITEMS[key];
        const Icon = item.icon;
        const locked = key !== "work";
        const enabled = locked ? true : createWork;

        return (
          <div key={key} className="flex items-center gap-3 py-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.tileClass}`}
              aria-hidden
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-text-primary">
                {item.name}
              </span>
            </div>
            <Switch
              id={`${idPrefix}-${key}`}
              aria-label={
                locked
                  ? `${item.name} (always available)`
                  : `Also create project in ${item.name}`
              }
              className="shrink-0"
              tone="success"
              checked={enabled}
              disabled={locked}
              onCheckedChange={(checked) => {
                if (!locked) onCreateWorkChange(checked);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
