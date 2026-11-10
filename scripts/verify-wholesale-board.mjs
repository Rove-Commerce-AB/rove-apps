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

const boardId = "a6013b0a-5275-4d49-9826-089b34edec36";
const issues = await pool.query(
  `SELECT count(*)::int AS n FROM work_issues WHERE board_id = $1`,
  [boardId]
);
const labels = await pool.query(
  `SELECT name, count(*)::int AS n
   FROM work_issue_labels lab
   JOIN work_issue_label_links l ON l.label_id = lab.id
   WHERE lab.board_id = $1
   GROUP BY name
   ORDER BY name`,
  [boardId]
);
const sample = await pool.query(
  `SELECT i.number, i.title, i.description, array_agg(lab.name) AS labels
   FROM work_issues i
   JOIN work_issue_label_links l ON l.issue_id = i.id
   JOIN work_issue_labels lab ON lab.id = l.label_id
   WHERE i.board_id = $1
   GROUP BY i.id
   ORDER BY i.number
   LIMIT 3`,
  [boardId]
);
console.log("issues", issues.rows[0]);
console.log("labels", labels.rows);
console.log("sample", sample.rows);
await pool.end();
