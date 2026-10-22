import { Suspense } from "react";
import { Sidebar, SIDEBAR_COLLAPSED_COOKIE } from "@/components/Sidebar";
import { AppTopBar } from "@/components/AppTopBar";
import { FeatureRequestFab } from "@/components/FeatureRequestFab";
import { AppThemeAttr } from "@/components/AppThemeAttr";
import { WorkTrailProvider } from "@/components/WorkTrailContext";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { getCurrentAppUser } from "@/lib/appUsers";
import { getConsultantForCurrentUser } from "@/lib/consultants";
import {
  getCachedProjectManagerNavVisible,
  getCachedUnreadNotificationCount,
} from "@/lib/layoutShell";
import { listShortcutsForCurrentUser } from "@/lib/shortcuts";
import { listWorkNavCustomers } from "@/lib/workBoards";
import { getSupportActor } from "@/lib/supportActor";
import { listSupportNavCustomers } from "@/lib/supportNav";
import { cookies } from "next/headers";

/** Auth and app_users gatekeeping run in src/proxy.ts. */

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentAppUser();
  const isAdmin = user?.role === "admin";
  let canSeeTimeReportProjectManager = false;

  if (isAdmin) {
    canSeeTimeReportProjectManager = true;
  } else {
    try {
      const consultant = await getConsultantForCurrentUser();
      if (consultant?.id) {
        canSeeTimeReportProjectManager =
          await getCachedProjectManagerNavVisible(consultant.id);
      }
    } catch {
      // If the new column isn't present yet (or DB is in-flight), fail closed.
      canSeeTimeReportProjectManager = false;
    }
  }

  const unreadNotificationCount =
    user?.email != null
      ? await getCachedUnreadNotificationCount(user.email)
      : 0;
  const workNav =
    user?.appKeys.includes("work") ? await listWorkNavCustomers() : [];
  let supportNav: Awaited<ReturnType<typeof listSupportNavCustomers>> = [];
  if (user?.appKeys.includes("support")) {
    const supportActor = await getSupportActor();
    if (supportActor) {
      try {
        supportNav = await listSupportNavCustomers(supportActor);
      } catch {
        supportNav = [];
      }
    }
  }
  const shortcuts = await listShortcutsForCurrentUser();
  const sidebarCollapsed =
    (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1";

  return (
    <div className="flex h-full overflow-hidden">
      <AppThemeAttr />
      <ShortcutsProvider initialShortcuts={shortcuts}>
        <Sidebar
          isAdmin={isAdmin}
          canSeeTimeReportProjectManager={canSeeTimeReportProjectManager}
          isCustomerUser={user?.role === "customer"}
          appKeys={user?.appKeys ?? []}
          workNav={workNav}
          supportNav={supportNav}
          initialCollapsed={sidebarCollapsed}
        />
        <WorkTrailProvider>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Suspense fallback={<div className="h-[49px] shrink-0 border-b border-border-default bg-bg-default" />}>
              <AppTopBar unreadNotificationCount={unreadNotificationCount} />
            </Suspense>
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-surface-page p-(--space-32)">
              {children}
            </main>
          </div>
        </WorkTrailProvider>
      </ShortcutsProvider>
      <FeatureRequestFab />
    </div>
  );
}
