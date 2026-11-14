import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MonitorsPageClient } from "@/components/MonitorsPageClient";
import { CUSTOMER_FILTER_QUERY_KEY } from "@/lib/customerFilter";
import {
  getMonitorsForCustomer,
  getMonitorsForCustomers,
  getMonitorsOverview,
  getSlackNotifications,
} from "@/lib/monitors";
import { ROUTES } from "@/lib/routes";
import { canSeeSupportOverview } from "@/lib/supportAccess";
import { requireSupportActor } from "@/lib/supportActor";
import {
  canManageSupportMonitorsPage,
  listSupportFilterCustomers,
  resolveSupportCustomerFilter,
  SUPPORT_CUSTOMER_FILTER_COOKIE,
} from "@/lib/supportCustomerFilter";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ customer?: string }>;
};

export default async function SupportMonitorsPage({ searchParams }: Props) {
  const actor = await requireSupportActor();
  const params = await searchParams;
  const cookieStore = await cookies();
  const customers = await listSupportFilterCustomers(actor);

  if (customers.length === 0) {
    redirect("/access-denied");
  }

  const selectedCustomerIds =
    actor.role === "customer" && customers.length === 1
      ? [customers[0].id]
      : resolveSupportCustomerFilter({
          queryValue: params.customer,
          cookieValue: cookieStore.get(SUPPORT_CUSTOMER_FILTER_COOKIE)?.value,
          customers,
        });

  const canManage = canManageSupportMonitorsPage(actor);
  const singleSelectedId =
    selectedCustomerIds.length === 1 ? selectedCustomerIds[0]! : null;
  const selectedCustomers = customers.filter((c) =>
    selectedCustomerIds.includes(c.id)
  );

  let monitors: Awaited<ReturnType<typeof getMonitorsOverview>> = [];
  let slackNotifications: Awaited<ReturnType<typeof getSlackNotifications>> =
    [];
  let loadError: string | undefined;
  try {
    const monitorsPromise =
      selectedCustomerIds.length === 1
        ? getMonitorsForCustomer(selectedCustomerIds[0]!)
        : selectedCustomerIds.length > 1
          ? getMonitorsForCustomers(selectedCustomerIds)
          : canSeeSupportOverview(actor)
            ? getMonitorsOverview()
            : getMonitorsForCustomers(customers.map((c) => c.id));

    [monitors, slackNotifications] = await Promise.all([
      monitorsPromise,
      canManage ? getSlackNotifications() : Promise.resolve([]),
    ]);
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Failed to load monitors";
  }

  const description =
    selectedCustomers.length === 1
      ? canManage
        ? `HTTP monitors for ${selectedCustomers[0]!.name}.`
        : `Status for ${selectedCustomers[0]!.name}’s monitored URLs.`
      : selectedCustomers.length > 1
        ? canManage
          ? `HTTP monitors for ${selectedCustomers.length} customers.`
          : `Status for ${selectedCustomers.length} customers’ monitored URLs.`
        : canManage
          ? "HTTP monitors across customers."
          : "Status for monitored URLs.";

  return (
    <MonitorsPageClient
      monitors={monitors}
      customers={customers.map((c) => ({ id: c.id, name: c.name }))}
      slackNotifications={slackNotifications}
      fixedCustomerId={singleSelectedId ?? undefined}
      readOnly={!canManage}
      loadError={loadError}
      title="Monitors"
      description={description}
      customerFilter={{
        customers,
        value: selectedCustomerIds,
        basePath: ROUTES.supportMonitors,
        cookieName: SUPPORT_CUSTOMER_FILTER_COOKIE,
        hideWhenSingle: actor.role === "customer",
        queryKey: CUSTOMER_FILTER_QUERY_KEY,
      }}
    />
  );
}
