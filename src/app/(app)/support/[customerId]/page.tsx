import { redirect } from "next/navigation";
import { supportCustomerMonitorsHref } from "@/lib/routes";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ customerId: string }> };

export default async function SupportCustomerIndexPage({ params }: Props) {
  const { customerId } = await params;
  redirect(supportCustomerMonitorsHref(customerId));
}
