"use client";

import { useState, useEffect } from "react";
import { updateCustomerAction, deleteCustomerAction } from "@/app/(app)/customers/actions";
import { DEFAULT_CUSTOMER_COLOR } from "@/lib/constants";
import {
  Button,
  ConfirmModal,
  Dialog,
  ModalField,
  ModalFormSection,
  ModalNativeSelect,
  ModalTextInput,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  modalInputClass,
} from "@/components/ui";
import { CustomerRatesTab } from "./CustomerRatesTab";
import { SizePricesSection } from "./SizePricesSection";
import type { CustomerWithDetails } from "@/types";

type Tab = "information" | "rates";

type Props = {
  customer: CustomerWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Consultants for Account Manager dropdown; pass from parent if modal is used. */
  allConsultants?: { id: string; name: string }[];
  isAdmin?: boolean;
};

export function EditCustomerModal({
  customer,
  isOpen,
  onClose,
  onSuccess,
  allConsultants = [],
  isAdmin = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("information");
  const [name, setName] = useState("");
  const [accountManagerId, setAccountManagerId] = useState<string>("");
  const [color, setColor] = useState(DEFAULT_CUSTOMER_COLOR);
  const [logoUrl, setLogoUrl] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (customer) {
      setName(customer.name);
      setAccountManagerId(customer.accountManagerId ?? "");
      setColor(customer.color ?? DEFAULT_CUSTOMER_COLOR);
      setLogoUrl(customer.logoUrl ?? "");
      setIsInternal(customer.isInternal ?? false);
    }
  }, [customer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    setError(null);
    if (!name.trim()) {
      setError("Company name is required");
      return;
    }
    setSubmitting(true);
    try {
      await updateCustomerAction(customer.id, {
        name: name.trim(),
        account_manager_id: accountManagerId || null,
        color: color.trim() || null,
        logo_url: logoUrl.trim() || null,
        is_internal: isInternal,
      });
      resetForm();
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update customer");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!customer) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteCustomerAction(customer.id);
      setShowDeleteConfirm(false);
      resetForm();
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete customer");
    } finally {
      setDeleting(false);
    }
  };

  const resetForm = () => {
    setName("");
    setAccountManagerId("");
    setColor(DEFAULT_CUSTOMER_COLOR);
    setLogoUrl("");
    setIsInternal(false);
    setError(null);
    setRatesError(null);
    setActiveTab("information");
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm();
      onClose();
    }
  };

  if (!customer) return null;

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        title="Edit customer"
        contentClassName="max-h-[90vh] overflow-y-auto"
      >
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as Tab)}
          className="mt-4"
        >
          <TabsList>
            <TabsTrigger value="information">Information</TabsTrigger>
            <TabsTrigger value="rates">Hourly rates</TabsTrigger>
          </TabsList>
          <TabsContent value="information" className="mt-4 min-h-[340px]">
          <form
            id="edit-customer-form"
            onSubmit={handleSubmit}
            className="modal-form-discreet space-y-3"
          >
            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <div className="space-y-3">
              <ModalTextInput
                id="edit-customer-name"
                label="Company name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Company AB"
              />

              <ModalNativeSelect
                id="edit-customer-account-manager"
                label="Account Manager"
                value={accountManagerId}
                onChange={(e) => setAccountManagerId(e.target.value)}
              >
                <option value="">—</option>
                {allConsultants.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </ModalNativeSelect>

              <label
                htmlFor="edit-customer-is-internal"
                className="flex items-center gap-2 text-[13px] text-text-primary"
              >
                <input
                  id="edit-customer-is-internal"
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                />
                Internal customer
              </label>
            </div>

            <ModalFormSection title="Brand">
              <ModalField id="edit-customer-color" label="Color">
                <div className="flex items-center gap-2">
                  <input
                    id="edit-customer-color"
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-8 w-12 cursor-pointer rounded border border-form bg-transparent p-0"
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder={DEFAULT_CUSTOMER_COLOR}
                    aria-label="Color hex value"
                    className={`flex-1 ${modalInputClass}`}
                  />
                </div>
              </ModalField>

              <ModalTextInput
                id="edit-customer-logo"
                label="Logo URL (optional)"
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
              />
            </ModalFormSection>
          </form>
          </TabsContent>
          <TabsContent value="rates" className="mt-4 min-h-[340px]">
            {customer && (
              <>
                <CustomerRatesTab
                  mode="edit"
                  customerId={customer.id}
                  billingCurrency={customer.billingCurrency}
                  onError={setRatesError}
                />
                <div className="mt-6 border-t border-border-subtle pt-4">
                  <SizePricesSection
                    scope="customer"
                    ownerId={customer.id}
                    billingCurrency={customer.billingCurrency}
                    onError={setRatesError}
                  />
                </div>
              </>
            )}
            {ratesError && (
              <p className="mt-4 text-sm text-danger">{ratesError}</p>
            )}
          </TabsContent>
        </Tabs>

        <div className="mt-4 flex items-center justify-between gap-2">
          {isAdmin ? (
            <Button
              type="button"
              variant="dangerSecondary"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={submitting || deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleOpenChange(false)}
            >
              {activeTab === "rates" ? "Close" : "Cancel"}
            </Button>
            {activeTab === "information" && (
              <Button
                type="submit"
                size="sm"
                form="edit-customer-form"
                disabled={submitting || deleting}
              >
                {submitting ? "Saving…" : "Save"}
              </Button>
            )}
          </div>
        </div>
      </Dialog>

      {isAdmin && (
        <ConfirmModal
          isOpen={showDeleteConfirm}
          title="Delete customer"
          message={`Delete ${customer?.name}? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
