"use server";

import { cache } from "react";
import { auth } from "@/auth";
import { cloudSqlPool, withCloudSqlTransaction } from "@/lib/cloudSqlPool";
import { revalidatePath, revalidateTag } from "next/cache";
import { ROUTES } from "@/lib/routes";
import {
  isRoveLoginRole,
  type AppKey,
  type AppUserRole as PeopleAppUserRole,
} from "@/lib/peopleTypes";

export type AppUser = {
  id: string;
  email: string;
  role: AppUserRole;
  name: string | null;
  created_at: string;
};

export type AppUserRole = PeopleAppUserRole;

export type CurrentAppUser = {
  id: string;
  email: string;
  role: AppUserRole;
  name: string | null;
  appKeys: AppKey[];
} | null;

export const getCurrentAppUser = cache(async (): Promise<CurrentAppUser> => {
  const session = await auth();
  if (!session?.user?.email) return null;

  return {
    id: session.user.appUserId,
    email: session.user.email,
    role: session.user.role as AppUserRole,
    name: session.user.name ?? null,
    appKeys: session.user.appKeys ?? [],
  };
});

export async function getAppUsersForAdmin(): Promise<AppUser[]> {
  const current = await getCurrentAppUser();
  if (!current || current.role !== "admin") return [];

  const { rows } = await cloudSqlPool.query<AppUser>(
    "SELECT id, email, role, name, created_at FROM app_users ORDER BY email"
  );
  return rows;
}

export async function addAppUser(formData: FormData) {
  const current = await getCurrentAppUser();
  if (!current || current.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const name = (formData.get("name") as string)?.trim() || null;
  const role = ((formData.get("role") as string) || "member") as AppUserRole;

  if (!email) throw new Error("Email is required");
  if (!isRoveLoginRole(role)) {
    throw new Error("Invalid role");
  }

  await withCloudSqlTransaction("app-users-add", async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO app_users (email, name, role)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [email, name, role]
    );
    const appUserId = rows[0]?.id;
    if (!appUserId) throw new Error("Failed to create user");
    const appKeys = ["planner", "time_report", "insights", "support"];
    await client.query(
      `INSERT INTO app_user_apps (app_user_id, app_id)
       SELECT $1, id FROM apps WHERE key = ANY($2::text[])`,
      [appUserId, appKeys]
    );
  });

  revalidatePath(ROUTES.people);
  revalidatePath(ROUTES.settings);
  revalidateTag("allocation-consultants", "max");
  revalidatePath(ROUTES.planner, "layout");
}

export async function removeAppUser(id: string) {
  const current = await getCurrentAppUser();
  if (!current || current.role !== "admin") {
    throw new Error("Unauthorized");
  }

  await cloudSqlPool.query("DELETE FROM app_users WHERE id = $1", [id]);

  revalidatePath(ROUTES.people);
  revalidatePath(ROUTES.settings);
}

export async function updateAppUser(args: {
  id: string;
  email?: string;
  name?: string | null;
  role?: AppUserRole;
}) {
  const current = await getCurrentAppUser();
  if (!current || current.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const setParts: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (args.email !== undefined) {
    const email = args.email.trim().toLowerCase();
    if (!email) throw new Error("Email is required");
    setParts.push(`email = $${idx++}`);
    values.push(email);
  }

  if (args.name !== undefined) {
    const name = (args.name ?? "").trim();
    setParts.push(`name = $${idx++}`);
    values.push(name === "" ? null : name);
  }

  if (args.role !== undefined) {
    const { rows: currentRows } = await cloudSqlPool.query<{ role: string }>(
      "SELECT role FROM app_users WHERE id = $1",
      [args.id]
    );
    const currentRole = currentRows[0]?.role;
    if (currentRole === "customer" || args.role === "customer") {
      if (currentRole !== args.role) {
        throw new Error(
          "A customer user cannot be changed to a Rove role, or the reverse"
        );
      }
    } else if (!isRoveLoginRole(args.role)) {
      throw new Error("Invalid role");
    }
    if (currentRole !== args.role) {
      setParts.push(`role = $${idx++}`);
      values.push(args.role);
    }
  }

  if (setParts.length === 0) return;

  setParts.push(`updated_at = now()`);
  values.push(args.id);

  await withCloudSqlTransaction("app-users-update", async (client) => {
    await client.query(
      `UPDATE app_users SET ${setParts.join(", ")} WHERE id = $${idx}`,
      values
    );
    await client.query(
      `UPDATE consultants c
       SET name = COALESCE(NULLIF(trim(u.name), ''), u.email),
           email = u.email,
           updated_at = now()
       FROM app_users u
       WHERE c.app_user_id = u.id
         AND u.id = $1`,
      [args.id]
    );
  });

  revalidatePath(ROUTES.people);
  revalidatePath(ROUTES.settings);
  revalidateTag("allocation-consultants", "max");
  revalidatePath(ROUTES.planner, "layout");
}