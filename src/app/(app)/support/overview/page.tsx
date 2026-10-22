import { redirect } from "next/navigation";
import { SupportOverviewClient } from "@/components/SupportOverviewClient";
import {
  getMonitorCustomers,
  getMonitorsOverview,
  getSlackNotifications,
} from "@/lib/monitors";
import { canSeeSupportOverview } from "@/lib/supportAccess";
import { requireSupportActor } from "@/lib/supportActor";

export const dynamic = "force-dynamic";

export default async function SupportOverviewPage() {
  const actor = await requireSupportActor();
  if (!canSeeSupportOverview(actor)) redirect("/access-denied");

  let monitors: Awaited<ReturnType<typeof getMonitorsOverview>> = [];
  let customers: Awaited<ReturnType<typeof getMonitorCustomers>> = [];
  let slackNotifications: Awaited<ReturnType<typeof getSlackNotifications>> =
    [];
  let loadError: string | undefined;
  try {
    [monitors, customers, slackNotifications] = await Promise.all([
      getMonitorsOverview(),
      getMonitorCustomers(),
      getSlackNotifications(),
    ]);
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Failed to load monitors";
  }

  return (
    <SupportOverviewClient
      monitors={monitors}
      customers={customers}
      slackNotifications={slackNotifications}
      loadError={loadError}
    />
  );
}
