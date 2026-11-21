"use server";

import {
  getUnreadNotificationsForCurrentUser,
  markAllUserNotificationsRead,
  markUserNotificationRead,
  markUserNotificationUnread,
} from "@/lib/userNotifications";
import type { UserNotificationRow } from "@/lib/userNotificationKinds";
import {
  getNotificationPrefsForCurrentUser,
  saveNotificationPrefsForCurrentUser,
  type UserNotificationPrefs,
} from "@/lib/userNotificationPrefs";

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

export async function getNotificationPrefsAction(): Promise<UserNotificationPrefs> {
  return getNotificationPrefsForCurrentUser();
}

export async function saveNotificationPrefsAction(
  prefs: Partial<UserNotificationPrefs>
): Promise<
  { ok: true; prefs: UserNotificationPrefs } | { ok: false; error: string }
> {
  try {
    const saved = await saveNotificationPrefsForCurrentUser(prefs);
    return { ok: true, prefs: saved };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save preferences",
    };
  }
}
