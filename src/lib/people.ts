"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { cloudSqlPool, withCloudSqlTransaction } from "@/lib/cloudSqlPool";
import { assertAdmin } from "@/lib/accessGuards";
import {
  consultantHasDeleteBlockers,
  getConsultantsList,
  linkNewInternalConsultantToInternalCustomer,
} from "@/lib/consultants";
import { customerHref, ROUTES, personHref } from "@/lib/routes";
import {
  isAppKey,
  isAppUserRole,
  isCustomerAssignableAppKey,
  isRoveLoginRole,
  type AppKey,
  type AppUserRole,
  type PersonListItem,
  type PersonMcpAccess,
} from "@/lib/peopleTypes";
import {
  generateTemporaryPassword,
  hashPassword,
} from "@/lib/passwords";
import { compareTextSv } from "@/lib/sort";
import {
  getCustomersForAppUserIds,
  getCustomersForConsultantIds,
} from "@/lib/customerAppUsers";

type AppUserWithAppsRow = {
  id: string;
  email: string;
  role: AppUserRole;
  name: string | null;
  app_keys: string[];
};

export async function getPeopleForAdmin(): Promise<PersonListItem[]> {
  await assertAdmin();

  const [consultants, appUserResult, mcpAccessResult] = await Promise.all([
    getConsultantsList(),
    cloudSqlPool.query<AppUserWithAppsRow>(
      `SELECT
         u.id,
         u.email,
         u.role,
         u.name,
         COALESCE(
           array_agg(a.key ORDER BY a.name) FILTER (WHERE a.key IS NOT NULL),
           ARRAY[]::text[]
         ) AS app_keys
       FROM app_users u
       LEFT JOIN app_user_apps aua ON aua.app_user_id = u.id
       LEFT JOIN apps a ON a.id = aua.app_id
       GROUP BY u.id, u.email, u.role, u.name
       ORDER BY lower(COALESCE(u.name, u.email)), lower(u.email)`
    ),
    cloudSqlPool.query<{
      app_user_id: string;
      has_token: boolean;
      mcp_app_keys: string[];
    }>(
      `SELECT u.id AS app_user_id,
              EXISTS (SELECT 1 FROM app_user_mcp_tokens t WHERE t.app_user_id = u.id) AS has_token,
              COALESCE(array_agg(a.key ORDER BY a.name) FILTER (WHERE aua.mcp_access), ARRAY[]::text[]) AS mcp_app_keys
       FROM app_users u
       LEFT JOIN app_user_apps aua ON aua.app_user_id = u.id
       LEFT JOIN apps a ON a.id = aua.app_id
       GROUP BY u.id`
    ).catch((cause: unknown) => {
      // Keep People available if the MCP migration has not been applied yet.
      console.error("Failed to load People MCP access", cause);
      return null;
    }),
  ]);

  const mcpAccessByUserId = new Map<string, PersonMcpAccess>(
    (mcpAccessResult?.rows ?? []).map((row) => [
      row.app_user_id,
      { hasToken: row.has_token, mcpAppKeys: row.mcp_app_keys.filter(isAppKey) },
    ])
  );
  const consultantsByUserId = new Map(
    consultants
      .filter((consultant) => consultant.app_user_id)
      .map((consultant) => [consultant.app_user_id!, consultant])
  );
  const linkedConsultantIds = new Set(
    [...consultantsByUserId.values()].map((consultant) => consultant.id)
  );

  const users: PersonListItem[] = appUserResult.rows.map((user) => {
    const consultant = consultantsByUserId.get(user.id) ?? null;
    return {
      key: `user-${user.id}`,
      appUserId: user.id,
      consultantId: consultant?.id ?? null,
      name: user.name?.trim() || consultant?.name || user.email,
      email: user.email,
      userRole: user.role,
      appKeys: user.app_keys.filter(isAppKey),
      mcpAccess: mcpAccessByUserId.get(user.id) ?? null,
      consultant,
      customers: [],
    };
  });

  const consultantOnly: PersonListItem[] = consultants
    .filter((consultant) => !linkedConsultantIds.has(consultant.id))
    .map((consultant) => ({
      key: `consultant-${consultant.id}`,
      appUserId: null,
      consultantId: consultant.id,
      name: consultant.name,
      email: consultant.email,
      userRole: null,
      appKeys: [],
      mcpAccess: null,
      consultant,
      customers: [],
    }));

  const people = [...users, ...consultantOnly];
  const [customersByUser, customersByConsultant] = await Promise.all([
    getCustomersForAppUserIds(
      people
        .filter((person) => person.userRole === "customer" && person.appUserId)
        .map((person) => person.appUserId as string)
    ),
    getCustomersForConsultantIds(
      people
        .filter((person) => person.consultantId)
        .map((person) => person.consultantId as string)
    ),
  ]);

  for (const person of people) {
    if (person.userRole === "customer" && person.appUserId) {
      person.customers = customersByUser[person.appUserId] ?? [];
    } else if (person.consultantId) {
      person.customers = customersByConsultant[person.consultantId] ?? [];
    }
  }

  return people.sort(
    (a, b) =>
      compareTextSv(a.name, b.name) ||
      compareTextSv(a.email ?? "", b.email ?? "")
  );
}

