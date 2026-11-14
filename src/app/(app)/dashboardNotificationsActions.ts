"use server";

import {
  getUnreadNotificationsForCurrentUser,
  markAllUserNotificationsRead,
  markUserNotificationRead,
  markUserNotificationUnread,
} from "@/lib/userNotifications";
import type { UserNotificationRow } from "@/lib/userNotificationKinds";

export async function markDashboardNotificationReadAction(
  notificationId: string
): Promise<void> {
  await markUserNotificationRead(notificationId);
}

export async function markDashboardNotificationUnreadAction(
  notificationId: string
): Promise<void> {
  await markUserNotificationUnread(notificationId);
}

export async function markAllDashboardNotificationsReadAction(): Promise<void> {
  await markAllUserNotificationsRead();
}

export async function getUnreadDashboardNotificationsAction(): Promise<
  UserNotificationRow[]
> {
  return getUnreadNotificationsForCurrentUser(30);
}
