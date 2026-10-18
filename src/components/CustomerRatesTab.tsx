"use client";

import { useState, useEffect, useRef } from "react";
import { Trash2, Plus } from "lucide-react";
import {
  Select,
  Input,
  Button,
  DrawerListGroupHeader,
  drawerListRowClass,
  type DrawerListBleed,
  IconButton,
  InlineEditFieldContainer,
  InlineEditStatus,
  SAVED_DURATION_MS,
  editInputClass,
  inlineEditTriggerClass,
} from "@/components/ui";
import { getRoles } from "@/lib/rolesClient";
import {
  getCustomerRates,
  createCustomerRate,
  updateCustomerRate,
  deleteCustomerRate,
} from "@/lib/customerRatesClient";
import { isInlineEditValueChanged } from "@/lib/inlineEdit";
import { hourlyRateLabel, hourlyRateSuffix } from "@/lib/currency";
import type { Role } from "@/lib/rolesQueries";
import type { CustomerRate } from "@/lib/customerRatesQueries";

type ListHeader = {
  title: string;
  onAdd?: () => void;
  bleed?: "drawer" | "panel" | "none";
};

type Props =
  | {
      mode: "edit";
      customerId: string;
      billingCurrency?: string;
      onError: (msg: string) => void;
      showDescription?: boolean;
      refreshTrigger?: number;
      /** Muted group header (customer drawer / detail Rates). */
      listHeader?: ListHeader;
    }
  | {
      mode: "create";
      pendingRates: { roleId: string; roleName: string; ratePerHour: number }[];
      billingCurrency?: string;
      onAddRate: (roleId: string, roleName: string, ratePerHour: number) => void;
      onRemoveRate: (roleId: string) => void;
      onError: (msg: string) => void;
      showDescription?: boolean;
      listHeader?: ListHeader;
    };

