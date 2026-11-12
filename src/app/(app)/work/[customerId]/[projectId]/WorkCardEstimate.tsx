"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { Clock, Shirt, Trash2 } from "lucide-react";
import type { BillingCurrency } from "@/lib/currency";
import {
  WORK_TSHIRT_SIZES,
  formatWorkEstimate,
  formatWorkTshirtSize,
  parseWorkEstimateValue,
  workEstimateSuffix,
  type WorkEstimateUnit,
  type WorkTshirtSize,
} from "@/lib/workEstimate";

const TSHIRT_CLOSE_MS = 160;

export function WorkCardEstimate({
  estimateHours,
  estimateSize = null,
  estimateUnit = "hours",
  billingCurrency = "SEK",
  disabled = false,
  onChange,
  onChangeSize,
  onError,
}: {
  estimateHours: number | null;
  estimateSize?: WorkTshirtSize | null;
  estimateUnit?: WorkEstimateUnit;
  billingCurrency?: BillingCurrency;
  disabled?: boolean;
  onChange: (value: number | null) => void;
  onChangeSize?: (value: WorkTshirtSize | null) => void;
  onError?: (message: string) => void;
}) {
  const isTshirt = estimateUnit === "tshirt";
  const [draft, setDraft] = useState(
    estimateHours == null ? "" : String(estimateHours)
  );
  const [editing, setEditing] = useState(false);
  const [tshirtOpen, setTshirtOpen] = useState(false);
  const [tshirtShown, setTshirtShown] = useState(false);
  /** Size shown in the trigger while the picker is open (updates immediately on pick). */
  const [pickerDisplaySize, setPickerDisplaySize] =
    useState<WorkTshirtSize | null>(null);
  /** Whether Clear was available when the picker opened — frozen to avoid flash. */
  const [showClearInPicker, setShowClearInPicker] = useState(false);
  const tshirtRootRef = useRef<HTMLDivElement>(null);
  const tshirtCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const suffix = workEstimateSuffix(estimateUnit, billingCurrency);
  const visibleSize = tshirtOpen ? pickerDisplaySize : estimateSize;
  const formatted = isTshirt
    ? visibleSize == null
      ? null
      : formatWorkTshirtSize(visibleSize)
    : estimateHours == null
      ? null
      : formatWorkEstimate(estimateHours, estimateUnit, billingCurrency);

  useEffect(() => {
    if (editing) return;
    setDraft(estimateHours == null ? "" : String(estimateHours));
  }, [estimateHours, editing]);

  useEffect(() => {
    return () => {
      if (tshirtCloseTimerRef.current) {
        clearTimeout(tshirtCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!tshirtOpen) return;

    function handlePointerDown(event: globalThis.MouseEvent) {
      const root = tshirtRootRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      closeTshirtPicker();
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeTshirtPicker();
      }
    }

    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [tshirtOpen]);

  function stopCard(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();
  }

  function openTshirtPicker() {
    if (disabled || tshirtOpen) return;
    if (tshirtCloseTimerRef.current) {
      clearTimeout(tshirtCloseTimerRef.current);
      tshirtCloseTimerRef.current = null;
    }
    setPickerDisplaySize(estimateSize);
    setShowClearInPicker(estimateSize != null);
    setTshirtOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setTshirtShown(true));
    });
  }

  function closeTshirtPicker() {
    if (!tshirtOpen && !tshirtShown) return;
    setTshirtShown(false);
    if (tshirtCloseTimerRef.current) {
      clearTimeout(tshirtCloseTimerRef.current);
    }
    tshirtCloseTimerRef.current = setTimeout(() => {
      setTshirtOpen(false);
      setPickerDisplaySize(null);
      setShowClearInPicker(false);
      tshirtCloseTimerRef.current = null;
    }, TSHIRT_CLOSE_MS);
  }

  function pickTshirtSize(value: WorkTshirtSize | null) {
    setPickerDisplaySize(value);
    onChangeSize?.(value);
    closeTshirtPicker();
  }

  function commit() {
    const parsed = parseWorkEstimateValue(draft, estimateUnit);
    if (!parsed.ok) {
      setDraft(estimateHours == null ? "" : String(estimateHours));
      setEditing(false);
      onError?.(parsed.message);
      return;
    }
    setDraft(parsed.value == null ? "" : String(parsed.value));
    setEditing(false);
    if (parsed.value === estimateHours) return;
    onChange(parsed.value);
  }

  if (isTshirt) {
    const triggerEmpty = visibleSize == null;
    const selectedInPicker = tshirtOpen ? pickerDisplaySize : estimateSize;
    return (
      <div
        ref={tshirtRootRef}
        className={`inline-flex max-w-full items-center rounded-md px-1.5 py-0.5 transition-colors duration-150 ease-out ${
          tshirtOpen || !triggerEmpty
            ? "bg-bg-muted text-text-secondary"
            : "text-text-tertiary hover:bg-bg-muted hover:text-text-secondary"
        }`}
        onClick={stopCard}
        onPointerDown={stopCard}
        onKeyDown={stopCard}
      >
        <button
          type="button"
          disabled={disabled}
          title={
            formatted == null
              ? "Set size"
              : `Size ${formatted} · click to edit`
          }
          aria-label={formatted == null ? "Set size" : `Size ${formatted}`}
          aria-expanded={tshirtOpen}
          onClick={() => {
            if (tshirtOpen) closeTshirtPicker();
            else openTshirtPicker();
          }}
          className={`inline-flex h-3 shrink-0 items-center justify-center text-caption disabled:opacity-50 ${
            triggerEmpty ? "w-3" : "min-w-0"
          }`}
        >
          {triggerEmpty ? (
            <Shirt
              className={`h-3 w-3 transition-opacity duration-150 ease-out ${
                tshirtShown ? "opacity-40" : "opacity-100"
              }`}
              aria-hidden
            />
          ) : (
            <span
              className={`whitespace-nowrap font-medium tabular-nums transition-opacity duration-150 ease-out ${
                tshirtShown ? "opacity-40" : "opacity-100"
              }`}
            >
              {formatted}
            </span>
          )}
        </button>

        <div
          className={`inline-flex items-center overflow-hidden transition-[max-width] duration-150 ease-out ${
            tshirtShown ? "max-w-[14rem]" : "max-w-0"
          }`}
          aria-hidden={!tshirtOpen}
        >
          <div
            className={`ml-1 inline-flex items-center gap-0.5 transition-opacity duration-150 ease-out ${
              tshirtShown ? "opacity-100" : "opacity-0"
            }`}
          >
            {WORK_TSHIRT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                tabIndex={tshirtOpen ? 0 : -1}
                disabled={disabled || !tshirtOpen}
                className={`rounded px-1 text-caption font-medium transition-colors disabled:opacity-50 ${
                  selectedInPicker === size
                    ? "bg-brand-signal/15 text-text-primary"
                    : "text-text-tertiary hover:bg-bg-default hover:text-text-primary"
                }`}
                onClick={() => pickTshirtSize(size)}
              >
                {formatWorkTshirtSize(size)}
              </button>
            ))}
            {showClearInPicker ? (
              <button
                type="button"
                tabIndex={tshirtOpen ? 0 : -1}
                disabled={disabled || !tshirtOpen}
                title="Clear size"
                aria-label="Clear size"
                className="inline-flex items-center justify-center rounded px-0.5 text-caption text-text-tertiary transition-colors hover:bg-bg-default hover:text-text-primary disabled:opacity-50"
                onClick={() => pickTshirtSize(null)}
              >
                <Trash2 className="h-2.5 w-2.5" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <label
        className="inline-flex items-center gap-0.5 rounded-md bg-bg-muted px-1.5 py-0.5"
        onClick={stopCard}
        onPointerDown={stopCard}
        onKeyDown={stopCard}
      >
        <Clock className="h-3 w-3 shrink-0 text-text-tertiary" aria-hidden />
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          disabled={disabled}
          aria-label={`Estimate in ${suffix}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            stopCard(event);
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(estimateHours == null ? "" : String(estimateHours));
              setEditing(false);
            }
          }}
          className="w-10 border-0 bg-transparent p-0 text-right text-caption tabular-nums text-text-primary focus:outline-none disabled:opacity-50"
        />
        <span className="text-caption text-text-tertiary">{suffix}</span>
      </label>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      title={
        formatted == null
          ? "Set estimate"
          : `Estimate ${formatted} · click to edit`
      }
      aria-label={
        formatted == null ? "Set estimate" : `Estimate ${formatted}`
      }
      onClick={(event) => {
        stopCard(event);
        if (disabled) return;
        setEditing(true);
      }}
      onPointerDown={stopCard}
      onKeyDown={stopCard}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-caption tabular-nums transition-colors disabled:opacity-50 ${
        estimateHours == null
          ? "text-text-tertiary hover:bg-bg-muted hover:text-text-secondary"
          : "bg-bg-muted text-text-secondary hover:bg-border-subtle hover:text-text-primary"
      }`}
    >
      {formatted == null ? (
        <Clock className="h-3 w-3 shrink-0" aria-hidden />
      ) : (
        formatted
      )}
    </button>
  );
}
