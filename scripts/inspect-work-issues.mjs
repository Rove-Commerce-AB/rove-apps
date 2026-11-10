import fs from "fs";
import { Pool } from "pg";
import { parse } from "pg-connection-string";

const env = fs.readFileSync(".env.local", "utf8");
const url = env
  .split(/\r?\n/)
  .find((l) => l.startsWith("CLOUD_SQL_URL=") && !l.trim().startsWith("#"))
  .slice("CLOUD_SQL_URL=".length)
  .trim();
const p = parse(url);
delete p.ssl;
const u = new URL(url.replace(/^postgresql:/i, "postgres:"));
u.searchParams.delete("sslmode");
const pool = new Pool({
  ...p,
  connectionString: u.toString(),
  ssl: { rejectUnauthorized: false },
});

const cols = await pool.query(
  `SELECT column_name, data_type, udt_name
   FROM information_schema.columns
   WHERE table_name = 'work_issues'
   ORDER BY ordinal_position`
);
console.log(cols.rows);
const boards = await pool.query(
  `SELECT id, title, prefix FROM work_boards WHERE lower(title) = lower($1)`,
  ["Wholesale portal"]
);
console.log("boards", boards.rows);
await pool.end();
