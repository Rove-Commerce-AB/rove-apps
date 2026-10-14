"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Briefcase,
  Building2,
  CalendarCheck,
  Handshake,
  Clock,
  IdCard,
  Plus,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import { AddConsultantModal } from "@/components/AddConsultantModal";
import { AppAccessList } from "@/components/AppAccessList";
import { CustomerFavicon } from "@/components/CustomerFavicon";
import { ConsultantDetailClient } from "@/components/ConsultantDetailClient";
import { PersonCustomersTab, type PersonCustomerOption } from "@/components/PersonCustomersTab";
import { PersonMcpAccessTab } from "@/components/PersonMcpAccessTab";
import {
  createConsultantProfileForUser,
  createUserPerson,
  setPersonApps,
} from "@/lib/people";
import { deleteConsultantAction } from "@/app/(app)/consultants/actions";
import {
  APP_KEYS,
  APP_LABELS,
  CUSTOMER_APP_KEYS,
  type AppKey,
  type PersonListItem,
} from "@/lib/peopleTypes";
import {
  removeAppUser,
  updateAppUser,
  type AppUserRole,
} from "@/lib/appUsers";
import { personHref, ROUTES } from "@/lib/routes";
import { isInlineEditValueChanged } from "@/lib/inlineEdit";
import { compareTextSv } from "@/lib/sort";
import {
  Badge,
  Button,
  CapacityBar,
  ConfirmModal,
  DataTable,
  Dialog,
  DrawerFieldRow,
  DrawerSelectField,
  EmptyState,
  InitialsAvatar,
  InlineEditFieldContainer,
  InlineEditStatus,
  InlineEditTrigger,
  Input,
  PageHeader,
  SAVED_DURATION_MS,
  Select,
  SideDrawer,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  editInputClass,
  type DataTableColumn,
} from "@/components/ui";

type Props = {
  people: PersonListItem[];
  roles: { id: string; name: string }[];
  calendars: { id: string; name: string }[];
  customers: PersonCustomerOption[];
  error: string | null;
};

type PeopleFilter = "all" | "consultant" | "subcontractor" | "customer";
type PersonKind = "consultant" | "subcontractor" | "customer" | "user";
type SortKey = "name" | "team" | "type" | "capacity" | "overhead" | "apps";
type SortDirection = "asc" | "desc";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function personKind(person: PersonListItem): PersonKind {
  if (person.userRole === "customer") return "customer";
  if (person.consultant?.isExternal) {
    return "subcontractor";
  }
  if (person.consultantId) return "consultant";
  return "user";
}

function personType(person: PersonListItem): string {
  switch (personKind(person)) {
    case "customer":
      return "Customer";
    case "subcontractor":
      return "Subcontractor";
    case "consultant":
      return "Consultant";
    default:
      return "User";
  }
}

function isCustomerUser(person: PersonListItem): boolean {
  return person.userRole === "customer";
}

function personTeamName(person: PersonListItem): string {
  return (person.consultant?.teamName ?? "").replace(/^Team\s+/i, "");
}

function personCustomerNames(person: PersonListItem): string {
  if (person.userRole !== "customer") return "";
  return person.customers.map((customer) => customer.name).join(", ");
}

const TYPE_ICON_CLASS: Record<PersonKind, string> = {
  consultant: "text-[var(--color-green-600)]",
  subcontractor: "text-[var(--color-amber-600)]",
  customer: "text-[var(--color-blue-600)]",
  user: "text-text-muted",
};

const APP_ICONS: Record<AppKey, typeof CalendarCheck> = {
  planner: CalendarCheck,
  time_report: Clock,
  insights: Sparkles,
  work: Briefcase,
};

function PersonTypeCell({ person }: { person: PersonListItem }) {
  const kind = personKind(person);
  const label = personType(person);
  const Icon =
    kind === "customer"
      ? Building2
      : kind === "subcontractor"
        ? Handshake
        : kind === "consultant"
          ? IdCard
          : UserRound;
  const customerNames = personCustomerNames(person);
  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={customerNames ? `${label}: ${customerNames}` : label}
    >
      <Icon className={`h-4 w-4 shrink-0 ${TYPE_ICON_CLASS[kind]}`} aria-hidden />
      {kind === "customer"
        ? person.customers.map((customer) => (
            <CustomerFavicon
              key={customer.id}
              name={customer.name}
              url={customer.url}
              color={customer.color}
              size="xs"
            />
          ))
        : null}
      <span className="sr-only">
        {customerNames ? `${label}: ${customerNames}` : label}
      </span>
    </span>
  );
}

