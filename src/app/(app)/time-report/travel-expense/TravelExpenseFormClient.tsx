"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button, Input, PageHeader } from "@/components/ui";
import { ROUTES } from "@/lib/routes";
import { downloadTravelExpensePdf } from "@/lib/travelExpensePdf";
import {
  emptyForeignRow,
  emptyMileageRow,
  emptyTravelExpenseForm,
  sumMileageKm,
  sumTravelCosts,
  travelExpenseYear,
  type TravelExpenseFormData,
} from "@/lib/travelExpenseTypes";
import {
  createTravelExpense,
  deleteTravelExpense,
  updateTravelExpense,
} from "./actions";

type Props = {
  mode: "create" | "edit";
  expenseId?: string;
  initialForm: TravelExpenseFormData;
};

const fieldClass = "min-w-0";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border-subtle bg-bg-default shadow-primary">
      <div className="border-b border-border-subtle bg-table-header px-4 py-2">
        <h2 className="text-heading-xs font-semibold text-text-primary">
          {title}
        </h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function QtyAmountRow({
  label,
  qty,
  amount,
  onQty,
  onAmount,
  hint,
}: {
  label: string;
  qty: string;
  amount: string;
  onQty: (v: string) => void;
  onAmount: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.4fr)_7rem_8rem] sm:items-end">
      <div>
        <p className="mb-1 text-sm font-medium text-text-primary">{label}</p>
        {hint ? (
          <p className="text-xs text-text-secondary">{hint}</p>
        ) : null}
      </div>
      <Input
        label="Qty"
        value={qty}
        onChange={(e) => onQty(e.target.value)}
        inputMode="decimal"
        size="compact"
      />
      <Input
        label="Amount"
        value={amount}
        onChange={(e) => onAmount(e.target.value)}
        inputMode="decimal"
        size="compact"
      />
    </div>
  );
}

