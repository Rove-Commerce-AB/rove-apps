import pg from "pg";

const url = process.env.CLOUD_SQL_URL;
if (!url) {
  console.error("CLOUD_SQL_URL missing");
  process.exit(1);
}

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
  connectionString: stripSslMode(url),
  ssl: { rejectUnauthorized: false },
  statement_timeout: 20000,
});

await client.connect();

const projects = await client.query(`
  SELECT wp.id, wp.title, wp.prefix, wp.customer_id, cu.name AS customer_name,
         (SELECT count(*)::int FROM work_issues i WHERE i.project_id = wp.id) AS issue_count
  FROM work_projects wp
  JOIN customers cu ON cu.id = wp.customer_id
  WHERE wp.title ILIKE '%wholesale%'
     OR wp.title ILIKE '%Project - Wholesale%'
     OR wp.title ILIKE '%portal%'
  ORDER BY wp.title
`);
console.log("PROJECTS");
console.log(JSON.stringify(projects.rows, null, 2));

const exact = await client.query(`
  SELECT wp.id, wp.title, wp.prefix, wp.customer_id, cu.name AS customer_name
  FROM work_projects wp
  JOIN customers cu ON cu.id = wp.customer_id
  WHERE lower(btrim(wp.title)) = lower(btrim($1))
`, ["Project - Wholesale Portal"]);
console.log("EXACT");
console.log(JSON.stringify(exact.rows, null, 2));

const projectId = exact.rows[0]?.id ?? projects.rows.find((r) => /wholesale/i.test(r.title))?.id;
if (projectId) {
  const statuses = await client.query(
    `SELECT id, name, sort_order, is_done FROM work_project_statuses WHERE project_id = $1 ORDER BY sort_order`,
    [projectId],
  );
  console.log("STATUSES");
  console.log(JSON.stringify(statuses.rows, null, 2));

  const components = await client.query(
    `SELECT id, name FROM work_components WHERE project_id = $1 ORDER BY lower(name)`,
    [projectId],
  );
  console.log("COMPONENTS");
  console.log(JSON.stringify(components.rows, null, 2));

  const labels = await client.query(
    `SELECT id, name FROM work_issue_labels WHERE project_id = $1 ORDER BY lower(name)`,
    [projectId],
  );
  console.log("LABELS");
  console.log(JSON.stringify(labels.rows, null, 2));

  const maxNum = await client.query(
    `SELECT COALESCE(MAX(number), 0)::int AS max_number FROM work_issues WHERE project_id = $1`,
    [projectId],
  );
  console.log("MAX_NUMBER", maxNum.rows[0]);

  const members = await client.query(
    `SELECT m.app_user_id, u.email, u.name
     FROM work_project_members m
     JOIN app_users u ON u.id = m.app_user_id
     WHERE m.project_id = $1
     ORDER BY u.email`,
    [projectId],
  );
  console.log("MEMBERS");
  console.log(JSON.stringify(members.rows, null, 2));

  const sample = await client.query(
    `SELECT number, title, estimate_hours, component_id
     FROM work_issues WHERE project_id = $1
     ORDER BY number DESC LIMIT 10`,
    [projectId],
  );
  console.log("SAMPLE_ISSUES");
  console.log(JSON.stringify(sample.rows, null, 2));
}

await client.end();
