import { MonitorsPageClient } from "@/components/MonitorsPageClient";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import {
  getMonitorsForCustomer,
  getSlackNotifications,
} from "@/lib/monitors";
import { canManageMonitors } from "@/lib/supportAccess";
import {
  linkedSupportCustomerIdsForActor,
  requireSupportActor,
} from "@/lib/supportActor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ customerId: string }> };

export default async function SupportCustomerMonitorsPage({ params }: Props) {
  const { customerId } = await params;
  const actor = await requireSupportActor();
  const linked = await linkedSupportCustomerIdsForActor(actor);
  const canManage = canManageMonitors(actor, linked, customerId);

  const { rows: customers } = await cloudSqlPool.query<{ name: string }>(
    `SELECT name FROM customers WHERE id = $1`,
    [customerId]
  );
  const customerName = customers[0]?.name ?? "Customer";

  let monitors: Awaited<ReturnType<typeof getMonitorsForCustomer>> = [];
  let slackNotifications: Awaited<ReturnType<typeof getSlackNotifications>> =
    [];
  let loadError: string | undefined;
  try {
    [monitors, slackNotifications] = await Promise.all([
      getMonitorsForCustomer(customerId),
      canManage ? getSlackNotifications() : Promise.resolve([]),
    ]);
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Failed to load monitors";
  }

  return (
    <MonitorsPageClient
      monitors={monitors}
      customers={[{ id: customerId, name: customerName }]}
      slackNotifications={slackNotifications}
      fixedCustomerId={customerId}
      readOnly={!canManage}
      loadError={loadError}
      title="Monitors"
      description={
        canManage
          ? `HTTP monitors for ${customerName}.`
          : `Status for ${customerName}’s monitored URLs.`
      }
    />
  );
}
