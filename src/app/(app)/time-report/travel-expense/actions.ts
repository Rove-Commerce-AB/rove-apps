"use server";

import { revalidatePath } from "next/cache";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { getCurrentAppUser } from "@/lib/appUsers";
import { ROUTES, travelExpenseDetailHref } from "@/lib/routes";
import {
  emptyTravelExpenseForm,
  parseTravelExpenseFormData,
  type TravelExpenseFormData,
  type TravelExpenseListItem,
  type TravelExpenseRecord,
} from "@/lib/travelExpenseTypes";

type DbRow = {
  id: string;
  destination: string;
  purpose: string;
  departure_date: string | Date | null;
  return_date: string | Date | null;
  form_data: unknown;
  created_at: string | Date;
  updated_at: string | Date;
};

async function requireStaffUser() {
  const user = await getCurrentAppUser();
  if (!user || user.role === "customer") {
    throw new Error("Unauthorized");
  }
  if (!user.appKeys.includes("time_report")) {
    throw new Error("Unauthorized");
  }
  return user;
}

function asIsoDate(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function asIsoTimestamp(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toListItem(row: DbRow): TravelExpenseListItem {
  return {
    id: row.id,
    destination: row.destination ?? "",
    purpose: row.purpose ?? "",
    departureDate: asIsoDate(row.departure_date),
    returnDate: asIsoDate(row.return_date),
    createdAt: asIsoTimestamp(row.created_at),
    updatedAt: asIsoTimestamp(row.updated_at),
  };
}

function toRecord(row: DbRow, fallbackName: string): TravelExpenseRecord {
  return {
    ...toListItem(row),
    formData: parseTravelExpenseFormData(row.form_data, fallbackName),
  };
}

function dateOrNull(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

export async function listMyTravelExpenses(): Promise<TravelExpenseListItem[]> {
  const user = await requireStaffUser();
  const { rows } = await cloudSqlPool.query<DbRow>(
    `SELECT id, destination, purpose, departure_date, return_date,
            form_data, created_at, updated_at
     FROM travel_expenses
     WHERE app_user_id = $1
     ORDER BY updated_at DESC`,
    [user.id]
  );
  return rows.map(toListItem);
}

export async function getMyTravelExpense(
  id: string
): Promise<TravelExpenseRecord | null> {
  const user = await requireStaffUser();
  const { rows } = await cloudSqlPool.query<DbRow>(
    `SELECT id, destination, purpose, departure_date, return_date,
            form_data, created_at, updated_at
     FROM travel_expenses
     WHERE id = $1 AND app_user_id = $2`,
    [id, user.id]
  );
  const row = rows[0];
  if (!row) return null;
  return toRecord(row, user.name ?? "");
}

export async function createTravelExpense(input?: {
  formData?: TravelExpenseFormData;
}): Promise<{ id: string }> {
  const user = await requireStaffUser();
  const formData =
    input?.formData ?? emptyTravelExpenseForm(user.name ?? "");
  if (!formData.name.trim() && user.name) {
    formData.name = user.name;
  }

  const { rows } = await cloudSqlPool.query<{ id: string }>(
    `INSERT INTO travel_expenses (
       app_user_id, destination, purpose, departure_date, return_date, form_data
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id`,
    [
      user.id,
      formData.destination.trim(),
      formData.purpose.trim(),
      dateOrNull(formData.departureDate),
      dateOrNull(formData.returnDate),
      JSON.stringify(formData),
    ]
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("Failed to create travel expense");
  revalidatePath(ROUTES.travelExpense);
  return { id };
}

export async function updateTravelExpense(
  id: string,
  formData: TravelExpenseFormData
): Promise<void> {
  const user = await requireStaffUser();
  const result = await cloudSqlPool.query(
    `UPDATE travel_expenses
     SET destination = $1,
         purpose = $2,
         departure_date = $3,
         return_date = $4,
         form_data = $5::jsonb
     WHERE id = $6 AND app_user_id = $7`,
    [
      formData.destination.trim(),
      formData.purpose.trim(),
      dateOrNull(formData.departureDate),
      dateOrNull(formData.returnDate),
      JSON.stringify(formData),
      id,
      user.id,
    ]
  );
  if (result.rowCount === 0) throw new Error("Not found");
  revalidatePath(ROUTES.travelExpense);
  revalidatePath(travelExpenseDetailHref(id));
}

export async function copyTravelExpense(
  id: string
): Promise<{ id: string }> {
  const existing = await getMyTravelExpense(id);
  if (!existing) throw new Error("Not found");
  // Copy everything including dates (user choice 9B).
  return createTravelExpense({ formData: existing.formData });
}

export async function deleteTravelExpense(id: string): Promise<void> {
  const user = await requireStaffUser();
  const result = await cloudSqlPool.query(
    `DELETE FROM travel_expenses WHERE id = $1 AND app_user_id = $2`,
    [id, user.id]
  );
  if (result.rowCount === 0) throw new Error("Not found");
  revalidatePath(ROUTES.travelExpense);
}