export async function setPersonApps(
  appUserId: string,
  appKeys: AppKey[]
): Promise<void> {
  await assertAdmin();
  const uniqueKeys = [...new Set(appKeys)];
  if (uniqueKeys.some((key) => !isAppKey(key))) {
    throw new Error("Invalid app");
  }

  await withCloudSqlTransaction("people-set-apps", async (client) => {
    const { rows: userRows } = await client.query<{ id: string; role: string }>(
      "SELECT id, role FROM app_users WHERE id = $1 FOR UPDATE",
      [appUserId]
    );
    if (!userRows[0]) throw new Error("User not found");
    if (userRows[0].role === "customer") {
      if (uniqueKeys.some((key) => !isCustomerAssignableAppKey(key))) {
        throw new Error("Customer users can only be granted Work");
      }
    } else if (uniqueKeys.length === 0) {
      throw new Error("A user must have access to at least one app");
    }

    await client.query(
      `DELETE FROM app_user_apps
       WHERE app_user_id = $1
         AND app_id NOT IN (SELECT id FROM apps WHERE key = ANY($2::text[]))`,
      [appUserId, uniqueKeys]
    );
    await client.query(
      `INSERT INTO app_user_apps (app_user_id, app_id)
       SELECT $1, id FROM apps WHERE key = ANY($2::text[])
       ON CONFLICT (app_user_id, app_id) DO NOTHING`,
      [appUserId, uniqueKeys]
    );
  });

  revalidatePath(ROUTES.people);
  revalidatePath(personHref(`user-${appUserId}`));
  revalidatePath("/", "layout");
}

export type WorkBoardAssignmentOption = {
  id: string;
  title: string;
  customerId: string;
  customerName: string;
};

/** Active Work projects for the given customers (admin people wizard). */
export async function listWorkBoardsForCustomerAssignment(
  customerIds: string[]
): Promise<WorkBoardAssignmentOption[]> {
  await assertAdmin();
  const unique = [...new Set(customerIds)].filter(Boolean);
  if (unique.length === 0) return [];

  const { rows } = await cloudSqlPool.query<{
    id: string;
    title: string;
    customer_id: string;
    customer_name: string;
  }>(
    `SELECT b.id, b.title, b.customer_id, c.name AS customer_name
     FROM work_projects b
     JOIN customers c ON c.id = b.customer_id
     WHERE b.customer_id = ANY($1::uuid[])
       AND b.archived_at IS NULL
     ORDER BY lower(c.name), lower(b.title)`,
    [unique]
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    customerId: row.customer_id,
    customerName: row.customer_name,
  }));
}

