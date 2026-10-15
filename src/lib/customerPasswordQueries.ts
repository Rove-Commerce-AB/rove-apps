import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { normalizeEmail } from "@/lib/passwords";

export type CustomerPasswordUser = {
  id: string;
  email: string;
  name: string | null;
  password_hash: string | null;
  must_change_password: boolean;
};

export async function findCustomerForPasswordLogin(
  email: string
): Promise<CustomerPasswordUser | null> {
  const normalized = normalizeEmail(email);
  const { rows } = await cloudSqlPool.query<CustomerPasswordUser>(
    `SELECT id, email, name, password_hash, must_change_password
     FROM app_users
     WHERE lower(trim(email)) = $1 AND role = 'customer'
     LIMIT 1`,
    [normalized]
  );
  return rows[0] ?? null;
}
