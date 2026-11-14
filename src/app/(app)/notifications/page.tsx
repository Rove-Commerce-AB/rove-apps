import { auth } from "@/auth";
import { PageHeader } from "@/components/ui";
import { DashboardNotificationsPanel } from "@/components/DashboardNotificationsPanel";
import { getNotificationsForCurrentUser } from "@/lib/userNotifications";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await auth();
  const appUserId = session?.user?.appUserId;
  const notifications =
    appUserId != null ? await getNotificationsForCurrentUser(50) : [];

  return (
    <div className="w-full max-w-2xl">
      <PageHeader title="Notifications" className="mb-4" />
      <DashboardNotificationsPanel notifications={notifications} />
    </div>
  );
}
