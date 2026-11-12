"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { editInputClass, inlineEditTriggerClass } from "@/components/ui";
import { moneyLabel } from "@/lib/currency";
import { isInlineEditValueChanged } from "@/lib/inlineEdit";
import {
  deleteCustomerSizePrice,
  deleteProjectSizePrice,
  getCustomerSizePrices,
  getProjectSizePrices,
  upsertCustomerSizePrice,
  upsertProjectSizePrice,
  type SizePriceRow,
} from "@/lib/sizePricesClient";
import {
  WORK_TSHIRT_SIZES,
  WORK_TSHIRT_SIZE_LABELS,
  type WorkTshirtSize,
} from "@/lib/workEstimate";

type Props = {
  scope: "customer" | "project";
  ownerId: string;
  billingCurrency?: string;
  onError: (msg: string) => void;
  /** When this value changes, prices are refetched. */
  refreshTrigger?: number;
};

function amountDraft(value: number | null | undefined): string {
  if (value == null) return "";
  return String(value);
}

export function SizePricesSection({
  scope,
  ownerId,
  billingCurrency = "SEK",
  onError,
  refreshTrigger = 0,
}: Props) {
  const [rows, setRows] = useState<SizePriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSize, setEditingSize] = useState<WorkTshirtSize | null>(null);
  const [editValue, setEditValue] = useState("");
  const originalValueRef = useRef("");
  const [savingSize, setSavingSize] = useState<WorkTshirtSize | null>(null);
  const currency = moneyLabel(billingCurrency);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load =
      scope === "customer"
        ? getCustomerSizePrices(ownerId)
        : getProjectSizePrices(ownerId);
    load
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, ownerId, refreshTrigger]);

  const amountBySize = new Map(rows.map((row) => [row.size, row.amount]));

  async function saveSize(size: WorkTshirtSize, raw: string) {
    const trimmed = raw.trim().replace(/\s/g, "").replace(",", ".");
    setSavingSize(size);
    try {
      if (!trimmed) {
        if (scope === "customer") {
          await deleteCustomerSizePrice(ownerId, size);
        } else {
          await deleteProjectSizePrice(ownerId, size);
        }
        setRows((prev) => prev.filter((row) => row.size !== size));
      } else {
        const amount = Number(trimmed);
        if (!Number.isFinite(amount) || amount < 0) {
          onError("Amount must be 0 or greater");
          setEditValue(originalValueRef.current);
          return;
        }
        const saved =
          scope === "customer"
            ? await upsertCustomerSizePrice(
                ownerId,
                size,
                amount,
                billingCurrency
              )
            : await upsertProjectSizePrice(
                ownerId,
                size,
                amount,
                billingCurrency
              );
        setRows((prev) => {
          const without = prev.filter((row) => row.size !== size);
          return [...without, saved].sort(
            (a, b) =>
              WORK_TSHIRT_SIZES.indexOf(a.size) -
              WORK_TSHIRT_SIZES.indexOf(b.size)
          );
        });
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save");
      setEditValue(originalValueRef.current);
    } finally {
      setSavingSize(null);
      setEditingSize(null);
    }
  }

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-medium text-text-primary">
          Fixed price by size
        </h3>
        <p className="mt-1 text-sm text-text-secondary">
          {scope === "project"
            ? "Overrides customer size prices for this project when set."
            : "Used on Work projects with T-shirt estimates and fixed price enabled."}
        </p>
      </div>
      {loading ? (
        <p className="text-sm text-text-tertiary">Loading…</p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {WORK_TSHIRT_SIZES.map((size) => {
            const amount = amountBySize.get(size) ?? null;
            const editing = editingSize === size;
            return (
              <li
                key={size}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="w-8 text-sm font-medium text-text-primary">
                  {WORK_TSHIRT_SIZE_LABELS[size]}
                </span>
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <input
                        autoFocus
                        inputMode="decimal"
                        disabled={savingSize === size}
                        aria-label={`${WORK_TSHIRT_SIZE_LABELS[size]} price`}
                        value={editValue}
                        onChange={(event) => setEditValue(event.target.value)}
                        onBlur={() => {
                          if (
                            !isInlineEditValueChanged(
                              editValue,
                              originalValueRef.current
                            )
                          ) {
                            setEditingSize(null);
                            return;
                          }
                          void saveSize(size, editValue);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            (event.target as HTMLInputElement).blur();
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setEditValue(originalValueRef.current);
                            setEditingSize(null);
                          }
                        }}
                        className={`${editInputClass} max-w-[8rem] text-right`}
                      />
                      <span className="text-sm text-text-tertiary">
                        {currency}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={`${inlineEditTriggerClass} w-full justify-end text-right`}
                      onClick={() => {
                        const next = amountDraft(amount);
                        originalValueRef.current = next;
                        setEditValue(next);
                        setEditingSize(size);
                      }}
                    >
                      {amount == null ? (
                        <span className="text-text-tertiary">Set price</span>
                      ) : (
                        <span className="tabular-nums">
                          {amount} {currency}
                        </span>
                      )}
                    </button>
                  )}
                </div>
                {amount != null && !editing ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-text-tertiary"
                    onClick={() => {
                      void saveSize(size, "");
                    }}
                  >
                    Clear
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
