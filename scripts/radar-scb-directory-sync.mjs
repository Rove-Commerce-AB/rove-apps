/**
 * Long-running SCB directory sync for Cloud Run Job (hours, not HTTP 15m).
 *
 * Override Cloud Run Job command to:
 *   node scripts/radar-scb-directory-sync.mjs
 *
 * Required env:
 *   CLOUD_SQL_URL
 *
 * Optional:
 *   RADAR_SCB_BULK_URL  – zip URL (default Bolagsverket public bulk)
 *   RADAR_SCB_BULK_PATH – local zip/txt (skips download; mainly for local/dev)
 */

import { createReadStream, createWriteStream, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import process from "node:process";
import pg from "pg";
import { parse } from "pg-connection-string";

const DEFAULT_BULK_URL =
  "https://vardefulla-datamangder.bolagsverket.se/scb/scb_bulkfil.zip";
const BATCH_SIZE = 500;
const MIN_SCHEDULE_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000;
const JOB_TYPE = "scb_directory_sync";
const ALLOWED_JUR_FORMS = new Set(["49", "51", "53", "42"]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadPostnrCountyMap() {
  try {
    const raw = readFileSync(
      join(ROOT, "src/lib/radar/bulk/data/postnrToCounty.json"),
      "utf8"
    );
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const POSTNR_MAP = loadPostnrCountyMap();

function normalizeOrg(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return digits;
}

function orgFromPeOrgNr(peOrgNr) {
  const digits = String(peOrgNr ?? "").replace(/\D/g, "");
  if (digits.length === 10) return normalizeOrg(digits);
  if (digits.length === 12 && digits.startsWith("16")) {
    return normalizeOrg(digits.slice(2));
  }
  return null;
}

function resolveCounty(postnr, postort) {
  const digits = String(postnr ?? "").replace(/\D/g, "");
  if (digits.length === 5 && POSTNR_MAP[digits]) return POSTNR_MAP[digits];
  return null;
}

function parseLine(line, headerIndex) {
  const cols = line.split("\t");
  const get = (name) => {
    const i = headerIndex.get(name);
    if (i == null) return "";
    return (cols[i] ?? "").trim();
  };
  const org = orgFromPeOrgNr(get("PeOrgNr"));
  if (!org) return null;
  const jurForm = get("JurForm");
  if (!org.startsWith("55") && !ALLOWED_JUR_FORMS.has(jurForm)) return null;
  const sni = ["Ng1", "Ng2", "Ng3", "Ng4", "Ng5"]
    .map((k) => get(k))
    .filter((s) => s && s !== "00000");
  if (sni.length === 0) return null;
  const name = get("Namn") || get("Foretagsnamn");
  if (!name) return null;
  const postort = get("PostOrt") || null;
  const postnr = get("PostNr") || null;
  return {
    organization_number: org,
    name,
    legal_form: jurForm === "49" ? "AB" : jurForm || "unknown",
    sni_code: sni[0] ?? null,
    county: resolveCounty(postnr, postort),
    municipality: postort,
    postort,
    postnr,
  };
}

function createPgClient() {
  const connectionString = process.env.CLOUD_SQL_URL;
  if (!connectionString) {
    throw new Error("CLOUD_SQL_URL is not set");
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
  return new pg.Client({
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
}

async function downloadZip(url, destPath) {
  const res = await fetch(url, { redirect: "follow", cache: "no-store" });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download SCB bulk (${res.status})`);
  }
  const nodeStream = Readable.fromWeb(res.body);
  await pipeline(nodeStream, createWriteStream(destPath));
}

async function extractTxt(zipPath, outPath) {
  const unzipper = await import("unzipper");
  const directory = await unzipper.Open.file(zipPath);
  const entry =
    directory.files.find((f) => /\.txt$/i.test(f.path) && !f.path.includes("/")) ??
    directory.files.find((f) => /\.(txt|tsv|csv)$/i.test(f.path));
  if (!entry) {
    throw new Error("SCB bulk zip did not contain a TSV/TXT file");
  }
  await pipeline(entry.stream(), createWriteStream(outPath));
}

async function* streamCompanies(tsvPath) {
  const rl = createInterface({
    input: createReadStream(tsvPath, { encoding: "latin1" }),
    crlfDelay: Infinity,
  });
  let headerIndex = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!headerIndex) {
      const headers = line.split("\t").map((h) => h.trim());
      headerIndex = new Map(headers.map((h, i) => [h, i]));
      if (!headerIndex.has("PeOrgNr") || !headerIndex.has("Ng1")) {
        throw new Error("SCB bulk file missing required columns PeOrgNr / Ng1");
      }
      continue;
    }
    const parsed = parseLine(line, headerIndex);
    if (parsed) yield parsed;
  }
}

async function flushBatch(client, batch) {
  if (batch.length === 0) return;
  const values = [];
  const params = [];
  for (const row of batch) {
    const base = params.length;
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, now())`
    );
    params.push(
      row.organization_number,
      row.name,
      row.legal_form,
      row.sni_code,
      row.county,
      row.municipality,
      row.postort,
      row.postnr,
      "scb_bulkfil"
    );
  }
  await client.query(
    `INSERT INTO radar_scb_directory (
       organization_number, name, legal_form, sni_code,
       county, municipality, postort, postnr, source_ref, synced_at
     ) VALUES ${values.join(", ")}
     ON CONFLICT (organization_number) DO UPDATE SET
       name = EXCLUDED.name,
       legal_form = EXCLUDED.legal_form,
       sni_code = EXCLUDED.sni_code,
       county = EXCLUDED.county,
       municipality = EXCLUDED.municipality,
       postort = EXCLUDED.postort,
       postnr = EXCLUDED.postnr,
       source_ref = EXCLUDED.source_ref,
       synced_at = now()`,
    params
  );
}

async function main() {
  const client = createPgClient();
  await client.connect();
  let runId = null;

  try {
    const { rows: active } = await client.query(
      `SELECT id, status FROM radar_job_runs
       WHERE job_type = $1 AND status IN ('queued', 'running')
       ORDER BY created_at DESC LIMIT 1`,
      [JOB_TYPE]
    );
    if (active[0]) {
      console.log(
        JSON.stringify({
          skipped: true,
          reason: `Active run already ${active[0].status}`,
          runId: active[0].id,
        })
      );
      return;
    }

    const { rows: cfgRows } = await client.query(
      `SELECT paused, settings FROM radar_job_configs WHERE job_type = $1`,
      [JOB_TYPE]
    );
    const cfg = cfgRows[0];
    if (cfg?.paused) {
      console.log(JSON.stringify({ skipped: true, reason: "Job is paused" }));
      return;
    }
    const last = cfg?.settings?.lastSyncedAt;
    if (typeof last === "string") {
      const age = Date.now() - new Date(last).getTime();
      if (!Number.isNaN(age) && age < MIN_SCHEDULE_INTERVAL_MS) {
        console.log(
          JSON.stringify({
            skipped: true,
            reason: `Last sync ${last} (weekly cadence)`,
          })
        );
        return;
      }
    }

    const inserted = await client.query(
      `INSERT INTO radar_job_runs (job_type, trigger, status, message, started_at)
       VALUES ($1, 'schedule', 'running', $2, now())
       RETURNING id`,
      [JOB_TYPE, "Step 1/2 · Preparing SCB bulk file"]
    );
    runId = inserted.rows[0].id;

    const localPath = process.env.RADAR_SCB_BULK_PATH?.trim();
    const bulkUrl =
      process.env.RADAR_SCB_BULK_URL?.trim() || DEFAULT_BULK_URL;
    const tmpRoot = await mkdtemp(join(tmpdir(), "radar-scb-"));
    let tsvPath;

    try {
      if (localPath) {
        if (/\.zip$/i.test(localPath)) {
          tsvPath = join(tmpRoot, "scb.txt");
          await extractTxt(localPath, tsvPath);
        } else {
          tsvPath = localPath;
        }
      } else {
        const zipPath = join(tmpRoot, "scb_bulkfil.zip");
        await client.query(
          `UPDATE radar_job_runs SET message = $2 WHERE id = $1`,
          [runId, "Step 1/2 · Downloading SCB bulk zip"]
        );
        console.log("Downloading SCB bulk zip…");
        await downloadZip(bulkUrl, zipPath);
        tsvPath = join(tmpRoot, "scb.txt");
        await client.query(
          `UPDATE radar_job_runs SET message = $2 WHERE id = $1`,
          [runId, "Step 1/2 · Extracting SCB bulk"]
        );
        await extractTxt(zipPath, tsvPath);
        await rm(zipPath, { force: true }).catch(() => {});
      }

      await client.query(
        `UPDATE radar_job_runs SET message = $2, processed_count = 0 WHERE id = $1`,
        [runId, "Step 2/2 · Indexing companies (0)"]
      );
      await client.query(`TRUNCATE radar_scb_directory`);

      let processed = 0;
      let batch = [];
      for await (const company of streamCompanies(tsvPath)) {
        batch.push(company);
        if (batch.length >= BATCH_SIZE) {
          await flushBatch(client, batch);
          processed += batch.length;
          batch = [];
          if (processed % 5000 === 0) {
            const message = `Step 2/2 · Indexing companies (${processed.toLocaleString("en-US")})`;
            await client.query(
              `UPDATE radar_job_runs
               SET message = $2, processed_count = $3
               WHERE id = $1 AND status = 'running'`,
              [runId, message, processed]
            );
            console.log(message);
          }
        }
      }
      if (batch.length > 0) {
        await flushBatch(client, batch);
        processed += batch.length;
      }

      const message = `SCB directory: indexed ${processed.toLocaleString("en-US")} companies`;
      await client.query(
        `UPDATE radar_job_configs
         SET settings = COALESCE(settings, '{}'::jsonb) || $2::jsonb
         WHERE job_type = $1`,
        [
          JOB_TYPE,
          JSON.stringify({
            lastSyncedAt: new Date().toISOString(),
            lastSyncedCount: processed,
          }),
        ]
      );
      await client.query(
        `UPDATE radar_job_runs SET
           status = 'completed',
           finished_at = now(),
           processed_count = $2,
           message = $3
         WHERE id = $1`,
        [runId, processed, message]
      );
      console.log(JSON.stringify({ ok: true, processed, message, runId }));
    } finally {
      await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(detail);
    if (runId) {
      await client
        .query(
          `UPDATE radar_job_runs SET
             status = 'failed',
             finished_at = now(),
             message = 'Job failed',
             error_detail = $2
           WHERE id = $1`,
          [runId, detail.slice(0, 2000)]
        )
        .catch(() => {});
    }
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

await main();
