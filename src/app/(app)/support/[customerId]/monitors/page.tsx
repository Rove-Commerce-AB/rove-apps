import { redirect } from "next/navigation";
import { supportMonitorsHref } from "@/lib/routes";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ customerId: string }> };

/** Legacy customer-scoped URL → flat Monitors with filter. */
export default async function SupportCustomerMonitorsRedirect({
  params,
}: Props) {
  const { customerId } = await params;
  redirect(supportMonitorsHref(customerId));
}