export async function createUserPerson(input: {
  name: string;
  email: string;
  role: AppUserRole;
  appKeys: AppKey[];
  consultantId?: string | null;
  customerIds?: string[];
  workBoardIds?: string[];
}): Promise<{ key: string; temporaryPassword?: string }> {
  await assertAdmin();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const appKeys = [...new Set(input.appKeys)];
  const workBoardIds = [...new Set(input.workBoardIds ?? [])];
  if (!email) throw new Error("Email is required");
  if (!isAppUserRole(input.role)) {
    throw new Error("Invalid role");
  }
  if (input.role === "customer") {
    if (appKeys.some((key) => !isCustomerAssignableAppKey(key))) {
      throw new Error("Customer users can only be granted Work");
    }
    if (input.consultantId) {
      throw new Error("A customer user cannot have a consultant profile");
    }
  } else {
    if (!isRoveLoginRole(input.role)) {
      throw new Error("Invalid role");
    }
    if (appKeys.length === 0) throw new Error("Select at least one app");
    if (appKeys.some((key) => !isAppKey(key))) throw new Error("Invalid app");
  }

  if (workBoardIds.length > 0 && !appKeys.includes("work")) {
    throw new Error("Work app access is required to assign Work projects");
  }

  const temporaryPassword =
    input.role === "customer" ? generateTemporaryPassword() : null;
  const passwordHash = temporaryPassword
    ? hashPassword(temporaryPassword)
    : null;

  const appUserId = await withCloudSqlTransaction(
    "people-create-user",
    async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO app_users (email, name, role, password_hash, must_change_password)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          email,
          name || null,
          input.role,
          passwordHash,
          Boolean(temporaryPassword),
        ]
      );
      const id = rows[0]?.id;
      if (!id) throw new Error("Failed to create user");

      if (appKeys.length > 0) {
        await client.query(
          `INSERT INTO app_user_apps (app_user_id, app_id)
           SELECT $1, id FROM apps WHERE key = ANY($2::text[])`,
          [id, appKeys]
        );
      }

      if (input.consultantId) {
        const result = await client.query(
          `UPDATE consultants
           SET app_user_id = $1, email = COALESCE(NULLIF(email, ''), $2), updated_at = now()
           WHERE id = $3 AND app_user_id IS NULL`,
          [id, email, input.consultantId]
        );
        if (result.rowCount !== 1) {
          throw new Error("Consultant is already linked to a user");
        }
      }

      const customerIds = [...new Set(input.customerIds ?? [])];
      if (input.role !== "customer" && customerIds.length > 0) {
        throw new Error("Only customer users can be linked as customer members");
      }
      if (customerIds.length > 0) {
        const { rows: internalRows } = await client.query<{ name: string }>(
          `SELECT name FROM customers
           WHERE id = ANY($1::uuid[]) AND is_internal = true`,
          [customerIds]
        );
        if (internalRows[0]) {
          throw new Error(
            "Customer users cannot be linked to the internal customer"
          );
        }
      }
      for (const customerId of customerIds) {
        await client.query(
          `INSERT INTO customer_app_users (customer_id, app_user_id)
           VALUES ($1, $2)`,
          [customerId, id]
        );
      }

      if (workBoardIds.length > 0) {
        const { rows: boardRows } = await client.query<{
          id: string;
          customer_id: string;
        }>(
          `SELECT id, customer_id
           FROM work_projects
           WHERE id = ANY($1::uuid[])
             AND archived_at IS NULL`,
          [workBoardIds]
        );
        if (boardRows.length !== workBoardIds.length) {
          throw new Error("One or more Work projects were not found");
        }
        if (input.role === "customer") {
          if (customerIds.length === 0) {
            throw new Error(
              "Select at least one customer before assigning Work projects"
            );
          }
          const customerSet = new Set(customerIds);
          for (const board of boardRows) {
            if (!customerSet.has(board.customer_id)) {
              throw new Error(
                "Work projects must belong to a selected customer"
              );
            }
          }
        }
        for (const boardId of workBoardIds) {
          await client.query(
            `INSERT INTO work_project_members (project_id, app_user_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [boardId, id]
          );
        }
      }
      return id;
    }
  );

  revalidatePath(ROUTES.people);
  revalidatePath(ROUTES.customers);
  revalidatePath(ROUTES.work);
  return {
    key: `user-${appUserId}`,
    ...(temporaryPassword ? { temporaryPassword } : {}),
  };
}

export async function createConsultantProfileForUser(input: {
  appUserId: string;
  roleId: string;
  calendarId: string;
}): Promise<{ consultantId: string }> {
  await assertAdmin();
  if (!input.roleId || !input.calendarId) {
    throw new Error("Role and calendar are required");
  }

  const consultantId = await withCloudSqlTransaction(
    "people-create-consultant-profile",
    async (client) => {
      const { rows: users } = await client.query<{
        id: string;
        name: string | null;
        email: string;
        role: string;
      }>("SELECT id, name, email, role FROM app_users WHERE id = $1 FOR UPDATE", [
        input.appUserId,
      ]);
      const user = users[0];
      if (!user) throw new Error("User not found");
      if (user.role === "customer") {
        throw new Error("A customer user cannot have a consultant profile");
      }

      const existing = await client.query(
        "SELECT id FROM consultants WHERE app_user_id = $1",
        [input.appUserId]
      );
      if (existing.rows[0]) throw new Error("User already has a consultant profile");

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO consultants (
           app_user_id, name, email, role_id, calendar_id, is_external,
           work_percentage, overhead_percentage
         ) VALUES ($1, $2, $3, $4, $5, false, 100, 0)
         RETURNING id`,
        [
          input.appUserId,
          user.name?.trim() || user.email,
          user.email,
          input.roleId,
          input.calendarId,
        ]
      );
      const id = rows[0]?.id;
      if (!id) throw new Error("Failed to create consultant profile");
      return id;
    }
  );

  const internalCustomerId = await linkNewInternalConsultantToInternalCustomer(
    consultantId,
    {
      app_user_id: input.appUserId,
      name: "",
      role_id: input.roleId,
      calendar_id: input.calendarId,
      is_external: false,
    }
  );
  revalidateTag("allocation-consultants", "max");
  revalidatePath(ROUTES.people);
  revalidatePath(ROUTES.planner, "layout");
  if (internalCustomerId) {
    revalidatePath(ROUTES.customers);
    revalidatePath(customerHref(internalCustomerId));
  }
  return { consultantId };
}

/**
 * Hard-delete a person: removes consultant profile and/or login when present.
 * Blocked when the consultant has time report or planning history (same rule as customers).
 */
export async function deletePerson(input: {
  appUserId: string | null;
  consultantId: string | null;
}): Promise<void> {
  await assertAdmin();
  const appUserId = input.appUserId?.trim() || null;
  const consultantId = input.consultantId?.trim() || null;
  if (!appUserId && !consultantId) {
    throw new Error("Nothing to delete");
  }

  if (consultantId && (await consultantHasDeleteBlockers(consultantId))) {
    throw new Error(
      "This person has time report or planning history and cannot be deleted. Set status to Inactive instead."
    );
  }

  await withCloudSqlTransaction("people-delete-person", async (client) => {
    if (consultantId) {
      await client.query(`DELETE FROM consultants WHERE id = $1`, [consultantId]);
    }
    if (appUserId) {
      await client.query(`DELETE FROM app_users WHERE id = $1`, [appUserId]);
    }
  });

  revalidateTag("allocation-consultants", "max");
  revalidatePath(ROUTES.people);
  revalidatePath(ROUTES.consultants);
  revalidatePath(ROUTES.settings);
  revalidatePath(ROUTES.planner, "layout");
}
