/**
 * Migrate legacy work_issue_files BYTEA rows into GCS.
 *
 * Requires:
 *   WORK_FILES_GCS_BUCKET
 *   CLOUD_SQL_URL
 *   Application Default Credentials (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Usage:
 *   node scripts/migrate-work-files-to-gcs.mjs
 *   node scripts/migrate-work-files-to-gcs.mjs --limit=100
 *   node scripts/migrate-work-files-to-gcs.mjs --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Storage } from "@google-cloud/storage";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function buildStorageKey(issueId, fileId, fileName) {
  const safe = String(fileName).replace(/[^\w.\-()+ ]+/g, "_").slice(0, 180) || "file";
  return `work/${issueId}/${fileId}/${safe}`;
}

async function main() {
  loadEnvLocal();
  const bucketName = process.env.WORK_FILES_GCS_BUCKET?.trim();
  const databaseUrl = process.env.CLOUD_SQL_URL?.trim();
  if (!bucketName) throw new Error("WORK_FILES_GCS_BUCKET is required");
  if (!databaseUrl) throw new Error("CLOUD_SQL_URL is required");

  const limit = Math.max(1, Number(argValue("limit", "50")) || 50);
  const dryRun = process.argv.includes("--dry-run");

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    "continual-mind-442414-e0";
  const storage = new Storage({ projectId });
  const bucket = storage.bucket(bucketName);

  const { rows } = await pool.query(
    `SELECT id, issue_id, file_name, mime_type, byte_size, content
     FROM work_issue_files
     WHERE content IS NOT NULL
       AND (storage_key IS NULL OR length(btrim(storage_key)) = 0)
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );

  console.log(`Found ${rows.length} file(s) to migrate (limit=${limit}, dryRun=${dryRun})`);

  let ok = 0;
  let fail = 0;
  for (const row of rows) {
    const storageKey = buildStorageKey(row.issue_id, row.id, row.file_name);
    try {
      if (dryRun) {
        console.log(`[dry-run] ${row.id} -> gs://${bucketName}/${storageKey} (${row.byte_size} bytes)`);
        ok += 1;
        continue;
      }
      await bucket.file(storageKey).save(row.content, {
        resumable: false,
        contentType: row.mime_type || "application/octet-stream",
        metadata: { cacheControl: "private, max-age=0" },
      });
      const updated = await pool.query(
        `UPDATE work_issue_files
         SET storage_key = $2, content = NULL
         WHERE id = $1
           AND content IS NOT NULL
           AND (storage_key IS NULL OR length(btrim(storage_key)) = 0)`,
        [row.id, storageKey]
      );
      if ((updated.rowCount ?? 0) === 0) {
        console.warn(`Skip ${row.id}: row changed concurrently`);
        fail += 1;
        continue;
      }
      console.log(`Migrated ${row.id} -> ${storageKey}`);
      ok += 1;
    } catch (error) {
      fail += 1;
      console.error(`Failed ${row.id}:`, error?.message || error);
    }
  }

  await pool.end();
  console.log(`Done. ok=${ok} fail=${fail}`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
