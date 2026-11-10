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

const client = new pg.Client({
  connectionString: stripSslMode(process.env.CLOUD_SQL_URL),
  ssl: { rejectUnauthorized: false },
  statement_timeout: 20000,
});
await client.connect();

const projects = await client.query(`
  SELECT wp.id, wp.title, wp.prefix, cu.name AS customer_name,
         (SELECT count(*)::int FROM work_issues i WHERE i.project_id = wp.id) AS issue_count
  FROM work_projects wp
  JOIN customers cu ON cu.id = wp.customer_id
  WHERE wp.title ILIKE '%wholesale%'
     OR wp.title ILIKE '%portal%'
  ORDER BY wp.title
`);
console.log("PROJECTS", JSON.stringify(projects.rows, null, 2));

const simon = await client.query(
  `SELECT id, email, name FROM app_users WHERE lower(email) IN ('simon@rove.se','simzet@gmail.com') ORDER BY email`,
);
console.log("ACTORS", JSON.stringify(simon.rows, null, 2));

const project =
  projects.rows.find((r) => /wholesale/i.test(r.title)) ?? projects.rows[0];
if (project) {
  const statuses = await client.query(
    `SELECT id, name, sort_order, is_done,
            (SELECT count(*)::int FROM work_issues i WHERE i.status = s.id) AS issues
     FROM work_project_statuses s WHERE project_id = $1 ORDER BY sort_order`,
    [project.id],
  );
  console.log("PROJECT", project.title, project.id);
  console.log("STATUSES", JSON.stringify(statuses.rows, null, 2));

  const comps = await client.query(
    `SELECT id, name FROM work_components WHERE project_id = $1 ORDER BY lower(name)`,
    [project.id],
  );
  console.log("COMPONENTS", JSON.stringify(comps.rows, null, 2));

  const labels = await client.query(
    `SELECT id, name FROM work_issue_labels WHERE project_id = $1 ORDER BY lower(name)`,
    [project.id],
  );
  console.log("LABELS", JSON.stringify(labels.rows, null, 2));

  const sample = await client.query(
    `SELECT number, title, estimate_hours FROM work_issues
     WHERE project_id = $1 ORDER BY number LIMIT 15`,
    [project.id],
  );
  console.log("SAMPLE", JSON.stringify(sample.rows, null, 2));

  const max = await client.query(
    `SELECT COALESCE(MAX(number),0)::int AS max_number FROM work_issues WHERE project_id = $1`,
    [project.id],
  );
  console.log("MAX", max.rows[0]);
}

await client.end();
