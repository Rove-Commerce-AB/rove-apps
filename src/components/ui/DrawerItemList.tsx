"use client";

import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";
import { FieldInfoTip } from "./DetailField";
import { quietComposeInputClass } from "./inlineEditStyles";

export type DrawerItemListItem = {
  id: string;
  label: string;
  /** Soften / strike-through label (e.g. done checklist items). */
  muted?: boolean;
};

type Props = {
  title?: string;
  /** Helper copy shown via (i) tip next to the title. */
  info?: string;
  /** @deprecated Prefer `info` (i) tip. */
  description?: string;
  /** Optional empty-state copy; omit to show no empty message. */
  emptyLabel?: string;
  items: DrawerItemListItem[];
  pending?: boolean;
  /** Leading control per row (checkbox, icon, etc.). */
  renderLeading?: (item: DrawerItemListItem) => ReactNode;
  /** Extra trailing content before the remove button. */
  renderTrailing?: (item: DrawerItemListItem) => ReactNode;
  onRename?: (item: DrawerItemListItem, nextLabel: string) => void;
  onRemove?: (item: DrawerItemListItem) => void;
  /** Quiet compose row at the bottom. */
  compose?: {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (value: string) => void;
    placeholder: string;
    submitLabel?: string;
    /** When true, show a text button until clicked (Components-style). */
    collapsedLabel?: string;
  };
};

/**
 * Quiet drawer collection CRUD: flat divide-y rows, click-to-edit labels,
 * hover remove, quiet compose. Shared by checklists, components, references, etc.
 */
export function DrawerItemList({
  title,
  info,
  description,
  emptyLabel,
  items,
  pending = false,
  renderLeading,
  renderTrailing,
  onRename,
  onRemove,
  compose,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [composeOpen, setComposeOpen] = useState(
    () => compose != null && compose.collapsedLabel == null
  );

  const tip = info ?? description;

  function startEdit(item: DrawerItemListItem) {
    if (!onRename || pending) return;
    setEditingId(item.id);
    setEditingValue(item.label);
  }

  function commitEdit(item: DrawerItemListItem) {
    const trimmed = editingValue.trim();
    setEditingId(null);
    setEditingValue("");
    if (!onRename) return;
    if (!trimmed || trimmed === item.label) return;
    onRename(item, trimmed);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingValue("");
  }

  const showCompose =
    compose != null && (compose.collapsedLabel == null || composeOpen);

  return (
    <div className="space-y-2">
      {title ? (
        <h3 className="inline-flex items-center gap-1 text-sm font-medium text-text-primary">
          {title}
          {tip ? <FieldInfoTip text={tip} /> : null}
        </h3>
      ) : null}

      {items.length === 0 ? (
        emptyLabel ? (
          <p className="text-sm text-text-tertiary">{emptyLabel}</p>
        ) : null
      ) : (
        <ul className="divide-y divide-border-subtle">
          {items.map((item) => {
            const editing = editingId === item.id;
            return (
              <li
                key={item.id}
                className="group flex items-start gap-2 py-1.5"
              >
                {renderLeading ? (
                  <span className="mt-0.5 shrink-0">{renderLeading(item)}</span>
                ) : null}
                {editing ? (
                  <input
                    value={editingValue}
                    disabled={pending}
                    autoFocus
                    aria-label={`Edit ${item.label}`}
                    className="min-w-0 flex-1 border-0 bg-transparent py-0.5 text-sm text-text-primary focus:outline-none focus:ring-0"
                    onChange={(event) => setEditingValue(event.target.value)}
                    onBlur={() => commitEdit(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelEdit();
                      }
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                    }}
                  />
                ) : onRename ? (
                  <button
                    type="button"
                    disabled={pending}
                    className={`min-w-0 flex-1 rounded-md px-1.5 py-0.5 text-left text-sm hover:bg-text-primary/[0.06] ${
                      item.muted
                        ? "text-text-tertiary line-through"
                        : "text-text-primary"
                    }`}
                    onClick={() => startEdit(item)}
                  >
                    {item.label}
                  </button>
                ) : (
                  <span
                    className={`min-w-0 flex-1 px-1.5 py-0.5 text-sm ${
                      item.muted
                        ? "text-text-tertiary line-through"
                        : "text-text-primary"
                    }`}
                  >
                    {item.label}
                  </span>
                )}
                {renderTrailing ? (
                  <span className="relative z-10 shrink-0">
                    {renderTrailing(item)}
                  </span>
                ) : null}
                {onRemove ? (
                  <button
                    type="button"
                    disabled={pending}
                    className="shrink-0 rounded-md p-0.5 text-text-tertiary opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Remove ${item.label}`}
                    onClick={() => onRemove(item)}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {compose && showCompose ? (
        <form
          className="flex items-center gap-2 pt-1"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = compose.value.trim();
            if (!trimmed || pending) return;
            compose.onSubmit(trimmed);
            if (compose.collapsedLabel) {
              setComposeOpen(false);
            }
          }}
        >
          <input
            value={compose.value}
            disabled={pending}
            placeholder={compose.placeholder}
            aria-label={compose.placeholder}
            autoFocus={compose.collapsedLabel != null}
            className={quietComposeInputClass}
            onChange={(event) => compose.onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && compose.collapsedLabel) {
                event.preventDefault();
                compose.onChange("");
                setComposeOpen(false);
              }
            }}
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={pending || !compose.value.trim()}
          >
            {compose.submitLabel ?? "Add"}
          </Button>
          {compose.collapsedLabel ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                compose.onChange("");
                setComposeOpen(false);
              }}
            >
              Cancel
            </Button>
          ) : null}
        </form>
      ) : null}

      {compose?.collapsedLabel && !composeOpen ? (
        <button
          type="button"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm text-text-tertiary hover:bg-text-primary/[0.06] hover:text-text-secondary disabled:opacity-50"
          onClick={() => setComposeOpen(true)}
        >
          {compose.collapsedLabel}
        </button>
      ) : null}
    </div>
  );
}
