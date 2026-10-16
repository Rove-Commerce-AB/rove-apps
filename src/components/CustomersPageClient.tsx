"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { AddCustomerModal } from "@/components/AddCustomerModal";
import { CustomerDrawerContent } from "@/components/CustomerDrawerContent";
import { CustomerFavicon } from "@/components/CustomerFavicon";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  Select,
  SideDrawer,
  type DataTableColumn,
} from "@/components/ui";
import type {
  CustomerConsultant,
  CustomerConsultantsByCustomerId,
} from "@/lib/customerConsultantsQueries";
import type {
  CustomerAppUser,
  CustomerAppUsersByCustomerId,
} from "@/lib/customerAppUsersQueries";
import { ROUTES, customerHref } from "@/lib/routes";
import { compareTextSv } from "@/lib/sort";
import type { CustomerWithDetails } from "@/types";

type SortKey =
  | "name"
  | "accountManager"
  | "subscriptionId"
  | "litiumVersion"
  | "activeProjects";
type SortDirection = "asc" | "desc";

function sortCustomers(
  list: CustomerWithDetails[],
  sortKey: SortKey,
  sortDirection: SortDirection
): CustomerWithDetails[] {
  const direction = sortDirection === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    switch (sortKey) {
      case "accountManager":
        return (
          direction *
            compareTextSv(
              a.accountManagerName ?? "",
              b.accountManagerName ?? ""
            ) || compareTextSv(a.name, b.name)
        );
      case "subscriptionId":
        return (
          direction *
            compareTextSv(a.subscriptionId ?? "", b.subscriptionId ?? "") ||
          compareTextSv(a.name, b.name)
        );
      case "litiumVersion":
        return (
          direction *
            compareTextSv(a.litiumVersion ?? "", b.litiumVersion ?? "") ||
          compareTextSv(a.name, b.name)
        );
      case "activeProjects":
        return (
          direction * (a.activeProjectCount - b.activeProjectCount) ||
          compareTextSv(a.name, b.name)
        );
      default:
        return direction * compareTextSv(a.name, b.name);
    }
  });
}

type Props = {
  customers: CustomerWithDetails[];
  consultantsByCustomer: CustomerConsultantsByCustomerId;
  usersByCustomer: CustomerAppUsersByCustomerId;
  allConsultants: { id: string; name: string }[];
  allCustomerUsers: CustomerAppUser[];
  error: string | null;
  isAdmin?: boolean;
};

