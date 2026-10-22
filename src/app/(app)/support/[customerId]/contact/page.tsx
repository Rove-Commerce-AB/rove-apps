import { redirect } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import {
  supportCustomerMonitorsHref,
} from "@/lib/routes";
import { canViewSupportContact } from "@/lib/supportAccess";
import {
  linkedSupportCustomerIdsForActor,
  requireSupportActor,
} from "@/lib/supportActor";
import { getSupportContractForCustomer } from "@/lib/supportContracts";
import { customerHasActiveSupportContract } from "@/lib/supportContractsQueries";
import { SUPPORT_CONTACT_NAV_ENABLED } from "@/lib/supportFeatures";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ customerId: string }> };

export default async function SupportContactPage({ params }: Props) {
  const { customerId } = await params;

  // Hidden for now — keep route for later; send people to Monitors.
  if (!SUPPORT_CONTACT_NAV_ENABLED) {
    redirect(supportCustomerMonitorsHref(customerId));
  }

  const actor = await requireSupportActor();
  const linked = await linkedSupportCustomerIdsForActor(actor);
  const hasContract = await customerHasActiveSupportContract(customerId);
  if (!canViewSupportContact(actor, linked, customerId, hasContract)) {
    redirect(supportCustomerMonitorsHref(customerId));
  }

  const [{ rows: customers }, contract] = await Promise.all([
    cloudSqlPool.query<{ name: string }>(
      `SELECT name FROM customers WHERE id = $1`,
      [customerId]
    ),
    getSupportContractForCustomer(customerId),
  ]);
  const customerName = customers[0]?.name ?? "this customer";
  const body = contract?.contactMarkdown?.trim();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contact"
        description={`How to reach Rove support for ${customerName}.`}
      />
      <Panel className="p-6">
        {body ? (
          <pre className="whitespace-pre-wrap font-sans text-sm text-text-primary">
            {body}
          </pre>
        ) : (
          <p className="text-sm text-text-secondary">
            No contact details yet. Staff can add them under Settings → Customers
            → Support.
          </p>
        )}
      </Panel>
    </div>
  );
}
