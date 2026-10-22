import { redirect } from "next/navigation";
import { SupportOverviewClient } from "@/components/SupportOverviewClient";
import {
  getMonitorCustomers,
  getMonitorsOverview,
  getSlackNotifications,
} from "@/lib/monitors";
import { canSeeSupportOverview } from "@/lib/supportAccess";
import { requireSupportActor } from "@/lib/supportActor";
import {
  listSupportInboxQueue,
  listSupportNewCases,
  listSupportRouteCustomers,
} from "@/lib/supportOverviewCases";

export const dynamic = "force-dynamic";

export default async function SupportOverviewPage() {
  const actor = await requireSupportActor();
  if (!canSeeSupportOverview(actor)) redirect("/access-denied");

  let monitors: Awaited<ReturnType<typeof getMonitorsOverview>> = [];
  let customers: Awaited<ReturnType<typeof getMonitorCustomers>> = [];
  let slackNotifications: Awaited<ReturnType<typeof getSlackNotifications>> =
    [];
  let inbox: Awaited<ReturnType<typeof listSupportInboxQueue>> = [];
  let newCases: Awaited<ReturnType<typeof listSupportNewCases>> = [];
  let routeCustomers: Awaited<ReturnType<typeof listSupportRouteCustomers>> =
    [];
  let loadError: string | undefined;
  try {
    [
      monitors,
      customers,
      slackNotifications,
      inbox,
      newCases,
      routeCustomers,
    ] = await Promise.all([
      getMonitorsOverview(),
      getMonitorCustomers(),
      getSlackNotifications(),
      listSupportInboxQueue(),
      listSupportNewCases(),
      listSupportRouteCustomers(),
    ]);
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Failed to load overview";
  }

  return (
    <SupportOverviewClient
      monitors={monitors}
      customers={customers}
      slackNotifications={slackNotifications}
      inbox={inbox}
      newCases={newCases}
      routeCustomers={routeCustomers}
      loadError={loadError}
    />
  );
}
