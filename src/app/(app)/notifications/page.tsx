import { auth } from "@/auth";
import { PageHeader } from "@/components/ui";
import { DashboardNotificationsPanel } from "@/components/DashboardNotificationsPanel";
import { NotificationPrefsPanel } from "@/components/NotificationPrefsPanel";
import { getNotificationsForCurrentUser } from "@/lib/userNotifications";
import { getNotificationPrefsForCurrentUser } from "@/lib/userNotificationPrefs";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await auth();
  const appUserId = session?.user?.appUserId;
  const [notifications, prefs] = await Promise.all([
    appUserId != null
      ? getNotificationsForCurrentUser(50)
      : Promise.resolve([]),
    getNotificationPrefsForCurrentUser(),
  ]);

  return (
    <div className="w-full max-w-2xl">
      <PageHeader title="Notifications" className="mb-4" />
      <NotificationPrefsPanel initialPrefs={prefs} />
      <DashboardNotificationsPanel notifications={notifications} />
    </div>
  );
}
