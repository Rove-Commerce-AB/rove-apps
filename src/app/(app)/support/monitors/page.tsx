import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CustomerFilter } from "@/components/CustomerFilter";
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

  const selectedCustomerId =
    actor.role === "customer" && customers.length === 1
      ? customers[0].id
      : resolveSupportCustomerFilter({
          queryValue: params.customer,
          cookieValue: cookieStore.get(SUPPORT_CUSTOMER_FILTER_COOKIE)?.value,
          customers,
        });

  const canManage = canManageSupportMonitorsPage(actor);
  const selectedCustomer = selectedCustomerId
    ? customers.find((c) => c.id === selectedCustomerId)
    : null;

  let monitors: Awaited<ReturnType<typeof getMonitorsOverview>> = [];
  let slackNotifications: Awaited<ReturnType<typeof getSlackNotifications>> =
    [];
  let loadError: string | undefined;
  try {
    const monitorsPromise = selectedCustomerId
      ? getMonitorsForCustomer(selectedCustomerId)
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

  const description = selectedCustomer
    ? canManage
      ? `HTTP monitors for ${selectedCustomer.name}.`
      : `Status for ${selectedCustomer.name}’s monitored URLs.`
    : canManage
      ? "HTTP monitors across customers."
      : "Status for monitored URLs.";

  return (
    <MonitorsPageClient
      monitors={monitors}
      customers={customers.map((c) => ({ id: c.id, name: c.name }))}
      slackNotifications={slackNotifications}
      fixedCustomerId={selectedCustomerId ?? undefined}
      readOnly={!canManage}
      loadError={loadError}
      title="Monitors"
      description={description}
      toolbar={
        <CustomerFilter
          customers={customers}
          value={selectedCustomerId}
          basePath={ROUTES.supportMonitors}
          cookieName={SUPPORT_CUSTOMER_FILTER_COOKIE}
          hideWhenSingle={actor.role === "customer"}
          queryKey={CUSTOMER_FILTER_QUERY_KEY}
        />
      }
    />
  );
}
