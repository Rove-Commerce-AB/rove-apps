import { redirect } from "next/navigation";
import { supportCustomerIncidentsHref } from "@/lib/routes";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ customerId: string }> };

/** Legacy /cases → /incidents */
export default async function SupportCasesRedirectPage({ params }: Props) {
  const { customerId } = await params;
  redirect(supportCustomerIncidentsHref(customerId));
}