function CustomerAvatar({
  customer,
  size = "sm",
}: {
  customer: CustomerWithDetails;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "md" ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs";

  if (customer.logoUrl) {
    return (
      <span
        className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-bg-default`}
      >
        {/* Customer logos are user-provided remote URLs without a shared image loader. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={customer.logoUrl}
          alt=""
          className="h-full w-full object-contain p-1"
        />
      </span>
    );
  }

  return (
    <span
      className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full font-semibold text-white`}
      style={{ backgroundColor: customer.color }}
      aria-hidden
    >
      {customer.initials}
    </span>
  );
}

export function CustomersPageClient({
  customers,
  consultantsByCustomer = {},
  usersByCustomer = {},
  allConsultants = [],
  allCustomerUsers = [],
  error,
  isAdmin = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const routeId = useMemo(() => {
    const prefix = `${ROUTES.customers}/`;
    if (!pathname.startsWith(prefix)) return null;
    const rest = pathname.slice(prefix.length);
    if (!rest || rest.includes("/")) return null;
    return rest;
  }, [pathname]);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [accountManagerFilterId, setAccountManagerFilterId] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("asc");
  const [showInactive, setShowInactive] = useState(false);

  const matchingCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return customers.filter((customer) => {
      if (
        accountManagerFilterId &&
        customer.accountManagerId !== accountManagerFilterId
      ) {
        return false;
      }
      if (!query) return true;
      return (
        customer.name.toLowerCase().includes(query) ||
        (customer.accountManagerName ?? "").toLowerCase().includes(query) ||
        (customer.contactName ?? "").toLowerCase().includes(query) ||
        (customer.contactEmail ?? "").toLowerCase().includes(query) ||
        (customer.subscriptionId ?? "").toLowerCase().includes(query) ||
        (customer.litiumVersion ?? "").toLowerCase().includes(query)
      );
    });
  }, [accountManagerFilterId, customers, search]);

  const activeCustomers = useMemo(
    () =>
      sortCustomers(
        matchingCustomers.filter((customer) => customer.isActive),
        sortKey,
        sortDirection
      ),
    [matchingCustomers, sortDirection, sortKey]
  );
  const inactiveCustomers = useMemo(
    () =>
      sortCustomers(
        matchingCustomers.filter((customer) => !customer.isActive),
        sortKey,
        sortDirection
      ),
    [matchingCustomers, sortDirection, sortKey]
  );
  const tableRows = showInactive
    ? [...activeCustomers, ...inactiveCustomers]
    : activeCustomers;

  const selectedCustomer =
    routeId == null
      ? null
      : customers.find((customer) => customer.id === routeId) ?? null;
  const assignedConsultants: CustomerConsultant[] =
    selectedCustomer == null
      ? []
      : consultantsByCustomer?.[selectedCustomer.id] ?? [];
  const assignedUsers: CustomerAppUser[] =
    selectedCustomer == null
      ? []
      : usersByCustomer?.[selectedCustomer.id] ?? [];

  const columns: DataTableColumn<CustomerWithDetails>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      width: "20rem",
      cell: (customer) => (
        <span className="flex min-w-0 items-center gap-2">
          <CustomerFavicon
            name={customer.name}
            url={customer.url}
            color={customer.color}
          />
          <span className="truncate">{customer.name}</span>
        </span>
      ),
    },
    {
      id: "accountManager",
      header: "Account manager",
      sortable: true,
      secondary: true,
      width: "12rem",
      cell: (customer) => customer.accountManagerName || null,
    },
    {
      id: "subscriptionId",
      header: "Subscription ID",
      sortable: true,
      secondary: true,
      width: "9rem",
      cell: (customer) =>
        customer.subscriptionId ? (
          <span className="tabular-nums">{customer.subscriptionId}</span>
        ) : null,
    },
    {
      id: "litiumVersion",
      header: "Litium version",
      sortable: true,
      secondary: true,
      width: "9rem",
      cell: (customer) => customer.litiumVersion || null,
    },
    {
      id: "activeProjects",
      header: "Active projects",
      sortable: true,
      align: "right",
      width: "9rem",
      cell: (customer) => (
        <span className="tabular-nums">{customer.activeProjectCount}</span>
      ),
    },
    {
      id: "spacer",
      header: "",
      cell: () => null,
    },
  ];

  function handleSort(columnId: string) {
    const key = columnId as SortKey;
    if (sortKey === key) {
      setSortDirection((direction) =>
        direction === "asc" ? "desc" : "asc"
      );
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  }

  const accountManagerOptions = useMemo(() => {
    const accountManagers = new Map<string, string>();
    for (const customer of customers) {
      if (!customer.isActive) continue;
      if (!customer.accountManagerId || !customer.accountManagerName) continue;
      accountManagers.set(
        customer.accountManagerId,
        customer.accountManagerName
      );
    }
    return [
      { value: "", label: "All account managers" },
      ...[...accountManagers.entries()]
        .sort(([, a], [, b]) => compareTextSv(a, b))
        .map(([id, name]) => ({ value: id, label: name })),
    ];
  }, [customers]);

  function openCustomer(id: string) {
    router.push(customerHref(id), { scroll: false });
  }

  function closeDrawer() {
    router.push(ROUTES.customers, { scroll: false });
  }

  return (
    <>
      <AddCustomerModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => router.refresh()}
      />

      <div className="flex flex-col gap-8">
        <PageHeader
          title="Customers"
          description="Manage customer organizations, projects and assignments."
        >
          <Button
            type="button"
            variant="primary"
            onClick={() => setAddModalOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add customer
          </Button>
        </PageHeader>

        {error ? (
          <p className="text-sm text-danger" role="alert">
            Error: {error}
          </p>
        ) : null}

        {!error && customers.length === 0 ? (
          <EmptyState
            title="No customers yet"
            description="Add your first customer to start creating projects and managing rates."
            actionLabel="Add customer"
            onAction={() => setAddModalOpen(true)}
          />
        ) : null}

        {!error && customers.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <Input
                  type="search"
                  placeholder="Search customers…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search customers"
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  Filter
                </span>
                <Select
                  variant="filter"
                  value={accountManagerFilterId}
                  onValueChange={setAccountManagerFilterId}
                  options={accountManagerOptions}
                  className="w-auto min-w-0"
                  triggerClassName="min-w-[180px]"
                />
              </div>
            </div>

            {matchingCustomers.length === 0 ? (
              <p className="px-1 py-6 text-sm text-text-secondary">
                No customers match this filter.
              </p>
            ) : (
              <DataTable
                className="table-fixed"
                columns={columns}
                rows={tableRows}
                getRowId={(customer) => customer.id}
                onRowClick={(customer) => openCustomer(customer.id)}
                selectedRowId={routeId ?? undefined}
                getRowClassName={(customer) =>
                  customer.isActive ? undefined : "opacity-70"
                }
                sort={{
                  columnId: sortKey,
                  direction: sortDirection,
                  onSort: handleSort,
                }}
                footer={
                  inactiveCustomers.length > 0 ? (
                    <div className="border-t border-border-default px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setShowInactive((show) => !show)}
                        className="w-full rounded-md py-2 text-center text-sm font-medium text-text-primary opacity-70 transition-colors hover:bg-interactive-secondary hover:opacity-100"
                        aria-label={
                          showInactive
                            ? "Hide inactive customers"
                            : "Show inactive customers"
                        }
                      >
                        {showInactive
                          ? "Hide inactive"
                          : `Show inactive (${inactiveCustomers.length})`}
                      </button>
                    </div>
                  ) : undefined
                }
              />
            )}
          </>
        ) : null}
      </div>

      <SideDrawer
        open={routeId != null}
        onOpenChange={(open) => {
          if (!open) closeDrawer();
        }}
        title={selectedCustomer?.name ?? "Customer"}
        header={
          selectedCustomer ? (
            <div className="flex items-start gap-3">
              <CustomerAvatar customer={selectedCustomer} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <p className="text-heading-l leading-tight text-text-primary">
                    {selectedCustomer.name}
                  </p>
                  <Badge
                    variant={
                      selectedCustomer.isActive ? "active" : "inactive"
                    }
                    className="px-2 py-0.5"
                  >
                    {selectedCustomer.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-text-tertiary">
                  {selectedCustomer.isInternal
                    ? "Internal customer"
                    : "Standard customer"}
                </p>
              </div>
            </div>
          ) : undefined
        }
        bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      >
        {selectedCustomer ? (
          <CustomerDrawerContent
            key={selectedCustomer.id}
            customer={selectedCustomer}
            assignedConsultants={assignedConsultants}
            assignedUsers={assignedUsers}
            allConsultants={allConsultants}
            allCustomerUsers={allCustomerUsers}
            isAdmin={isAdmin}
          />
        ) : routeId != null ? (
          <p className="px-6 py-4 text-sm text-text-secondary">
            Customer not found.
          </p>
        ) : null}
      </SideDrawer>
    </>
  );
}
