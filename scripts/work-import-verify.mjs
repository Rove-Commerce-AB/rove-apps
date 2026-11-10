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

const PROJECT_ID =
  process.env.WORK_PROJECT_ID?.trim() ||
  "a6013b0a-5275-4d49-9826-089b34edec36";
const client = new pg.Client({
  connectionString: stripSslMode(process.env.CLOUD_SQL_URL),
  ssl: { rejectUnauthorized: false },
  statement_timeout: 20000,
});
await client.connect();

const { rows: statuses } = await client.query(
  `SELECT name, sort_order,
          (SELECT count(*)::int FROM work_issues i WHERE i.status = s.id) AS issues
   FROM work_project_statuses s
   WHERE project_id = $1 ORDER BY sort_order`,
  [PROJECT_ID],
);
console.log("STATUSES", statuses);

const { rows: comps } = await client.query(
  `SELECT c.name, count(i.id)::int AS issues
   FROM work_components c
   LEFT JOIN work_issues i ON i.component_id = c.id
   WHERE c.project_id = $1
   GROUP BY c.name ORDER BY lower(c.name)`,
  [PROJECT_ID],
);
console.log("COMPONENTS", comps);

const { rows: labels } = await client.query(
  `SELECT lab.name, count(ll.issue_id)::int AS links
   FROM work_issue_labels lab
   LEFT JOIN work_issue_label_links ll ON ll.label_id = lab.id
   WHERE lab.project_id = $1 AND lab.name IN ('Accelerator','Portal')
   GROUP BY lab.name`,
  [PROJECT_ID],
);
console.log("ORIGIN_LABELS", labels);

const { rows: hours } = await client.query(
  `SELECT count(*)::int AS with_estimate,
          coalesce(sum(estimate_hours),0)::float AS total_hours,
          count(*) FILTER (WHERE estimate_hours IS NULL AND number <> 42)::int AS without_estimate
   FROM work_issues WHERE project_id = $1 AND status = (
     SELECT id FROM work_project_statuses WHERE project_id = $1 AND name = 'Backlog'
   )`,
  [PROJECT_ID],
);
console.log("BACKLOG_ESTIMATES", hours[0]);

const { rows: sample } = await client.query(
  `SELECT i.number, i.title, i.estimate_hours, c.name AS component,
          (SELECT string_agg(lab.name, ',') FROM work_issue_label_links ll
           JOIN work_issue_labels lab ON lab.id = ll.label_id
           WHERE ll.issue_id = i.id AND lab.name IN ('Accelerator','Portal')) AS origin,
          (SELECT count(*)::int FROM work_issue_references r WHERE r.issue_id = i.id) AS refs
   FROM work_issues i
   LEFT JOIN work_components c ON c.id = i.component_id
   JOIN work_project_statuses s ON s.id = i.status
   WHERE i.project_id = $1 AND s.name = 'Backlog'
   ORDER BY i.number
   LIMIT 8`,
  [PROJECT_ID],
);
console.log("SAMPLE", sample);

const { rows: created } = await client.query(
  `SELECT number, title, estimate_hours FROM work_issues
   WHERE project_id = $1 AND number >= 43 ORDER BY number`,
  [PROJECT_ID],
);
console.log("NEW", created);

await client.end();
