"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, OptionSegments, PageLoading, Switch } from "@/components/ui";
import {
  DEFAULT_BILLING_CURRENCY,
  parseBillingCurrency,
  type BillingCurrency,
} from "@/lib/currency";
import {
  getSupportContractForCustomer,
  listSupportContractTiers,
  saveSupportContract,
  type SupportContractInput,
} from "@/lib/supportContracts";
import type { SupportContractTier } from "@/lib/supportContractsQueries";

type Props = {
  customerId: string;
  billingCurrency?: string;
  canEdit: boolean;
};

export function CustomerDrawerSupportTab({
  customerId,
  billingCurrency,
  canEdit,
}: Props) {
  const router = useRouter();
  const defaultCurrency = parseBillingCurrency(billingCurrency);
  const [tiers, setTiers] = useState<SupportContractTier[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState<SupportContractInput>({
    tierCode: "bas",
    active: false,
    valueAmount: null,
    valueCurrency: defaultCurrency,
    startsOn: "",
    endsOn: "",
    notes: "",
    contactMarkdown: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [nextTiers, nextContract] = await Promise.all([
          listSupportContractTiers(),
          getSupportContractForCustomer(customerId),
        ]);
        if (cancelled) return;
        setTiers(nextTiers);
        setForm({
          tierCode: nextContract?.tierCode ?? nextTiers[0]?.code ?? "bas",
          active: nextContract?.active ?? false,
          valueAmount: nextContract?.valueAmount ?? null,
          valueCurrency: parseBillingCurrency(
            nextContract?.valueCurrency ?? defaultCurrency
          ),
          startsOn: nextContract?.startsOn ?? "",
          endsOn: nextContract?.endsOn ?? "",
          notes: nextContract?.notes ?? "",
          contactMarkdown: nextContract?.contactMarkdown ?? "",
        });
        setLoaded(true);
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "Failed to load contract"
          );
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, defaultCurrency]);

  if (!loaded) {
    return (
      <div className="px-6 py-6">
        <PageLoading />
      </div>
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setError(null);
    startTransition(async () => {
      try {
        await saveSupportContract(customerId, {
          ...form,
          valueCurrency: parseBillingCurrency(form.valueCurrency),
          startsOn: form.startsOn || null,
          endsOn: form.endsOn || null,
          valueAmount:
            form.valueAmount === null || Number.isNaN(form.valueAmount as number)
              ? null
              : form.valueAmount,
        });
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to save");
      }
    });
  }

  return (
    <form className="space-y-5 px-6 py-6" onSubmit={submit}>
      <div>
        <h2 className="text-label-l text-text-primary">Support contract</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Activating a contract provisions a Support Work board (prefix SUP),
          creates or reuses a customer project named Support (hourly) for time
          reporting, links them together, and unlocks Incidents in Rove Support.
          Monitoring can exist without a contract.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div
        className={`rounded-xl border p-4 transition-colors ${
          form.active
            ? "border-brand-signal/40 bg-brand-signal/5"
            : "border-border-subtle bg-bg-muted/40"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary">
              Active support contract
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              {form.active
                ? "Contract is on — Work board, Support project, and Incidents are provisioned on save."
                : "Turn on to set package, monthly value, and contact details."}
            </p>
          </div>
          <Switch
            id="support-active"
            tone="success"
            checked={form.active}
            disabled={!canEdit || pending}
            onCheckedChange={(checked) =>
              setForm((prev) => ({
                ...prev,
                active: checked,
                valueCurrency: parseBillingCurrency(
                  prev.valueCurrency || defaultCurrency || DEFAULT_BILLING_CURRENCY
                ),
              }))
            }
            aria-label="Active support contract"
          />
        </div>
      </div>

      {form.active ? (
        <div className="space-y-5">
          <div>
            <label
              htmlFor="support-tier"
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              Package
            </label>
            <select
              id="support-tier"
              className="h-10 w-full rounded-lg border border-form bg-bg-default px-3 text-sm"
              value={form.tierCode}
              disabled={!canEdit || pending}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, tierCode: event.target.value }))
              }
            >
              {tiers.map((tier) => (
                <option key={tier.code} value={tier.code}>
                  {tier.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="support-value"
              label="Contract value (per month)"
              type="number"
              min={0}
              step="0.01"
              value={form.valueAmount ?? ""}
              disabled={!canEdit || pending}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  valueAmount:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                }))
              }
            />
            <div>
              <p className="mb-1 text-sm font-medium text-text-primary">
                Currency
              </p>
              <OptionSegments
                name="Support contract currency"
                value={parseBillingCurrency(form.valueCurrency)}
                disabled={!canEdit || pending}
                onChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    valueCurrency: value as BillingCurrency,
                  }))
                }
                options={[
                  { value: "SEK", label: "SEK" },
                  { value: "EUR", label: "EUR" },
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="support-starts"
              label="Starts on"
              type="date"
              value={form.startsOn ?? ""}
              disabled={!canEdit || pending}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, startsOn: event.target.value }))
              }
            />
            <Input
              id="support-ends"
              label="Ends on"
              type="date"
              value={form.endsOn ?? ""}
              disabled={!canEdit || pending}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, endsOn: event.target.value }))
              }
            />
          </div>
          <label className="block text-sm font-medium text-text-primary">
            Notes
            <textarea
              className="mt-1 w-full rounded-lg border border-form bg-bg-default px-3 py-2 text-sm"
              rows={2}
              value={form.notes}
              disabled={!canEdit || pending}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, notes: event.target.value }))
              }
            />
          </label>
          <label className="block text-sm font-medium text-text-primary">
            Contact text (kept for later Support → Contact)
            <textarea
              className="mt-1 w-full rounded-lg border border-form bg-bg-default px-3 py-2 text-sm"
              rows={5}
              value={form.contactMarkdown}
              disabled={!canEdit || pending}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  contactMarkdown: event.target.value,
                }))
              }
            />
          </label>
        </div>
      ) : null}

      {canEdit ? (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save support contract"}
        </Button>
      ) : (
        <p className="text-sm text-text-secondary">
          You cannot edit this contract.
        </p>
      )}
    </form>
  );
}
