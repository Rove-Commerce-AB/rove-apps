import { redirect } from "next/navigation";
import { ROUTES, supportCustomerHref } from "@/lib/routes";
import { canSeeSupportOverview } from "@/lib/supportAccess";
import { requireSupportActor } from "@/lib/supportActor";
import { listSupportNavCustomers } from "@/lib/supportNav";

export const dynamic = "force-dynamic";

export default async function SupportIndexPage() {
  const actor = await requireSupportActor();
  if (canSeeSupportOverview(actor)) {
    redirect(ROUTES.supportOverview);
  }
  const nav = await listSupportNavCustomers(actor);
  if (nav[0]) {
    redirect(supportCustomerHref(nav[0].id));
  }
  redirect("/access-denied");
}
