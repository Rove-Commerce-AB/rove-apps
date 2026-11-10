import { redirect } from "next/navigation";
import { SupportOverviewClient } from "@/components/SupportOverviewClient";
import { getMonitorsOverview } from "@/lib/monitors";
import { canSeeSupportOverview } from "@/lib/supportAccess";
import { requireSupportActor } from "@/lib/supportActor";
import {
  listSupportInboxQueue,
  listSupportNeedsReplyQueue,
  listSupportNewCases,
  listSupportRouteCustomers,
} from "@/lib/supportOverviewCases";

export const dynamic = "force-dynamic";

export default async function SupportOverviewPage() {
  const actor = await requireSupportActor();
  if (!canSeeSupportOverview(actor)) redirect("/access-denied");

  let monitors: Awaited<ReturnType<typeof getMonitorsOverview>> = [];
  let inbox: Awaited<ReturnType<typeof listSupportInboxQueue>> = [];
  let newCases: Awaited<ReturnType<typeof listSupportNewCases>> = [];
  let needsReply: Awaited<ReturnType<typeof listSupportNeedsReplyQueue>> = [];
  let routeCustomers: Awaited<ReturnType<typeof listSupportRouteCustomers>> =
    [];
  let loadError: string | undefined;
  try {
    [monitors, inbox, newCases, needsReply, routeCustomers] = await Promise.all(
      [
        getMonitorsOverview(),
        listSupportInboxQueue(),
        listSupportNewCases(),
        listSupportNeedsReplyQueue(),
        listSupportRouteCustomers(),
      ]
    );
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Failed to load overview";
  }

  return (
    <SupportOverviewClient
      monitors={monitors}
      inbox={inbox}
      newCases={newCases}
      needsReply={needsReply}
      routeCustomers={routeCustomers}
      loadError={loadError}
    />
  );
}
