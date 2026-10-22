import { notFound, redirect } from "next/navigation";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { canAccessSupportCustomer } from "@/lib/supportAccess";
import {
  linkedSupportCustomerIdsForActor,
  requireSupportActor,
} from "@/lib/supportActor";

export const dynamic = "force-dynamic";

type Props = {
  children: React.ReactNode;
  params: Promise<{ customerId: string }>;
};

export default async function SupportCustomerLayout({
  children,
  params,
}: Props) {
  const { customerId } = await params;
  const actor = await requireSupportActor();
  const linked = await linkedSupportCustomerIdsForActor(actor);
  if (!canAccessSupportCustomer(actor, linked, customerId)) {
    redirect("/access-denied");
  }

  const { rows } = await cloudSqlPool.query<{ id: string }>(
    `SELECT id FROM customers WHERE id = $1 AND is_active`,
    [customerId]
  );
  if (!rows[0]) notFound();

  return <div className="max-w-6xl space-y-6">{children}</div>;
}
