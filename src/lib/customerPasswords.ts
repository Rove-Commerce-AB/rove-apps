"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/appUsers";
import { assertAdmin } from "@/lib/accessGuards";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import {
  generateTemporaryPassword,
  hashPassword,
  validatePasswordStrength,
} from "@/lib/passwords";
import { personHref, ROUTES } from "@/lib/routes";

export async function setCustomerTemporaryPassword(
  appUserId: string
): Promise<{ temporaryPassword: string }> {
  await assertAdmin();

  const { rows } = await cloudSqlPool.query<{ id: string; role: string }>(
    `SELECT id, role FROM app_users WHERE id = $1`,
    [appUserId]
  );
  const user = rows[0];
  if (!user) throw new Error("User not found");
  if (user.role !== "customer") {
    throw new Error("Temporary passwords are only for customer users");
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = hashPassword(temporaryPassword);
  await cloudSqlPool.query(
    `UPDATE app_users
     SET password_hash = $2,
         must_change_password = true,
         updated_at = now()
     WHERE id = $1`,
    [appUserId, passwordHash]
  );

  revalidatePath(ROUTES.people);
  revalidatePath(personHref(`user-${appUserId}`));
  return { temporaryPassword };
}

/** Sets a new password after forced first-login change (must_change_password). */
export async function changeOwnPassword(input: {
  newPassword: string;
}): Promise<{ ok: true; email: string }> {
  const sessionUser = await getCurrentAppUser();
  if (!sessionUser?.id || sessionUser.role !== "customer") {
    throw new Error("Only customer users change password this way");
  }

  const strengthError = validatePasswordStrength(input.newPassword);
  if (strengthError) throw new Error(strengthError);

  const { rows } = await cloudSqlPool.query<{
    email: string;
    password_hash: string | null;
    must_change_password: boolean;
  }>(
    `SELECT email, password_hash, must_change_password FROM app_users WHERE id = $1`,
    [sessionUser.id]
  );
  const row = rows[0];
  if (!row?.password_hash) {
    throw new Error("No password is set for this account");
  }
  if (!row.must_change_password) {
    throw new Error("Password change is not required for this account");
  }

  const passwordHash = hashPassword(input.newPassword);
  await cloudSqlPool.query(
    `UPDATE app_users
     SET password_hash = $2,
         must_change_password = false,
         updated_at = now()
     WHERE id = $1`,
    [sessionUser.id, passwordHash]
  );

  return { ok: true, email: row.email };
}
