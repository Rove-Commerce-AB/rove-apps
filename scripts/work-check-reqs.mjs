import pg from "pg";

function stripSslMode(connectionUrl) {
  try {
    const u = new URL(connectionUrl.replace(/^postgresql:/i, "postgres:"));
    u.searchParams.delete("sslmode");
    return u.toString();
  } catch {
    return connectionUrl;
  }
}

const projectId = process.env.WORK_PROJECT_ID;
const client = new pg.Client({
  connectionString: stripSslMode(process.env.CLOUD_SQL_URL),
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const { rows } = await client.query(
  `SELECT i.number, i.title, count(r.id)::int AS reqs
   FROM work_issues i
   LEFT JOIN work_issue_requirements r ON r.issue_id = i.id
   WHERE i.project_id = $1
   GROUP BY i.number, i.title
   ORDER BY i.number`,
  [projectId],
);
const withReqs = rows.filter((r) => r.reqs > 0).length;
console.log(`issues=${rows.length} with_reqs=${withReqs}`);
console.log(rows.slice(0, 5));
await client.end();
