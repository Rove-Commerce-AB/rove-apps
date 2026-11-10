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

const url = process.env.CLOUD_SQL_URL;
const projectId = "a6013b0a-5275-4d49-9826-089b34edec36";
const client = new pg.Client({
  connectionString: stripSslMode(url),
  ssl: { rejectUnauthorized: false },
  statement_timeout: 20000,
});
await client.connect();
const { rows } = await client.query(
  `SELECT i.number, i.title, i.estimate_hours, s.name AS status,
          c.name AS component,
          (SELECT string_agg(lab.name, ', ' ORDER BY lab.name)
           FROM work_issue_label_links ll
           JOIN work_issue_labels lab ON lab.id = ll.label_id
           WHERE ll.issue_id = i.id) AS labels
   FROM work_issues i
   JOIN work_project_statuses s ON s.id = i.status
   LEFT JOIN work_components c ON c.id = i.component_id
   WHERE i.project_id = $1
   ORDER BY i.number`,
  [projectId],
);
for (const row of rows) {
  console.log(
    `${String(row.number).padStart(2)} | ${row.status.padEnd(12)} | est=${row.estimate_hours ?? "-"} | ${row.component ?? "-"} | ${row.labels ?? "-"} | ${row.title}`,
  );
}
console.log("TOTAL", rows.length);
await client.end();
