import { redirect } from "next/navigation";
import { supportIncidentsHref } from "@/lib/routes";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ customerId: string }> };

/** Legacy customer-scoped URL → flat Incidents with filter. */
export default async function SupportCustomerIncidentsRedirect({
  params,
}: Props) {
  const { customerId } = await params;
  redirect(supportIncidentsHref(customerId));
}
