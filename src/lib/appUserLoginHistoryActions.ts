"use server";

import {
  getAppUserLastLoginAtForAdmin,
  listAppUserLoginEventsForAdmin,
  type AppUserLoginEvent,
} from "@/lib/appUserLoginEvents";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { assertAdmin } from "@/lib/accessGuards";

export type CustomerLoginHistoryResult =
  | {
      ok: true;
      lastLoginAt: string | null;
      events: AppUserLoginEvent[];
    }
  | { ok: false; error: string };

export async function getCustomerLoginHistoryAction(
  appUserId: string
): Promise<CustomerLoginHistoryResult> {
  try {
    await assertAdmin();
    const { rows } = await cloudSqlPool.query<{ role: string }>(
      `SELECT role FROM app_users WHERE id = $1`,
      [appUserId]
    );
    if (!rows[0]) {
      return { ok: false, error: "User not found" };
    }
    if (rows[0].role !== "customer") {
      return { ok: false, error: "Login history is only available for customer users" };
    }
    const [lastLoginAt, events] = await Promise.all([
      getAppUserLastLoginAtForAdmin(appUserId),
      listAppUserLoginEventsForAdmin(appUserId, 50),
    ]);
    return { ok: true, lastLoginAt, events };
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof Error ? cause.message : "Failed to load login history",
    };
  }
}
