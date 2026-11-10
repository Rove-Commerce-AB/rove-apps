import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";
import { canSeeSupportOverview } from "@/lib/supportAccess";
import { requireSupportActor } from "@/lib/supportActor";
import { listSupportFilterCustomers } from "@/lib/supportCustomerFilter";

export const dynamic = "force-dynamic";

export default async function SupportIndexPage() {
  const actor = await requireSupportActor();
  if (canSeeSupportOverview(actor)) {
    redirect(ROUTES.supportOverview);
  }
  const customers = await listSupportFilterCustomers(actor);
  if (customers.length > 0) {
    redirect(ROUTES.supportMonitors);
  }
  redirect("/access-denied");
}