export function TravelExpenseFormClient({
  mode,
  expenseId,
  initialForm,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<TravelExpenseFormData>(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const year = useMemo(() => travelExpenseYear(form), [form]);
  const travelTotal = useMemo(() => sumTravelCosts(form), [form]);
  const kmTotal = useMemo(() => sumMileageKm(form), [form]);

  function patch(partial: Partial<TravelExpenseFormData>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  function resetForm() {
    setForm(emptyTravelExpenseForm(initialForm.name));
    setError(null);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        if (mode === "create") {
          const { id } = await createTravelExpense({ formData: form });
          router.replace(`${ROUTES.travelExpense}/${id}`);
          router.refresh();
        } else if (expenseId) {
          await updateTravelExpense(expenseId, form);
          router.refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  function handleDelete() {
    if (!expenseId) return;
    if (!window.confirm("Delete this travel expense?")) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteTravelExpense(expenseId);
        router.push(ROUTES.travelExpense);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete");
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <Link
          href={ROUTES.travelExpense}
          className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-text-primary opacity-80 transition-opacity hover:opacity-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Travel expense
        </Link>
        <PageHeader
          title={
            mode === "create"
              ? `Travel expense ${year}`
              : `Travel expense ${year}`
          }
          description="Fill in the claim, save it, then download a PDF to send to payroll."
        >
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={resetForm}
              disabled={isPending}
            >
              Reset
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => downloadTravelExpensePdf(form)}
            >
              Download PDF
            </Button>
            <Button type="button" onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </PageHeader>
      </div>

      {error ? (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Section title="Trip details">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            className={fieldClass}
            label="Name"
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
          <Input
            className={fieldClass}
            label="Employee no."
            value={form.employeeNumber}
            onChange={(e) => patch({ employeeNumber: e.target.value })}
          />
          <Input
            className={fieldClass}
            label="Department"
            value={form.department}
            onChange={(e) => patch({ department: e.target.value })}
          />
          <Input
            className={`${fieldClass} sm:col-span-1`}
            label="Destination"
            value={form.destination}
            onChange={(e) => patch({ destination: e.target.value })}
          />
          <Input
            className={`${fieldClass} sm:col-span-2`}
            label="Purpose of trip"
            value={form.purpose}
            onChange={(e) => patch({ purpose: e.target.value })}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            label="Departure date"
            type="date"
            value={form.departureDate}
            onChange={(e) => patch({ departureDate: e.target.value })}
          />
          <Input
            label="Time"
            type="time"
            value={form.departureTime}
            onChange={(e) => patch({ departureTime: e.target.value })}
          />
          <Input
            label="Hours outside regular hours"
            value={form.departureExtraHours}
            onChange={(e) => patch({ departureExtraHours: e.target.value })}
            inputMode="decimal"
          />
          <Input
            label="Return date"
            type="date"
            value={form.returnDate}
            onChange={(e) => patch({ returnDate: e.target.value })}
          />
          <Input
            label="Time"
            type="time"
            value={form.returnTime}
            onChange={(e) => patch({ returnTime: e.target.value })}
          />
          <Input
            label="Hours outside regular hours"
            value={form.returnExtraHours}
            onChange={(e) => patch({ returnExtraHours: e.target.value })}
            inputMode="decimal"
          />
        </div>
      </Section>

      <Section title="Per diem — domestic">
        <div className="flex flex-col gap-3">
          <QtyAmountRow
            label="Full day"
            hint="Departure before 12:00 or return after 19:00"
            qty={form.domesticFullDays}
            amount={form.domesticFullDayAmount}
            onQty={(v) => patch({ domesticFullDays: v })}
            onAmount={(v) => patch({ domesticFullDayAmount: v })}
          />
          <QtyAmountRow
            label="Half day"
            hint="Departure after 12:00 or return before 19:00"
            qty={form.domesticHalfDays}
            amount={form.domesticHalfDayAmount}
            onQty={(v) => patch({ domesticHalfDays: v })}
            onAmount={(v) => patch({ domesticHalfDayAmount: v })}
          />
          <QtyAmountRow
            label="Night allowance"
            qty={form.domesticNightQty}
            amount={form.domesticNightAmount}
            onQty={(v) => patch({ domesticNightQty: v })}
            onAmount={(v) => patch({ domesticNightAmount: v })}
          />
          <QtyAmountRow
            label="Meal deduction — breakfast"
            qty={form.domesticBreakfastQty}
            amount={form.domesticBreakfastAmount}
            onQty={(v) => patch({ domesticBreakfastQty: v })}
            onAmount={(v) => patch({ domesticBreakfastAmount: v })}
          />
          <QtyAmountRow
            label="Meal deduction — lunch / dinner"
            qty={form.domesticLunchDinnerQty}
            amount={form.domesticLunchDinnerAmount}
            onQty={(v) => patch({ domesticLunchDinnerQty: v })}
            onAmount={(v) => patch({ domesticLunchDinnerAmount: v })}
          />
        </div>
      </Section>

      <Section title="Per diem — abroad">
        <div className="flex flex-col gap-3">
          {form.foreignRows.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-3 border-b border-border-subtle pb-3 last:border-b-0 last:pb-0 sm:grid-cols-5"
            >
              <Input
                label="Country"
                value={row.country}
                onChange={(e) => {
                  const foreignRows = [...form.foreignRows];
                  foreignRows[index] = { ...row, country: e.target.value };
                  patch({ foreignRows });
                }}
              />
              <Input
                label="Full day qty"
                value={row.fullDays}
                onChange={(e) => {
                  const foreignRows = [...form.foreignRows];
                  foreignRows[index] = { ...row, fullDays: e.target.value };
                  patch({ foreignRows });
                }}
                inputMode="decimal"
              />
              <Input
                label="Full day amount"
                value={row.fullDayAmount}
                onChange={(e) => {
                  const foreignRows = [...form.foreignRows];
                  foreignRows[index] = {
                    ...row,
                    fullDayAmount: e.target.value,
                  };
                  patch({ foreignRows });
                }}
                inputMode="decimal"
              />
              <Input
                label="Half day qty"
                value={row.halfDays}
                onChange={(e) => {
                  const foreignRows = [...form.foreignRows];
                  foreignRows[index] = { ...row, halfDays: e.target.value };
                  patch({ foreignRows });
                }}
                inputMode="decimal"
              />
              <Input
                label="Half day amount"
                value={row.halfDayAmount}
                onChange={(e) => {
                  const foreignRows = [...form.foreignRows];
                  foreignRows[index] = {
                    ...row,
                    halfDayAmount: e.target.value,
                  };
                  patch({ foreignRows });
                }}
                inputMode="decimal"
              />
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-fit"
            onClick={() =>
              patch({ foreignRows: [...form.foreignRows, emptyForeignRow()] })
            }
          >
            Add country
          </Button>
          <QtyAmountRow
            label="Meal deduction — breakfast"
            qty={form.foreignBreakfastQty}
            amount={form.foreignBreakfastAmount}
            onQty={(v) => patch({ foreignBreakfastQty: v })}
            onAmount={(v) => patch({ foreignBreakfastAmount: v })}
          />
          <QtyAmountRow
            label="Meal deduction — lunch / dinner"
            qty={form.foreignLunchDinnerQty}
            amount={form.foreignLunchDinnerAmount}
            onQty={(v) => patch({ foreignLunchDinnerQty: v })}
            onAmount={(v) => patch({ foreignLunchDinnerAmount: v })}
          />
        </div>
      </Section>

      <Section title="Taxable meal benefit">
        <p className="mb-3 text-sm text-text-secondary">
          Meals paid by the company (excluding representation).
        </p>
        <div className="flex flex-col gap-3">
          <QtyAmountRow
            label="Free breakfast"
            qty={form.freeBreakfastQty}
            amount={form.freeBreakfastAmount}
            onQty={(v) => patch({ freeBreakfastQty: v })}
            onAmount={(v) => patch({ freeBreakfastAmount: v })}
          />
          <QtyAmountRow
            label="Free lunch / dinner"
            qty={form.freeLunchDinnerQty}
            amount={form.freeLunchDinnerAmount}
            onQty={(v) => patch({ freeLunchDinnerQty: v })}
            onAmount={(v) => patch({ freeLunchDinnerAmount: v })}
          />
          <QtyAmountRow
            label="All meals free"
            qty={form.freeAllMealsQty}
            amount={form.freeAllMealsAmount}
            onQty={(v) => patch({ freeAllMealsQty: v })}
            onAmount={(v) => patch({ freeAllMealsAmount: v })}
          />
        </div>
      </Section>

      <Section title="Travel expenses">
        <p className="mb-3 text-sm text-text-secondary">
          Attach receipts when you send the PDF to payroll.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Tickets (train / bus / subway)"
            value={form.ticketsAmount}
            onChange={(e) => patch({ ticketsAmount: e.target.value })}
            inputMode="decimal"
          />
          <Input
            label="Rental car"
            value={form.rentalCarAmount}
            onChange={(e) => patch({ rentalCarAmount: e.target.value })}
            inputMode="decimal"
          />
          <Input
            label="Taxi"
            value={form.taxiAmount}
            onChange={(e) => patch({ taxiAmount: e.target.value })}
            inputMode="decimal"
          />
          <Input
            label="Other"
            value={form.otherAmount}
            onChange={(e) => patch({ otherAmount: e.target.value })}
            inputMode="decimal"
          />
        </div>
        <p className="mt-3 text-sm font-medium tabular-nums text-text-primary">
          Total travel expenses: {travelTotal.toFixed(2)}
        </p>
      </Section>

      <Section title="Mileage log">
        <div className="flex flex-col gap-3">
          {form.mileageRows.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_6rem]"
            >
              <Input
                label={index === 0 ? "Date" : undefined}
                type="date"
                value={row.date}
                onChange={(e) => {
                  const mileageRows = [...form.mileageRows];
                  mileageRows[index] = { ...row, date: e.target.value };
                  patch({ mileageRows });
                }}
              />
              <Input
                label={index === 0 ? "Companies / places visited" : undefined}
                value={row.places}
                onChange={(e) => {
                  const mileageRows = [...form.mileageRows];
                  mileageRows[index] = { ...row, places: e.target.value };
                  patch({ mileageRows });
                }}
              />
              <Input
                label={index === 0 ? "Km" : undefined}
                value={row.km}
                onChange={(e) => {
                  const mileageRows = [...form.mileageRows];
                  mileageRows[index] = { ...row, km: e.target.value };
                  patch({ mileageRows });
                }}
                inputMode="decimal"
              />
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-fit"
            onClick={() =>
              patch({ mileageRows: [...form.mileageRows, emptyMileageRow()] })
            }
          >
            Add row
          </Button>
          <p className="text-sm font-medium tabular-nums text-text-primary">
            Total km: {kmTotal.toFixed(1)}
          </p>
        </div>
      </Section>

      <section className="rounded-lg border border-border-subtle bg-bg-default p-4 shadow-primary">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <div className="mb-8 border-b border-border-default pt-8" />
            <p className="text-sm text-text-secondary">Date and signature</p>
          </div>
          <div>
            <div className="mb-8 border-b border-border-default pt-8" />
            <p className="text-sm text-text-secondary">Approval</p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 pb-8">
        <div>
          {mode === "edit" && expenseId ? (
            <Button
              type="button"
              variant="dangerSecondary"
              onClick={handleDelete}
              disabled={isPending}
            >
              Delete
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => downloadTravelExpensePdf(form)}
          >
            Download PDF
          </Button>
          <Button type="button" onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
