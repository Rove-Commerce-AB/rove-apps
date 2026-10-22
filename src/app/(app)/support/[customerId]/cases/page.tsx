import { redirect } from "next/navigation";
import { SupportCasesClient } from "@/components/SupportCasesClient";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { supportCustomerMonitorsHref } from "@/lib/routes";
import { canUseSupportCases } from "@/lib/supportAccess";
import {
  linkedSupportCustomerIdsForActor,
  requireSupportActor,
} from "@/lib/supportActor";
import { listSupportCases } from "@/lib/supportCases";
import { customerHasActiveSupportContract } from "@/lib/supportContractsQueries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ customerId: string }> };

export default async function SupportCasesPage({ params }: Props) {
  const { customerId } = await params;
  const actor = await requireSupportActor();
  const linked = await linkedSupportCustomerIdsForActor(actor);
  const hasContract = await customerHasActiveSupportContract(customerId);
  if (!canUseSupportCases(actor, linked, customerId, hasContract)) {
    redirect(supportCustomerMonitorsHref(customerId));
  }

  const { rows: customers } = await cloudSqlPool.query<{ name: string }>(
    `SELECT name FROM customers WHERE id = $1`,
    [customerId]
  );

  let cases: Awaited<ReturnType<typeof listSupportCases>> = [];
  let loadError: string | undefined;
  try {
    cases = await listSupportCases(customerId);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Failed to load cases";
  }

  return (
    <SupportCasesClient
      customerId={customerId}
      customerName={customers[0]?.name}
      cases={cases}
      loadError={loadError}
    />
  );
}
