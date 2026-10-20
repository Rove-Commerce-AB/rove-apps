"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DrawerFieldRow,
  DrawerSelectField,
  InlineEditFieldContainer,
  InlineEditStatus,
  InlineEditTrigger,
  OptionSegments,
  SAVED_DURATION_MS,
  editInputClass,
} from "@/components/ui";
import { updateCustomerAction } from "@/app/(app)/customers/actions";
import { isInlineEditValueChanged } from "@/lib/inlineEdit";
import { parseBillingCurrency, type BillingCurrency } from "@/lib/currency";
import type { CustomerAppUser } from "@/lib/customerAppUsersQueries";
import type { CustomerWithDetails } from "@/types";

type EditField =
  | "name"
  | "url"
  | "subscriptionId"
  | "litiumVersion"
  | "contact"
  | "accountManager"
  | "logoUrl"
  | "color"
  | "billingCurrency"
  | null;

type Props = {
  customer: CustomerWithDetails;
  allConsultants: { id: string; name: string }[];
  assignedUsers: CustomerAppUser[];
};

export function CustomerDrawerOverview({
  customer,
  allConsultants = [],
  assignedUsers = [],
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(customer.name);
  const [url, setUrl] = useState(customer.url ?? "");
  const [subscriptionId, setSubscriptionId] = useState(
    customer.subscriptionId ?? ""
  );
  const [litiumVersion, setLitiumVersion] = useState(
    customer.litiumVersion ?? ""
  );
  const [contactAppUserId, setContactAppUserId] = useState(
    customer.contactAppUserId ?? ""
  );
  const [accountManagerId, setAccountManagerId] = useState(
    customer.accountManagerId ?? ""
  );
  const [accountManagerName, setAccountManagerName] = useState(
    customer.accountManagerName ?? ""
  );
  const [logoUrl, setLogoUrl] = useState(customer.logoUrl ?? "");
  const [color, setColor] = useState(customer.color);
  const [isInternal, setIsInternal] = useState(customer.isInternal);
  const [workShowEstimatesToCustomerUsers, setWorkShowEstimatesToCustomerUsers] =
    useState(customer.workShowEstimatesToCustomerUsers ?? false);
  const [
    workShowReportedTimeToCustomerUsers,
    setWorkShowReportedTimeToCustomerUsers,
  ] = useState(customer.workShowReportedTimeToCustomerUsers ?? false);
  const [billingCurrency, setBillingCurrency] = useState<BillingCurrency>(
    parseBillingCurrency(customer.billingCurrency)
  );
  const [editingField, setEditingField] = useState<EditField>(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [lastSavedField, setLastSavedField] = useState<EditField>(null);
  const originalEditValueRef = useRef("");
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setContactAppUserId(customer.contactAppUserId ?? "");
  }, [customer.contactAppUserId]);

  useEffect(() => {
    setLitiumVersion(customer.litiumVersion ?? "");
  }, [customer.litiumVersion]);

  useEffect(() => {
    setIsInternal(customer.isInternal);
    setWorkShowEstimatesToCustomerUsers(
      customer.workShowEstimatesToCustomerUsers ?? false
    );
    setWorkShowReportedTimeToCustomerUsers(
      customer.workShowReportedTimeToCustomerUsers ?? false
    );
  }, [
    customer.isInternal,
    customer.workShowEstimatesToCustomerUsers,
    customer.workShowReportedTimeToCustomerUsers,
  ]);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  function startEdit(field: EditField, value: string) {
    setError(null);
    originalEditValueRef.current = value;
    setEditValue(value);
    setEditingField(field);
  }

  function cancelEdit() {
    setEditValue(originalEditValueRef.current);
    setEditingField(null);
    setError(null);
  }

  function markSaved(field: EditField) {
    setLastSavedField(field);
    setShowSaved(true);
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    savedTimeoutRef.current = setTimeout(() => {
      savedTimeoutRef.current = null;
      setLastSavedField(null);
      setShowSaved(false);
    }, SAVED_DURATION_MS);
  }

  async function saveField(field: Exclude<EditField, null>, value: string) {
    const trimmed = value.trim();
    if (field === "name" && !trimmed) {
      setError("Customer name is required");
      return;
    }
    if (
      field === "subscriptionId" &&
      trimmed &&
      (trimmed.length !== 6 || /\s/.test(trimmed))
    ) {
      setError("Subscription ID must be exactly 6 characters");
      return;
    }
    if (field === "litiumVersion" && trimmed.length > 200) {
      setError("Litium version cannot be longer than 200 characters");
      return;
    }

    setError(null);
    setEditingField(null);
    setSubmitting(true);
    try {
      switch (field) {
        case "name":
          await updateCustomerAction(customer.id, { name: trimmed });
          setName(trimmed);
          break;
        case "url":
          await updateCustomerAction(customer.id, { url: trimmed || null });
          setUrl(trimmed);
          break;
        case "subscriptionId":
          await updateCustomerAction(customer.id, {
            subscription_id: trimmed || null,
          });
          setSubscriptionId(trimmed);
          break;
        case "litiumVersion":
          await updateCustomerAction(customer.id, {
            litium_version: trimmed || null,
          });
          setLitiumVersion(trimmed);
          break;
        case "contact": {
          await updateCustomerAction(customer.id, {
            contact_app_user_id: value || null,
          });
          setContactAppUserId(value);
          break;
        }
        case "accountManager": {
          await updateCustomerAction(customer.id, {
            account_manager_id: value || null,
          });
          const selected = allConsultants.find(
            (consultant) => consultant.id === value
          );
          setAccountManagerId(value);
          setAccountManagerName(selected?.name ?? "");
          break;
        }
        case "logoUrl":
          await updateCustomerAction(customer.id, {
            logo_url: trimmed || null,
          });
          setLogoUrl(trimmed);
          break;
        case "color":
          await updateCustomerAction(customer.id, { color: trimmed || null });
          setColor(trimmed || customer.color);
          break;
        case "billingCurrency": {
          const next = parseBillingCurrency(value);
          await updateCustomerAction(customer.id, { billing_currency: next });
          setBillingCurrency(next);
          break;
        }
      }
      markSaved(field);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update customer");
    } finally {
      setSubmitting(false);
    }
  }

  function commitEdit(overrideValue?: string) {
    if (editingField == null) return;
    const value = overrideValue ?? editValue;
    if (!isInlineEditValueChanged(originalEditValueRef.current, value)) {
      setEditingField(null);
      return;
    }
    void saveField(editingField, value);
  }

  async function setInternal(next: boolean) {
    if (next === isInternal) return;
    setError(null);
    setSubmitting(true);
    try {
      await updateCustomerAction(customer.id, { is_internal: next });
      setIsInternal(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update type");
    } finally {
      setSubmitting(false);
    }
  }

  async function setWorkShowEstimates(next: boolean) {
    if (next === workShowEstimatesToCustomerUsers) return;
    setError(null);
    setSubmitting(true);
    try {
      await updateCustomerAction(customer.id, {
        work_show_estimates_to_customer_users: next,
      });
      setWorkShowEstimatesToCustomerUsers(next);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to update Show estimates"
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function setWorkShowReportedTime(next: boolean) {
    if (next === workShowReportedTimeToCustomerUsers) return;
    setError(null);
    setSubmitting(true);
    try {
      await updateCustomerAction(customer.id, {
        work_show_reported_time_to_customer_users: next,
      });
      setWorkShowReportedTimeToCustomerUsers(next);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to update Show reported time"
      );
    } finally {
      setSubmitting(false);
    }
  }

  const inlineStatus = submitting
    ? "saving"
    : showSaved
      ? "saved"
      : error
        ? "error"
        : "idle";

  function textField(
    label: string,
    field: Exclude<EditField, "accountManager" | "contact" | "color" | null>,
    value: string,
    inputType: "text" | "url" | "email" = "text"
  ) {
    const displayValue = value || "—";
    return (
      <DrawerFieldRow label={label}>
        <InlineEditFieldContainer
          isEditing={editingField === field}
          onRequestClose={commitEdit}
          hideAccessory
          reserveStatusRow={false}
          showSavedIndicator={showSaved && lastSavedField === field}
          displayContent={
            <InlineEditTrigger
              boxed
              onClick={() => startEdit(field, value)}
              className={value ? "" : "text-text-tertiary"}
            >
              <span
                className={`truncate text-sm ${
                  field === "url"
                    ? "text-text-link"
                    : "text-text-primary"
                }`}
              >
                {displayValue}
              </span>
            </InlineEditTrigger>
          }
          editContent={
            <input
              type={inputType}
              value={editValue}
              onChange={(event) => setEditValue(event.target.value)}
              onFocus={(event) => event.target.select()}
              onBlur={() => commitEdit()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitEdit();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEdit();
                }
              }}
              maxLength={
                field === "subscriptionId"
                  ? 6
                  : field === "litiumVersion"
                    ? 200
                    : undefined
              }
              className={editInputClass}
              autoFocus
            />
          }
          statusContent={
            <InlineEditStatus status={inlineStatus} message={error} />
          }
        />
      </DrawerFieldRow>
    );
  }

  return (
    <>
      <div className="flex min-h-full flex-col">
        {error ? (
          <p className="px-6 pt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="px-6 pt-4">
          {textField("Name", "name", name)}
          {textField("URL", "url", url, "url")}
          {textField("Subscription ID", "subscriptionId", subscriptionId)}
          {textField("Litium version", "litiumVersion", litiumVersion)}
          {customer.isInternal ? null : (
            <DrawerFieldRow label="Contact">
              <DrawerSelectField
                value={contactAppUserId}
                onValueChange={(value) => {
                  if (!isInlineEditValueChanged(contactAppUserId, value)) return;
                  void saveField("contact", value);
                }}
                options={[
                  { value: "", label: "—" },
                  ...(contactAppUserId &&
                  !assignedUsers.some((user) => user.id === contactAppUserId)
                    ? [
                        {
                          value: contactAppUserId,
                          label:
                            customer.contactName ||
                            customer.contactEmail ||
                            "Contact",
                        },
                      ]
                    : []),
                  ...assignedUsers.map((user) => ({
                    value: user.id,
                    label: `${user.name} (${user.email})`,
                  })),
                ]}
                placeholder="—"
                disabled={assignedUsers.length === 0 && !contactAppUserId}
              />
            </DrawerFieldRow>
          )}

          <DrawerFieldRow label="Account manager">
            <DrawerSelectField
              value={accountManagerId}
              onValueChange={(value) => {
                if (!isInlineEditValueChanged(accountManagerId, value)) return;
                void saveField("accountManager", value);
              }}
              options={[
                { value: "", label: "—" },
                ...(accountManagerId &&
                accountManagerName &&
                !allConsultants.some(
                  (consultant) => consultant.id === accountManagerId
                )
                  ? [
                      {
                        value: accountManagerId,
                        label: accountManagerName,
                      },
                    ]
                  : []),
                ...allConsultants.map((consultant) => ({
                  value: consultant.id,
                  label: consultant.name,
                })),
              ]}
              placeholder="—"
            />
          </DrawerFieldRow>
        </div>

        <div className="border-t border-border-subtle px-6">
          <DrawerFieldRow label="Type">
            <OptionSegments
              name="Type"
              value={isInternal ? "internal" : "standard"}
              onChange={(value) => void setInternal(value === "internal")}
              disabled={submitting}
              options={[
                { value: "standard", label: "Standard" },
                { value: "internal", label: "Internal" },
              ]}
            />
          </DrawerFieldRow>
          {!isInternal ? (
            <>
              <DrawerFieldRow
                label="Show estimates"
                info="Customer users can see estimates on Work"
              >
                <OptionSegments
                  name="Show estimates"
                  value={workShowEstimatesToCustomerUsers ? "show" : "hide"}
                  onChange={(value) =>
                    void setWorkShowEstimates(value === "show")
                  }
                  disabled={submitting}
                  options={[
                    { value: "hide", label: "Hidden" },
                    { value: "show", label: "Visible" },
                  ]}
                />
              </DrawerFieldRow>
              <DrawerFieldRow
                label="Show reported time"
                info="Customer users can see logged time on Work"
              >
                <OptionSegments
                  name="Show reported time"
                  value={
                    workShowReportedTimeToCustomerUsers ? "show" : "hide"
                  }
                  onChange={(value) =>
                    void setWorkShowReportedTime(value === "show")
                  }
                  disabled={submitting}
                  options={[
                    { value: "hide", label: "Hidden" },
                    { value: "show", label: "Visible" },
                  ]}
                />
              </DrawerFieldRow>
            </>
          ) : null}
          <DrawerFieldRow
            label="Billing currency"
            info="Existing rates keep their numbers but switch label to this currency. Update hourly amounts if the contract price changed."
          >
            <OptionSegments
              name="Billing currency"
              value={billingCurrency}
              onChange={(value) => {
                if (!isInlineEditValueChanged(billingCurrency, value)) return;
                void saveField("billingCurrency", value);
              }}
              disabled={submitting}
              options={[
                { value: "SEK", label: "SEK" },
                { value: "EUR", label: "EUR" },
              ]}
            />
          </DrawerFieldRow>
        </div>

        <div className="border-t border-border-subtle px-6">
          {textField("Logo URL", "logoUrl", logoUrl, "url")}
          <DrawerFieldRow label="Color">
            <InlineEditFieldContainer
              isEditing={editingField === "color"}
              onRequestClose={commitEdit}
              hideAccessory
              reserveStatusRow={false}
              showSavedIndicator={showSaved && lastSavedField === "color"}
              displayContent={
                <InlineEditTrigger
                  boxed
                  onClick={() => startEdit("color", color)}
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm text-text-primary">
                    <span
                      className="h-4 w-4 shrink-0 rounded-sm border border-border-default"
                      style={{ backgroundColor: color }}
                      aria-hidden
                    />
                    <span className="truncate">{color}</span>
                  </span>
                </InlineEditTrigger>
              }
              editContent={
                <input
                  type="color"
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                  onBlur={() => commitEdit()}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelEdit();
                    }
                  }}
                  className="h-9 w-full cursor-pointer rounded-md border border-transparent bg-transparent p-1 hover:bg-text-primary/[0.06] focus:border-form focus:bg-bg-default focus:outline-none focus:ring-1 focus:ring-inset focus:ring-brand-signal/25"
                  autoFocus
                  aria-label="Customer color"
                />
              }
              statusContent={
                <InlineEditStatus status={inlineStatus} message={error} />
              }
            />
          </DrawerFieldRow>
        </div>

      </div>
    </>
  );
}
