import { redirect } from "next/navigation";
import { supportIncidentsHref } from "@/lib/routes";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ customerId: string }> };

/** Legacy /cases → flat /incidents */
export default async function SupportCasesRedirectPage({ params }: Props) {
  const { customerId } = await params;
  redirect(supportIncidentsHref(customerId));
}