export function CustomerRatesTab(props: Props) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [rates, setRates] = useState<CustomerRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [newRate, setNewRate] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const originalValueRef = useRef("");
  const [rateError, setRateError] = useState<string | null>(null);
  const [showSavedRate, setShowSavedRate] = useState(false);
  const lastSavedRateIdRef = useRef<string | null>(null);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await getRoles();
        if (!cancelled) setRoles(r);
      } catch {
        if (!cancelled) setRoles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (props.mode === "edit") {
      let cancelled = false;
      setLoading(true);
      getCustomerRates(props.customerId)
        .then((r) => {
          if (!cancelled) setRates(r);
        })
        .catch(() => {
          if (!cancelled) setRates([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    } else {
      setLoading(false);
    }
  }, [
    props.mode,
    props.mode === "edit" ? props.customerId : null,
    props.mode === "edit" ? props.refreshTrigger : null,
  ]);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  const displayCurrency =
    props.billingCurrency ??
    (props.mode === "edit" ? rates[0]?.currency : undefined) ??
    "SEK";
  const currencyLabel = hourlyRateSuffix(displayCurrency);
  const ratePlaceholder = hourlyRateLabel(displayCurrency);

  const getRateLabel = (rate: { display_name?: string; role_id: string | null }) =>
    rate.display_name ||
    (rate.role_id ? roles.find((r) => r.id === rate.role_id)?.name : null) ||
    "Unknown";

  const usedRoleIds =
    props.mode === "edit"
      ? rates.map((r) => r.role_id).filter((id): id is string => Boolean(id))
      : props.pendingRates.map((r) => r.roleId);
  const availableRoles = roles.filter((r) => !usedRoleIds.includes(r.id));

  const handleAddEdit = async () => {
    const roleId = selectedRoleId;
    const rateNum = parseFloat(newRate);
    if (!roleId || isNaN(rateNum) || rateNum < 0) {
      props.onError("Select a role and enter a valid rate");
      return;
    }
    if (props.mode === "edit") {
      try {
        await createCustomerRate(props.customerId, {
          roleId,
          ratePerHour: rateNum,
        });
        const updated = await getCustomerRates(props.customerId);
        setRates(updated);
        setSelectedRoleId("");
        setNewRate("");
      } catch (e) {
        props.onError(e instanceof Error ? e.message : "Failed to add rate");
      }
    } else {
      const role = roles.find((r) => r.id === roleId);
      if (!role) return;
      props.onAddRate(roleId, role.name, rateNum);
      setSelectedRoleId("");
      setNewRate("");
    }
  };

  const handleUpdateEdit = async (rate: CustomerRate, newVal: number) => {
    if (props.mode !== "edit") return;
    setRateError(null);
    const previousVal = rate.rate_per_hour;
    setRates((prev) =>
      prev.map((r) =>
        r.id === rate.id ? { ...r, rate_per_hour: newVal } : r
      )
    );
    setEditingRateId(null);
    lastSavedRateIdRef.current = rate.id;
    setShowSavedRate(true);
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    savedTimeoutRef.current = setTimeout(() => {
      savedTimeoutRef.current = null;
      setShowSavedRate(false);
      lastSavedRateIdRef.current = null;
    }, SAVED_DURATION_MS);
    setUpdatingId(rate.id);
    try {
      await updateCustomerRate(rate.id, newVal);
    } catch (e) {
      setRateError(e instanceof Error ? e.message : "Failed to update rate");
      setShowSavedRate(false);
      lastSavedRateIdRef.current = null;
      setRates((prev) =>
        prev.map((r) =>
          r.id === rate.id ? { ...r, rate_per_hour: previousVal } : r
        )
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const startEdit = (rate: CustomerRate) => {
    if (props.mode !== "edit") return;
    setRateError(null);
    originalValueRef.current = String(rate.rate_per_hour);
    setEditValue(originalValueRef.current);
    setEditingRateId(rate.id);
  };

  const cancelEdit = () => {
    setEditingRateId(null);
    setRateError(null);
  };

  const commitEdit = (rate: CustomerRate) => {
    if (editingRateId !== rate.id) return;
    const trimmed = editValue.trim();
    if (trimmed === "") {
      setEditingRateId(null);
      return;
    }
    const num = parseFloat(trimmed.replace(",", "."));
    if (isNaN(num) || num < 0) {
      setRateError("Enter a valid number");
      return;
    }
    if (!isInlineEditValueChanged(originalValueRef.current, trimmed)) {
      setEditingRateId(null);
      return;
    }
    handleUpdateEdit(rate, num);
  };

  const handleRemoveEdit = async (rate: CustomerRate) => {
    if (props.mode !== "edit") return;
    if (editingRateId === rate.id) {
      setEditingRateId(null);
      setRateError(null);
    }
    try {
      await deleteCustomerRate(rate.id);
      setRates((prev) => prev.filter((r) => r.id !== rate.id));
    } catch (e) {
      props.onError(e instanceof Error ? e.message : "Failed to remove rate");
    }
  };

  const displayRates =
    props.mode === "edit"
      ? rates
      : props.pendingRates.map((r) => ({
          id: r.roleId,
          role_id: r.roleId,
          role_name: r.roleName,
          rate_per_hour: r.ratePerHour,
        }));

  const showDescription = "showDescription" in props ? props.showDescription : true;

  const rateStatus = (rateId: string) =>
    updatingId === rateId
      ? "saving"
      : showSavedRate && lastSavedRateIdRef.current === rateId
        ? "saved"
        : rateError
          ? "error"
          : "idle";

  const listHeader = props.listHeader;
  const bleed: DrawerListBleed = listHeader?.bleed ?? (listHeader ? "drawer" : "none");

  return (
    <div className="space-y-1">
      {listHeader ? (
        <DrawerListGroupHeader
          title={listHeader.title}
          count={loading ? undefined : displayRates.length}
          bleed={bleed}
          action={
            listHeader.onAdd ? (
              <button
                type="button"
                onClick={listHeader.onAdd}
                className="rounded-md px-1.5 py-0.5 text-label-s font-medium text-text-tertiary hover:bg-text-primary/[0.06] hover:text-text-secondary"
              >
                + Add
              </button>
            ) : null
          }
        />
      ) : null}
      {loading ? (
        <p className="py-2 text-sm text-text-tertiary">Loading rates…</p>
      ) : (
        <>
          {displayRates.length === 0 ? (
            <p className="py-2 text-sm text-text-tertiary">No rates yet.</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {displayRates.map((r) => {
                const rate = r as CustomerRate;
                const isEdit = props.mode === "edit" && editingRateId === rate.id;
                return (
                  <li
                    key={props.mode === "edit" ? rate.id : r.role_id}
                    className={`group ${drawerListRowClass(bleed)}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                      {props.mode === "edit"
                        ? getRateLabel(rate)
                        : (r as { role_name: string }).role_name}
                    </span>
                    {props.mode === "edit" ? (
                      <div className="min-w-[5.5rem] shrink-0">
                        <InlineEditFieldContainer
                          isEditing={isEdit}
                          onRequestClose={() => commitEdit(rate)}
                          showSavedIndicator={
                            showSavedRate &&
                            lastSavedRateIdRef.current === rate.id
                          }
                          reserveStatusRow={false}
                          displayContent={
                            <button
                              type="button"
                              onClick={() => startEdit(rate)}
                              className={`${inlineEditTriggerClass} w-full min-w-[5rem] whitespace-nowrap text-right`}
                            >
                              {rate.rate_per_hour} {currencyLabel}
                            </button>
                          }
                          editContent={
                            <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onFocus={(e) => e.target.select()}
                                onBlur={() => commitEdit(rate)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitEdit(rate);
                                  }
                                  if (e.key === "Escape") {
                                    e.preventDefault();
                                    cancelEdit();
                                  }
                                }}
                                disabled={updatingId === rate.id}
                                className={`w-20 text-right ${editInputClass}`}
                                autoFocus
                              />
                              <span className="shrink-0 text-sm text-text-primary opacity-70">
                                {currencyLabel}
                              </span>
                            </div>
                          }
                          statusContent={
                            <InlineEditStatus
                              status={rateStatus(rate.id)}
                              message={rateError}
                            />
                          }
                        />
                      </div>
                    ) : (
                      <span className="shrink-0 whitespace-nowrap text-sm font-medium text-text-primary">
                        {(r as { rate_per_hour: number }).rate_per_hour}{" "}
                        {currencyLabel}
                      </span>
                    )}
                    <IconButton
                      variant="ghostDanger"
                      onClick={() =>
                        props.mode === "edit"
                          ? handleRemoveEdit(rate)
                          : props.onRemoveRate(
                              (r as { role_id: string }).role_id
                            )
                      }
                      aria-label="Remove rate"
                      className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          )}

          {availableRoles.length > 0 && props.mode === "create" && (
            <div className="flex flex-nowrap items-center gap-2 pt-3">
              <div className="min-w-[12rem] w-56 shrink-0">
                <Select
                  id="rate-role"
                  value={selectedRoleId}
                  onValueChange={setSelectedRoleId}
                  placeholder="Role"
                  options={availableRoles.map((r) => ({
                    value: r.id,
                    label: r.name,
                  }))}
                  size="md"
                  className="w-full"
                  triggerClassName="h-9 border-form"
                />
              </div>
              <div className="min-w-[11rem] shrink-0">
                <Input
                  id="rate-value"
                  type="number"
                  min={0}
                  step={1}
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  placeholder={ratePlaceholder}
                  className="h-9 w-full border-form"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddEdit}
                className="ml-auto h-9 shrink-0 border-form"
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
          )}

          {roles.length === 0 && props.mode === "create" && (
            <p className="text-sm text-text-primary opacity-60">
              No roles found. Add roles first to set customer rates.
            </p>
          )}
        </>
      )}
    </div>
  );
}
