"use client";

import { Switch } from "@/components/ui";
import { APP_ACCESS_ITEMS } from "@/components/appIcons";
import { APP_KEYS, type AppKey } from "@/lib/peopleTypes";

export { APP_ACCESS_ITEMS } from "@/components/appIcons";

export function AppAccessList({
  value,
  onChange,
  allowedKeys = APP_KEYS,
  availableKeys = allowedKeys,
  description,
  disabled = false,
  idPrefix = "app-access",
}: {
  value: AppKey[];
  onChange: (value: AppKey[]) => void;
  allowedKeys?: readonly AppKey[];
  availableKeys?: readonly AppKey[];
  description?: string;
  disabled?: boolean;
  idPrefix?: string;
}) {
  return (
    <div className="divide-y divide-border-subtle">
      {allowedKeys.map((key) => {
        const item = APP_ACCESS_ITEMS[key];
        const Icon = item.icon;
        const enabled = value.includes(key);
        const canToggle = availableKeys.includes(key) && !disabled;

        return (
          <div key={key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.tileClass}`}
              aria-hidden
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-label-l text-text-primary">{item.name}</span>
              {description ? <p className="mt-0.5 text-body-s text-text-secondary">{description}</p> : null}
            </div>
            <Switch
              id={`${idPrefix}-${key}`}
              aria-label={`${item.name} ${description ?? "app access"}`}
              className="shrink-0"
              tone="success"
              checked={enabled}
              disabled={!canToggle}
              onCheckedChange={(checked) => {
                onChange(checked ? [...value, key] : value.filter((current) => current !== key));
              }}
              label={enabled ? "Enabled" : "Disabled"}
              labelClassName={enabled ? "text-status-success" : "text-text-tertiary"}
            />
          </div>
        );
      })}
    </div>
  );
}
