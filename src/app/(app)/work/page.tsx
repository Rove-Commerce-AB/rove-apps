import { getCurrentAppUser } from "@/lib/appUsers";
import { canCreateWorkProject } from "@/lib/workAccess";
import { listWorkSelectorCustomers } from "@/lib/workBoards";
import { WorkSelectorPageClient } from "./WorkSelectorPageClient";

export const dynamic = "force-dynamic";

export default async function WorkPage() {
  const [customers, user] = await Promise.all([
    listWorkSelectorCustomers(),
    getCurrentAppUser(),
  ]);
  const canCreateProject = user
    ? canCreateWorkProject({ id: user.id, role: user.role })
    : false;

  return (
    <WorkSelectorPageClient
      customers={customers}
      canCreateProject={canCreateProject}
    />
  );
}