function PersonAppIcons({ appKeys }: { appKeys: AppKey[] }) {
  if (appKeys.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 text-text-secondary">
      {APP_KEYS.filter((key) => appKeys.includes(key)).map((key) => {
        const Icon = APP_ICONS[key];
        return (
          <span key={key} title={APP_LABELS[key]}>
            <Icon className="h-4 w-4" aria-hidden />
            <span className="sr-only">{APP_LABELS[key]}</span>
          </span>
        );
      })}
    </span>
  );
}

function UserFormDialog({
  open,
  onOpenChange,
  kind = "rove",
  initialName = "",
  initialEmail = "",
  consultantId = null,
  customers = [],
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind?: "rove" | "customer";
  initialName?: string;
  initialEmail?: string;
  consultantId?: string | null;
  customers?: PersonCustomerOption[];
  onCreated: (key: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [role, setRole] = useState<AppUserRole>("member");
  const [appKeys, setAppKeys] = useState<AppKey[]>(
    kind === "customer" ? [] : ["planner", "time_report", "insights"]
  );
  const [customerIds, setCustomerIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isCustomer = kind === "customer";
  const assignableCustomers = customers.filter((customer) => !customer.isInternal);

  useEffect(() => {
    if (!open) return;
    setAppKeys(isCustomer ? [] : ["planner", "time_report", "insights"]);
    setCustomerIds([]);
    setError(null);
  }, [open, isCustomer]);

  async function submit() {
    setError(null);
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (!isCustomer && appKeys.length === 0) {
      setError("Select at least one app");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createUserPerson(
        isCustomer
          ? {
              name,
              email,
              role: "customer",
              appKeys,
              customerIds,
            }
          : {
              name,
              email,
              role,
              appKeys,
              consultantId,
            }
      );
      onCreated(result.key);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        isCustomer
          ? "Add customer user"
          : consultantId
            ? "Create user account"
            : "Add user"
      }
    >
      <form
        className="modal-form-discreet mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Input
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          modalStyle
          autoFocus
        />
        <Input
          type="email"
          label="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          modalStyle
        />
        {isCustomer ? (
          <div className="space-y-4">
            <AppAccessList
              idPrefix="add-customer-user-apps"
              value={appKeys}
              onChange={setAppKeys}
              allowedKeys={CUSTOMER_APP_KEYS}
            />
            {assignableCustomers.length > 0 ? (
              <div>
                <p className="mb-2 block text-sm font-medium text-text-primary">
                  Customers
                </p>
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-form bg-bg-default p-3">
                  {assignableCustomers.map((customer) => (
                    <label
                      key={customer.id}
                      htmlFor={`add-customer-user-customer-${customer.id}`}
                      className="flex cursor-pointer items-center gap-2 text-sm text-text-primary"
                    >
                      <input
                        id={`add-customer-user-customer-${customer.id}`}
                        type="checkbox"
                        checked={customerIds.includes(customer.id)}
                        onChange={() =>
                          setCustomerIds((prev) =>
                            prev.includes(customer.id)
                              ? prev.filter((id) => id !== customer.id)
                              : [...prev, customer.id]
                          )
                        }
                        disabled={submitting}
                      />
                      <span>{customer.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-secondary">
                No customers available to assign yet.
              </p>
            )}
          </div>
        ) : (
          <>
            <Select
              label="System role"
              value={role}
              onValueChange={(value) => setRole(value as AppUserRole)}
              variant="modal"
              options={[
                { value: "member", label: "Member" },
                { value: "admin", label: "Admin" },
              ]}
            />
            <AppAccessList
              idPrefix="add-user-apps"
              value={appKeys}
              onChange={setAppKeys}
              allowedKeys={APP_KEYS}
            />
          </>
        )}
        {error ? (
          <p className="text-body-m text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting
              ? "Saving…"
              : isCustomer
                ? "Add customer user"
                : consultantId
                  ? "Create account"
                  : "Add user"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const USER_ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
] as const;

function AccountOverview({ person }: { person: PersonListItem }) {
  const router = useRouter();
  const [name, setName] = useState(person.name);
  const [email, setEmail] = useState(person.email ?? "");
  const [role, setRole] = useState<AppUserRole>(person.userRole ?? "member");
  const [editingField, setEditingField] = useState<
    "name" | "email" | "role" | null
  >(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [lastSavedField, setLastSavedField] = useState<
    "name" | "email" | "role" | null
  >(null);
  const originalEditValueRef = useRef("");
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  function startEdit(field: "name" | "email" | "role", value: string) {
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

  function markSaved(field: "name" | "email" | "role") {
    setLastSavedField(field);
    setShowSaved(true);
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    savedTimeoutRef.current = setTimeout(() => {
      savedTimeoutRef.current = null;
      setLastSavedField(null);
      setShowSaved(false);
    }, SAVED_DURATION_MS);
  }

  async function saveField(field: "name" | "email" | "role", value: string) {
    if (!person.appUserId) return;
    const trimmed = value.trim();
    if (field === "email" && !trimmed) {
      setError("Email is required");
      return;
    }

    setError(null);
    setEditingField(null);
    setSubmitting(true);
    try {
      if (field === "name") {
        await updateAppUser({ id: person.appUserId, name: trimmed || null });
        setName(trimmed || person.email || "");
      } else if (field === "email") {
        await updateAppUser({ id: person.appUserId, email: trimmed });
        setEmail(trimmed);
      } else {
        const nextRole = value as AppUserRole;
        await updateAppUser({ id: person.appUserId, role: nextRole });
        setRole(nextRole);
      }
      markSaved(field);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to update user");
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

  const inlineStatus = submitting
    ? "saving"
    : showSaved
      ? "saved"
      : error
        ? "error"
        : "idle";

  return (
    <div className="flex min-h-full flex-col">
      {error ? (
        <p className="px-6 pt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="px-6 pt-4 pb-6">
        <DrawerFieldRow label="Name">
          <InlineEditFieldContainer
            isEditing={editingField === "name"}
            onRequestClose={commitEdit}
            hideAccessory
            reserveStatusRow={false}
            showSavedIndicator={showSaved && lastSavedField === "name"}
            displayContent={
              <InlineEditTrigger
                boxed
                onClick={() => startEdit("name", name)}
                className={name ? "" : "text-text-tertiary"}
              >
                <span className="truncate text-sm text-text-primary">
                  {name || "—"}
                </span>
              </InlineEditTrigger>
            }
            editContent={
              <input
                type="text"
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
                className={editInputClass}
                autoFocus
              />
            }
            statusContent={
              <InlineEditStatus status={inlineStatus} message={error} />
            }
          />
        </DrawerFieldRow>

        <DrawerFieldRow label="Email">
          <InlineEditFieldContainer
            isEditing={editingField === "email"}
            onRequestClose={commitEdit}
            hideAccessory
            reserveStatusRow={false}
            showSavedIndicator={showSaved && lastSavedField === "email"}
            displayContent={
              <InlineEditTrigger
                boxed
                onClick={() => startEdit("email", email)}
                className={email ? "" : "text-text-tertiary"}
              >
                <span className="truncate text-sm text-text-link">
                  {email || "—"}
                </span>
              </InlineEditTrigger>
            }
            editContent={
              <input
                type="email"
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
                className={editInputClass}
                autoFocus
              />
            }
            statusContent={
              <InlineEditStatus status={inlineStatus} message={error} />
            }
          />
        </DrawerFieldRow>

        <DrawerFieldRow label="System role">
          {person.userRole === "customer" ? (
            <span className="flex h-9 items-center text-sm text-text-primary">
              Customer user
            </span>
          ) : (
            <DrawerSelectField
              value={role}
              onValueChange={(value) => {
                if (!isInlineEditValueChanged(role, value)) return;
                void saveField("role", value);
              }}
              options={[...USER_ROLE_OPTIONS]}
            />
          )}
        </DrawerFieldRow>
      </div>
    </div>
  );
}

function PersonDangerZone({
  person,
  onCloseDrawer,
}: {
  person: PersonListItem;
  onCloseDrawer: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"login" | "consultant" | null>(null);
  const [confirm, setConfirm] = useState<"login" | "consultant" | null>(null);

  const canRemoveLogin = Boolean(person.appUserId);
  const canRemoveConsultant = Boolean(person.consultantId);

  async function removeLogin() {
    if (!person.appUserId) return;
    setError(null);
    setBusy("login");
    try {
      await removeAppUser(person.appUserId);
      setConfirm(null);
      if (person.consultantId) {
        router.push(personHref(`consultant-${person.consultantId}`));
        router.refresh();
      } else {
        onCloseDrawer();
        router.refresh();
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Failed to remove login"
      );
    } finally {
      setBusy(null);
    }
  }

  async function removeConsultant() {
    if (!person.consultantId) return;
    setError(null);
    setBusy("consultant");
    try {
      await deleteConsultantAction(person.consultantId);
      setConfirm(null);
      if (person.appUserId) {
        router.push(personHref(`user-${person.appUserId}`));
        router.refresh();
      } else {
        onCloseDrawer();
        router.refresh();
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Failed to remove consultant profile"
      );
    } finally {
      setBusy(null);
    }
  }

  if (!canRemoveLogin && !canRemoveConsultant) {
    return (
      <div className="px-6 py-6">
        <p className="text-sm text-text-secondary">
          No destructive actions available for this person.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8 px-6 py-6">
        <div>
          <h2 className="text-sm font-medium text-text-primary">Danger zone</h2>
          <p className="mt-1 text-sm text-text-secondary">
            These actions are permanent or hard to reverse. Use with care.
          </p>
        </div>

        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {canRemoveLogin ? (
          <div>
            <h3 className="text-sm font-medium text-text-primary">
              Remove login access
            </h3>
            <p className="mt-1 text-sm text-text-secondary">
              {person.consultantId
                ? "Removes the login account. The consultant profile and its history remain."
                : "Removes the login account. This cannot be undone."}
            </p>
            <Button
              type="button"
              variant="danger"
              className="mt-4"
              disabled={busy != null}
              onClick={() => setConfirm("login")}
            >
              Remove login
            </Button>
          </div>
        ) : null}

        {canRemoveConsultant ? (
          <div>
            <h3 className="text-sm font-medium text-text-primary">
              Remove consultant profile
            </h3>
            <p className="mt-1 text-sm text-text-secondary">
              {person.appUserId
                ? "Removes the consultant profile used for planning and time. The login account remains."
                : "Removes the consultant profile. This cannot be undone."}
            </p>
            <Button
              type="button"
              variant="danger"
              className="mt-4"
              disabled={busy != null}
              onClick={() => setConfirm("consultant")}
            >
              Remove profile
            </Button>
          </div>
        ) : null}
      </div>

      <ConfirmModal
        isOpen={confirm === "login"}
        title="Remove login access"
        message={
          person.consultantId
            ? "Remove login access? The consultant profile and its history will remain."
            : "Remove login access? This cannot be undone."
        }
        confirmLabel={busy === "login" ? "Removing…" : "Remove login"}
        variant="danger"
        onClose={() => {
          if (busy) return;
          setConfirm(null);
        }}
        onConfirm={() => void removeLogin()}
      />

      <ConfirmModal
        isOpen={confirm === "consultant"}
        title="Remove consultant profile"
        message={
          person.appUserId
            ? "Remove this consultant profile? The login account will remain."
            : `Remove ${person.name}'s consultant profile? This cannot be undone.`
        }
        confirmLabel={busy === "consultant" ? "Removing…" : "Remove profile"}
        variant="danger"
        onClose={() => {
          if (busy) return;
          setConfirm(null);
        }}
        onConfirm={() => void removeConsultant()}
      />
    </>
  );
}

function AppAccessForm({ person }: { person: PersonListItem }) {
  const router = useRouter();
  const [appKeys, setAppKeys] = useState<AppKey[]>(person.appKeys);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCustomer = person.userRole === "customer";
  const allowedKeys = isCustomer ? CUSTOMER_APP_KEYS : APP_KEYS;

  async function updateApps(next: AppKey[]) {
    if (!person.appUserId) return;
    const unique = [...new Set(next)];
    if (!isCustomer && unique.length === 0) {
      setError("A user must have access to at least one app");
      return;
    }
    const previous = appKeys;
    setAppKeys(unique);
    setError(null);
    setSaving(true);
    try {
      await setPersonApps(person.appUserId, unique);
      router.refresh();
    } catch (cause) {
      setAppKeys(previous);
      setError(
        cause instanceof Error ? cause.message : "Failed to update app access"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-6 py-6">
      <h3 className="text-heading-m text-text-primary">Apps</h3>
      <p className="mt-1 text-body-m text-text-secondary">
        {isCustomer
          ? "Customer users can be granted Rove Work. Other apps stay unavailable."
          : "Manage which Rove applications this user can open."}
      </p>
      <div className="mt-6">
        <AppAccessList
          idPrefix={`person-apps-${person.appUserId ?? "none"}`}
          value={appKeys}
          onChange={(next) => void updateApps(next)}
          allowedKeys={allowedKeys}
          disabled={saving}
        />
      </div>
      {error ? (
        <p className="mt-4 text-body-m text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function EmptyConsultantProfile({
  person,
  roles,
  calendars,
}: {
  person: PersonListItem;
  roles: { id: string; name: string }[];
  calendars: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [calendarId, setCalendarId] = useState(calendars[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!person.appUserId) return;
    setError(null);
    if (!roleId || !calendarId) {
      setError("Configure at least one role and calendar first");
      return;
    }
    setSubmitting(true);
    try {
      await createConsultantProfileForUser({
        appUserId: person.appUserId,
        roleId,
        calendarId,
      });
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Failed to create consultant profile"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-6 py-6">
      <h3 className="text-heading-m text-text-primary">Consultant profile</h3>
      <p className="mt-1 text-body-m text-text-secondary">
        Create a consultant profile to make this user available for planning
        and time reporting.
      </p>
      <div className="mt-4 space-y-4">
        <Select
          label="Default role"
          value={roleId}
          onValueChange={setRoleId}
          options={roles.map((role) => ({ value: role.id, label: role.name }))}
        />
        <Select
          label="Calendar"
          value={calendarId}
          onValueChange={setCalendarId}
          options={calendars.map((calendar) => ({
            value: calendar.id,
            label: calendar.name,
          }))}
        />
        {error ? (
          <p className="text-body-m text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="button" onClick={() => void create()} disabled={submitting}>
          {submitting ? "Creating…" : "Create consultant profile"}
        </Button>
      </div>
    </div>
  );
}

function PersonConsultantSection({
  person,
  roles,
  calendars,
}: {
  person: PersonListItem;
  roles: { id: string; name: string }[];
  calendars: { id: string; name: string }[];
}) {
  if (person.userRole === "customer") return null;
  if (person.consultant) {
    return (
      <ConsultantDetailClient
        key={person.consultant.id}
        consultant={person.consultant}
        isAdmin
        embedded
        hideIdentityFields={Boolean(person.appUserId)}
        afterDeleteHref={
          person.appUserId ? personHref(person.key) : ROUTES.people
        }
        hideDelete
      />
    );
  }
  if (!person.appUserId) return null;
  return (
    <EmptyConsultantProfile
      person={person}
      roles={roles}
      calendars={calendars}
    />
  );
}

export function PeoplePageClient({
  people,
  roles,
  calendars,
  customers,
  error,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const routeKey = useMemo(() => {
    const prefix = `${ROUTES.people}/`;
    if (!pathname.startsWith(prefix)) return null;
    const value = pathname.slice(prefix.length);
    return value && !value.includes("/") ? value : null;
  }, [pathname]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PeopleFilter>("all");
  const [teamFilterId, setTeamFilterId] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [chooseTypeOpen, setChooseTypeOpen] = useState(false);
  const [userForm, setUserForm] = useState<{
    open: boolean;
    kind: "rove" | "customer";
    name: string;
    email: string;
    consultantId: string | null;
  }>({ open: false, kind: "rove", name: "", email: "", consultantId: null });
  const [consultantFormOpen, setConsultantFormOpen] = useState(false);

  const selected = routeKey
    ? people.find((person) => person.key === routeKey) ?? null
    : null;

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = people.filter((person) => {
      if (filter !== "all" && personKind(person) !== filter) {
        return false;
      }
      if (teamFilterId && person.consultant?.team_id !== teamFilterId) {
        return false;
      }
      if (!query) return true;
      return (
        person.name.toLowerCase().includes(query) ||
        (person.email ?? "").toLowerCase().includes(query) ||
        personTeamName(person).toLowerCase().includes(query) ||
        personType(person).toLowerCase().includes(query) ||
        personCustomerNames(person).toLowerCase().includes(query)
      );
    });
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "capacity" || sortKey === "overhead") {
        const field =
          sortKey === "capacity" ? "workPercentage" : "overheadPercentage";
        const left = a.consultant?.[field] ?? -1;
        const right = b.consultant?.[field] ?? -1;
        return direction * (left - right) || compareTextSv(a.name, b.name);
      }
      const left =
        sortKey === "team"
          ? personTeamName(a)
          : sortKey === "type"
            ? personType(a)
            : sortKey === "apps"
              ? a.appKeys.map((key) => APP_LABELS[key]).join(", ")
              : a.name;
      const right =
        sortKey === "team"
          ? personTeamName(b)
          : sortKey === "type"
            ? personType(b)
            : sortKey === "apps"
              ? b.appKeys.map((key) => APP_LABELS[key]).join(", ")
              : b.name;
      return (
        direction * compareTextSv(left, right) || compareTextSv(a.name, b.name)
      );
    });
  }, [filter, people, search, sortDirection, sortKey, teamFilterId]);

  const columns: DataTableColumn<PersonListItem>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      width: "20rem",
      cell: (person) => (
        <span className="flex min-w-0 items-center gap-2">
          <InitialsAvatar
            name={person.name}
            initials={initials(person.name)}
            size="sm"
          />
          <span className="truncate">{person.name}</span>
        </span>
      ),
    },
    {
      id: "type",
      header: "Type",
      sortable: true,
      width: "5.5rem",
      cell: (person) => <PersonTypeCell person={person} />,
    },
    {
      id: "team",
      header: "Team",
      sortable: true,
      secondary: true,
      width: "10rem",
      cell: (person) => personTeamName(person) || null,
    },
    {
      id: "apps",
      header: "Apps",
      sortable: true,
      secondary: true,
      width: "7rem",
      cell: (person) => <PersonAppIcons appKeys={person.appKeys} />,
    },
    {
      id: "capacity",
      header: "Capacity",
      sortable: true,
      width: "12rem",
      cell: (person) =>
        person.consultant ? (
          <CapacityBar value={person.consultant.workPercentage} />
        ) : null,
    },
    {
      id: "overhead",
      header: "Overhead",
      sortable: true,
      width: "12rem",
      cell: (person) =>
        person.consultant ? (
          <CapacityBar value={person.consultant.overheadPercentage} />
        ) : null,
    },
    {
      id: "spacer",
      header: "",
      cell: () => null,
    },
  ];

  const typeFilterOptions = [
    { value: "all", label: "All types" },
    { value: "consultant", label: "Consultant" },
    { value: "subcontractor", label: "Subcontractor" },
    { value: "customer", label: "Customer" },
  ];

  const teamFilterOptions = useMemo(() => {
    const teams = new Map<string, string>();
    for (const person of people) {
      const teamId = person.consultant?.team_id;
      const teamName = person.consultant?.teamName;
      if (!teamId || !teamName) continue;
      teams.set(teamId, teamName.replace(/^Team\s+/i, ""));
    }
    return [
      { value: "", label: "All teams" },
      ...[...teams.entries()]
        .sort(([, a], [, b]) => compareTextSv(a, b))
        .map(([id, name]) => ({ value: id, label: name })),
    ];
  }, [people]);

  function handleSort(columnId: string) {
    const key = columnId as SortKey;
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  function closeDrawer() {
    router.push(ROUTES.people, { scroll: false });
  }

  return (
    <>
      <div className="flex flex-col gap-8">
        <PageHeader
          title="People"
          description="Manage user accounts, app access and consultant profiles."
        >
          <Button type="button" onClick={() => setChooseTypeOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Add person
          </Button>
        </PageHeader>

        {error ? (
          <p className="text-body-m text-danger" role="alert">
            Error: {error}
          </p>
        ) : null}

        {!error && people.length === 0 ? (
          <EmptyState
            title="No people yet"
            description="Add a user or a consultant to get started."
            actionLabel="Add person"
            onAction={() => setChooseTypeOpen(true)}
          />
        ) : null}

        {!error && people.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <Input
                  type="search"
                  placeholder="Search people…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-9"
                  aria-label="Search people"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  Filter
                </span>
                <Select
                  variant="filter"
                  value={filter}
                  onValueChange={(value) => setFilter(value as PeopleFilter)}
                  options={typeFilterOptions}
                  className="w-auto min-w-0"
                  triggerClassName="min-w-[160px]"
                />
                <Select
                  variant="filter"
                  value={teamFilterId}
                  onValueChange={setTeamFilterId}
                  options={teamFilterOptions}
                  className="w-auto min-w-0"
                  triggerClassName="min-w-[160px]"
                />
              </div>
            </div>
            {visible.length ? (
              <DataTable
                className="table-fixed"
                columns={columns}
                rows={visible}
                getRowId={(person) => person.key}
                onRowClick={(person) =>
                  router.push(personHref(person.key), { scroll: false })
                }
                selectedRowId={routeKey ?? undefined}
                sort={{
                  columnId: sortKey,
                  direction: sortDirection,
                  onSort: handleSort,
                }}
              />
            ) : (
              <p className="px-1 py-6 text-body-m text-text-secondary">
                No people match this filter.
              </p>
            )}
          </>
        ) : null}
      </div>

      <SideDrawer
        open={routeKey != null}
        onOpenChange={(open) => {
          if (!open) closeDrawer();
        }}
        title={selected?.name ?? "Person"}
        header={
          selected ? (
            <div className="flex items-start gap-3">
              <InitialsAvatar
                name={selected.name}
                initials={initials(selected.name)}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-heading-l text-text-primary">{selected.name}</p>
                  <Badge variant={selected.appUserId ? "active" : "muted"}>
                    {personType(selected)}
                  </Badge>
                </div>
                <p className="mt-1 text-body-s text-text-tertiary">
                  {selected.email ?? "No email"}
                </p>
              </div>
            </div>
          ) : undefined
        }
        bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      >
        {selected ? (
          <Tabs
            key={selected.key}
            defaultValue="overview"
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <TabsList className="shrink-0 overflow-x-auto border-border-default px-6 !gap-6">
              <TabsTrigger value="overview" className="px-1 !px-1">
                Overview
              </TabsTrigger>
              {selected.appUserId ? (
                <TabsTrigger value="apps" className="px-1 !px-1">
                  App access
                </TabsTrigger>
              ) : null}
              {selected.appUserId ? (
                <TabsTrigger value="mcp" className="px-1 !px-1">
                  MCP access
                </TabsTrigger>
              ) : null}
              {selected.userRole !== "customer" ? (
                <TabsTrigger value="consultant" className="px-1 !px-1">
                  Consultant profile
                </TabsTrigger>
              ) : null}
              {selected.userRole === "customer" || selected.consultantId ? (
                <TabsTrigger value="customers" className="px-1 !px-1">
                  Customers
                </TabsTrigger>
              ) : null}
              {selected.appUserId || selected.consultantId ? (
                <TabsTrigger value="danger" className="px-1 !px-1">
                  Danger
                </TabsTrigger>
              ) : null}
            </TabsList>
            <TabsContent
              value="overview"
              className="min-h-0 flex-1 overflow-y-auto data-[state=active]:flex data-[state=active]:flex-col"
            >
              {selected.appUserId ? (
                <AccountOverview key={selected.key} person={selected} />
              ) : (
                <div className="px-6 pt-4 pb-6">
                  <p className="text-body-m text-text-secondary">
                    This consultant does not have a login account.
                  </p>
                  <Button
                    type="button"
                    className="mt-5"
                    onClick={() =>
                      setUserForm({
                        open: true,
                        kind: "rove",
                        name: selected.name,
                        email: selected.email ?? "",
                        consultantId: selected.consultantId,
                      })
                    }
                  >
                    Create user account
                  </Button>
                </div>
              )}
            </TabsContent>
            {selected.appUserId ? (
              <TabsContent
                value="apps"
                className="min-h-0 flex-1 overflow-y-auto data-[state=active]:flex data-[state=active]:flex-col"
              >
                <AppAccessForm
                  key={`${selected.key}-${selected.appKeys.join("-")}`}
                  person={selected}
                />
              </TabsContent>
            ) : null}
            {selected.appUserId ? (
              <TabsContent
                value="mcp"
                className="min-h-0 flex-1 overflow-y-auto data-[state=active]:flex data-[state=active]:flex-col"
              >
                <PersonMcpAccessTab
                  key={`${selected.key}-${selected.appKeys.join("-")}-${selected.userRole}`}
                  appUserId={selected.appUserId}
                  isCustomer={selected.userRole === "customer"}
                />
              </TabsContent>
            ) : null}
            {selected.userRole !== "customer" ? (
              <TabsContent
                value="consultant"
                className="min-h-0 flex-1 overflow-y-auto data-[state=active]:flex data-[state=active]:flex-col"
              >
                <PersonConsultantSection
                  person={selected}
                  roles={roles}
                  calendars={calendars}
                />
              </TabsContent>
            ) : null}
            {selected.userRole === "customer" || selected.consultantId ? (
              <TabsContent
                value="customers"
                className="min-h-0 flex-1 overflow-y-auto data-[state=active]:flex data-[state=active]:flex-col"
              >
                <PersonCustomersTab
                  key={`${selected.key}-customers`}
                  person={selected}
                  customers={customers}
                />
              </TabsContent>
            ) : null}
            {selected.appUserId || selected.consultantId ? (
              <TabsContent
                value="danger"
                className="min-h-0 flex-1 overflow-y-auto data-[state=active]:flex data-[state=active]:flex-col"
              >
                <PersonDangerZone
                  key={`${selected.key}-danger`}
                  person={selected}
                  onCloseDrawer={closeDrawer}
                />
              </TabsContent>
            ) : null}
          </Tabs>
        ) : routeKey ? (
          <p className="px-6 py-4 text-body-m text-text-secondary">
            Person not found.
          </p>
        ) : null}
      </SideDrawer>

      <Dialog
        open={chooseTypeOpen}
        onOpenChange={setChooseTypeOpen}
        title="Add person"
      >
        <div className="mt-6 grid gap-3">
          <button
            type="button"
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-border-subtle p-4 text-left transition-colors hover:bg-interactive-secondary"
            onClick={() => {
              setChooseTypeOpen(false);
              setUserForm({
                open: true,
                kind: "rove",
                name: "",
                email: "",
                consultantId: null,
              });
            }}
          >
            <UserRound className="h-5 w-5 text-text-secondary" aria-hidden />
            <span>
              <span className="block text-label-l text-text-primary">User</span>
              <span className="block text-body-s text-text-secondary">
                Create a login and assign app access.
              </span>
            </span>
          </button>
          <button
            type="button"
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-border-subtle p-4 text-left transition-colors hover:bg-interactive-secondary"
            onClick={() => {
              setChooseTypeOpen(false);
              setUserForm({
                open: true,
                kind: "customer",
                name: "",
                email: "",
                consultantId: null,
              });
            }}
          >
            <Building2 className="h-5 w-5 text-text-secondary" aria-hidden />
            <span>
              <span className="block text-label-l text-text-primary">
                Customer user
              </span>
              <span className="block text-body-s text-text-secondary">
                A person at a customer company. No Rove app access.
              </span>
            </span>
          </button>
          <button
            type="button"
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-border-subtle p-4 text-left transition-colors hover:bg-interactive-secondary"
            onClick={() => {
              setChooseTypeOpen(false);
              setConsultantFormOpen(true);
            }}
          >
            <UserRound className="h-5 w-5 text-text-secondary" aria-hidden />
            <span>
              <span className="block text-label-l text-text-primary">
                Consultant without account
              </span>
              <span className="block text-body-s text-text-secondary">
                Add a person who can be planned but cannot log in.
              </span>
            </span>
          </button>
        </div>
      </Dialog>

      {userForm.open ? (
        <UserFormDialog
          key={`${userForm.kind}-${userForm.consultantId ?? "new"}-${userForm.email}`}
          open={userForm.open}
          onOpenChange={(open) =>
            setUserForm((current) => ({ ...current, open }))
          }
          kind={userForm.kind}
          initialName={userForm.name}
          initialEmail={userForm.email}
          consultantId={userForm.consultantId}
          customers={customers}
          onCreated={(key) => {
            router.refresh();
            router.push(personHref(key), { scroll: false });
          }}
        />
      ) : null}

      <AddConsultantModal
        isOpen={consultantFormOpen}
        onClose={() => setConsultantFormOpen(false)}
        onSuccess={() => router.refresh()}
      />
    </>
  );
}
