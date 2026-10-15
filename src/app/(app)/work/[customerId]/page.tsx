import { notFound } from "next/navigation";
import { getCurrentAppUser } from "@/lib/appUsers";
import { canCreateWorkProject } from "@/lib/workAccess";
import {
  getWorkCustomerView,
  redirectIfLegacyWorkBoardUrl,
} from "@/lib/workBoards";
import { WorkCustomerPageClient } from "./WorkCustomerPageClient";

export const dynamic = "force-dynamic";

export default async function WorkCustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const [customer, user] = await Promise.all([
    getWorkCustomerView(customerId),
    getCurrentAppUser(),
  ]);
  if (customer) {
    const canCreateProject = user
      ? canCreateWorkProject({ id: user.id, role: user.role })
      : false;
    return (
      <WorkCustomerPageClient
        customer={customer}
        canCreateProject={canCreateProject}
      />
    );
  }
  await redirectIfLegacyWorkBoardUrl(customerId);
  notFound();
}
