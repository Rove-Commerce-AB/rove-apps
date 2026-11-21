/**
 * Backfill radar_companies.sni_description from SNI 2007 detaljgrupp labels.
 *
 * Usage: node --env-file=.env.local scripts/backfill-sni-descriptions.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { parse } from "pg-connection-string";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const labelsPath = path.join(
  __dirname,
  "../src/lib/radar/data/sni2007DetailLabels.json"
);

const connectionString = process.env.CLOUD_SQL_URL;
if (!connectionString) {
  console.error("CLOUD_SQL_URL is not set");
  process.exit(1);
}

const normalized = connectionString.replace(/^postgresql:/i, "postgres:");
const url = new URL(normalized);
const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
url.searchParams.delete("sslmode");
const parsed = parse(url.toString());
const { ssl: _parsedSsl, ...connection } = parsed;
void _parsedSsl;

const isUnixSocket = (connection.host ?? "").startsWith("/cloudsql/");
const useSsl = sslMode !== "disable" && !isUnixSocket;
const client = new pg.Client({
  ...connection,
  ...(useSsl
    ? {
        ssl: {
          rejectUnauthorized:
            process.env.CLOUD_SQL_SSL_REJECT_UNAUTHORIZED === "true",
        },
      }
    : {}),
});

const labels = JSON.parse(await readFile(labelsPath, "utf8"));
const entries = Object.entries(labels);

try {
  await client.connect();
  await client.query("BEGIN");
  // Temp map of code → label, then update companies missing a description.
  await client.query(
    `CREATE TEMP TABLE tmp_sni_labels (
       code TEXT PRIMARY KEY,
       label TEXT NOT NULL
     ) ON COMMIT DROP`
  );

  const chunkSize = 200;
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize);
    const values = [];
    const params = [];
    for (const [code, label] of chunk) {
      const base = params.length;
      values.push(`($${base + 1}, $${base + 2})`);
      params.push(code, label);
    }
    await client.query(
      `INSERT INTO tmp_sni_labels (code, label) VALUES ${values.join(", ")}`,
      params
    );
  }

  const result = await client.query(
    `UPDATE radar_companies c
     SET sni_description = l.label,
         updated_at = now()
     FROM tmp_sni_labels l
     WHERE regexp_replace(c.sni_code, '\\D', '', 'g') = l.code
       AND (c.sni_description IS NULL OR btrim(c.sni_description) = '')`
  );
  await client.query("COMMIT");
  console.log(`Updated ${result.rowCount ?? 0} companies with SNI detail labels`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(error);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
