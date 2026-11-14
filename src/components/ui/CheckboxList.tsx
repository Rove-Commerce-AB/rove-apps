"use client";

import type { ReactNode } from "react";
import { modalFieldLabelClass } from "./ModalReadonlyField";

export type CheckboxListOption = {
  value: string;
  label: ReactNode;
  /** Optional second line (e.g. email) — shown muted under the name when selected. */
  description?: ReactNode;
  /** Avatar / favicon before the label. */
  leading?: ReactNode;
  disabled?: boolean;
  title?: string;
};

export type CheckboxListGroup = {
  id: string;
  label: string;
  options: CheckboxListOption[];
  /** Shows a text “Select all” / “Clear” link next to the section label. */
  selectAll?: boolean;
};

type Props = {
  /** Field label above the list. Omit when the parent already shows one. */
  label?: ReactNode;
  /** Flat options (ignored when `groups` is set). */
  options?: CheckboxListOption[];
  /** Grouped options in one shared scroll area. */
  groups?: CheckboxListGroup[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Text “Select all” for flat `options` lists. */
  selectAll?: boolean;
  selectAllLabel?: string;
  empty?: ReactNode;
  /** Max height of the scroll area. Default max-h-52. */
  maxHeightClassName?: string;
  /** Fixed height instead of max (e.g. h-40). */
  heightClassName?: string;
  className?: string;
  idPrefix?: string;
};

function toggleId(ids: string[], id: string, on: boolean): string[] {
  if (on) return ids.includes(id) ? ids : [...ids, id];
  return ids.filter((row) => row !== id);
}

/**
 * Multi-select as lit/dim names (chips). Click a name to turn it on or off.
 * No checkbox column. Section labels are not toggles — “Select all” is a text link.
 */
export function CheckboxList({
  label,
  options = [],
  groups,
  value,
  onChange,
  disabled = false,
  selectAll = false,
  selectAllLabel = "Select all",
  empty,
  maxHeightClassName = "max-h-52",
  heightClassName,
  className = "",
  idPrefix = "checkbox-list",
}: Props) {
  const flatGroups: CheckboxListGroup[] =
    groups && groups.length > 0
      ? groups
      : [
          {
            id: "default",
            label: selectAllLabel,
            options,
            selectAll,
          },
        ];

  const allOptions = flatGroups.flatMap((group) => group.options);
  const isEmpty = allOptions.length === 0;
  const scrollClass = heightClassName ?? maxHeightClassName;
  const showGroups = Boolean(groups && groups.length > 0);

  function setPool(next: boolean, pool: CheckboxListOption[]) {
    if (disabled) return;
    const enabled = pool.filter((option) => !option.disabled);
    if (next) {
      onChange([
        ...new Set([...value, ...enabled.map((option) => option.value)]),
      ]);
      return;
    }
    const enabledSet = new Set(enabled.map((option) => option.value));
    onChange(value.filter((id) => !enabledSet.has(id)));
  }

  function poolAllSelected(pool: CheckboxListOption[]): boolean {
    const enabled = pool.filter((option) => !option.disabled);
    return (
      enabled.length > 0 &&
      enabled.every((option) => value.includes(option.value))
    );
  }

  return (
    <div className={className.trim() || undefined}>
      {label != null ? (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <div className={modalFieldLabelClass}>{label}</div>
          {!showGroups && selectAll && options.some((o) => !o.disabled) ? (
            <SelectAllLink
              allSelected={poolAllSelected(options)}
              disabled={disabled}
              onToggle={() => setPool(!poolAllSelected(options), options)}
            />
          ) : null}
        </div>
      ) : !showGroups && selectAll && options.some((o) => !o.disabled) ? (
        <div className="mb-1.5 flex justify-end">
          <SelectAllLink
            allSelected={poolAllSelected(options)}
            disabled={disabled}
            onToggle={() => setPool(!poolAllSelected(options), options)}
          />
        </div>
      ) : null}

      <div
        className={`${scrollClass} overflow-y-auto rounded-lg border border-form bg-bg-default p-2 ${
          disabled ? "opacity-60" : ""
        }`}
      >
        {isEmpty ? (
          empty ?? (
            <p className="px-1 py-1 text-sm text-text-secondary">No options</p>
          )
        ) : (
          <div className="space-y-3">
            {flatGroups.map((group) => {
              const allSelected = poolAllSelected(group.options);
              const canSelectAll =
                Boolean(group.selectAll) &&
                group.options.some((option) => !option.disabled);

              return (
                <div key={group.id}>
                  {showGroups ? (
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
                      <p className="text-[12px] font-medium text-text-secondary">
                        {group.label}
                      </p>
                      {canSelectAll ? (
                        <SelectAllLink
                          allSelected={allSelected}
                          disabled={disabled}
                          onToggle={() =>
                            setPool(!allSelected, group.options)
                          }
                        />
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-0.5">
                    {group.options.map((option) => {
                      const checked = value.includes(option.value);
                      const rowDisabled =
                        disabled || Boolean(option.disabled);
                      return (
                        <NameToggle
                          key={option.value}
                          id={`${idPrefix}-${option.value}`}
                          checked={checked}
                          disabled={rowDisabled}
                          title={option.title}
                          leading={option.leading}
                          description={
                            checked ? option.description : undefined
                          }
                          onToggle={() =>
                            onChange(
                              toggleId(value, option.value, !checked)
                            )
                          }
                        >
                          {option.label}
                        </NameToggle>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SelectAllLink({
  allSelected,
  disabled,
  onToggle,
}: {
  allSelected: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className="shrink-0 text-[12px] font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline disabled:cursor-default disabled:opacity-50"
    >
      {allSelected ? "Clear" : "Select all"}
    </button>
  );
}

function NameToggle({
  id,
  checked,
  disabled,
  title,
  leading,
  description,
  onToggle,
  children,
}: {
  id?: string;
  checked: boolean;
  disabled?: boolean;
  title?: string;
  leading?: ReactNode;
  description?: ReactNode;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      id={id}
      title={title}
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
        disabled
          ? "cursor-default opacity-50"
          : "cursor-pointer"
      } ${
        checked
          ? "bg-bg-muted font-medium text-text-primary"
          : "text-text-secondary hover:bg-text-primary/[0.04] hover:text-text-primary"
      }`}
    >
      {leading != null ? (
        <span
          className={`shrink-0 transition-[filter,opacity] ${
            checked ? "" : "grayscale opacity-55"
          }`}
        >
          {leading}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block truncate">{children}</span>
        {description != null ? (
          <span className="block truncate text-[11px] font-normal text-text-tertiary">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}
