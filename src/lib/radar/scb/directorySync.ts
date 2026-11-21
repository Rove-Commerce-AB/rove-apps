import "server-only";

import { createWriteStream } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";
import { createInterface } from "readline";
import { createReadStream } from "fs";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import {
  parseScbDataLine,
  type ScbBulkCompany,
} from "@/lib/radar/bulk/scbBulk";
import { patchRadarJobSettings } from "@/lib/radar/jobs";

const DEFAULT_BULK_URL =
  "https://vardefulla-datamangder.bolagsverket.se/scb/scb_bulkfil.zip";

const BATCH_SIZE = 500;
const MIN_SCHEDULE_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000; // ~weekly

export type DirectorySyncProgress = {
  message: string;
  processed: number;
};

function bulkUrl(): string {
  return (
    process.env.RADAR_SCB_BULK_URL?.trim() ||
    DEFAULT_BULK_URL
  );
}

async function downloadZip(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow", cache: "no-store" });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download SCB bulk (${res.status})`);
  }
  // Node fetch body → file
  const { Readable } = await import("stream");
  const nodeStream = Readable.fromWeb(
    res.body as import("stream/web").ReadableStream
  );
  await pipeline(nodeStream, createWriteStream(destPath));
}

async function extractScbTsvFromZip(
  zipPath: string,
  outPath: string
): Promise<void> {
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

async function* streamParsedCompanies(
  tsvPath: string
): AsyncGenerator<ScbBulkCompany> {
  const rl = createInterface({
    // Bulk file is ISO-8859-1 / latin1
    input: createReadStream(tsvPath, { encoding: "latin1" }),
    crlfDelay: Infinity,
  });

  let headerIndex: Map<string, number> | null = null;
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
    const parsed = parseScbDataLine(line, headerIndex);
    if (parsed) yield parsed;
  }
}

async function flushBatch(
  batch: ScbBulkCompany[]
): Promise<void> {
  if (batch.length === 0) return;
  const values: string[] = [];
  const params: unknown[] = [];
  for (const row of batch) {
    const base = params.length;
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, now())`
    );
    params.push(
      row.organization_number,
      row.name,
      row.legal_form,
      row.primary_sni,
      row.county,
      row.municipality,
      row.postort,
      row.postnr,
      "scb_bulkfil"
    );
  }
  await cloudSqlPool.query(
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

/**
 * Download (or use local path) SCB bulk and refresh radar_scb_directory.
 * On scheduled runs, skips if last sync was within ~6 days.
 */
export async function runScbDirectorySync(options: {
  trigger?: "manual" | "schedule" | "worker";
  isPaused?: () => Promise<boolean>;
  onProgress?: (progress: DirectorySyncProgress) => void | Promise<void>;
}): Promise<{
  processed: number;
  skipped: boolean;
  message: string;
}> {
  if (options.trigger === "schedule") {
    const { rows } = await cloudSqlPool.query<{ settings: Record<string, unknown> }>(
      `SELECT settings FROM radar_job_configs WHERE job_type = 'scb_directory_sync'`
    );
    const last = rows[0]?.settings?.lastSyncedAt;
    if (typeof last === "string") {
      const age = Date.now() - new Date(last).getTime();
      if (!Number.isNaN(age) && age < MIN_SCHEDULE_INTERVAL_MS) {
        return {
          processed: 0,
          skipped: true,
          message: `Directory sync skipped — last sync ${last} (weekly cadence)`,
        };
      }
    }
  }

  const localPath = process.env.RADAR_SCB_BULK_PATH?.trim();
  const tmpRoot = await mkdtemp(join(tmpdir(), "radar-scb-"));
  let tsvPath: string;

  try {
    await options.onProgress?.({
      message: "Step 1/2 · Preparing SCB bulk file",
      processed: 0,
    });

    if (localPath) {
      // Local path may be .zip or already-extracted .txt/.tsv
      if (/\.zip$/i.test(localPath)) {
        tsvPath = join(tmpRoot, "scb.txt");
        await extractScbTsvFromZip(localPath, tsvPath);
      } else {
        tsvPath = localPath;
      }
    } else {
      const zipPath = join(tmpRoot, "scb_bulkfil.zip");
      await options.onProgress?.({
        message: "Step 1/2 · Downloading SCB bulk zip",
        processed: 0,
      });
      await downloadZip(bulkUrl(), zipPath);
      tsvPath = join(tmpRoot, "scb.txt");
      await extractScbTsvFromZip(zipPath, tsvPath);
    }

    await options.onProgress?.({
      message: "Step 2/2 · Indexing companies (0)",
      processed: 0,
    });

    // Full refresh: clear then insert (simpler than soft-delete stale rows)
    await cloudSqlPool.query(`TRUNCATE radar_scb_directory`);

    let processed = 0;
    let batch: ScbBulkCompany[] = [];
    for await (const company of streamParsedCompanies(tsvPath)) {
      if (options.isPaused && (await options.isPaused())) {
        break;
      }
      batch.push(company);
      if (batch.length >= BATCH_SIZE) {
        await flushBatch(batch);
        processed += batch.length;
        batch = [];
        if (processed % 5000 === 0) {
          await options.onProgress?.({
            message: `Step 2/2 · Indexing companies (${processed.toLocaleString("en-US")})`,
            processed,
          });
        }
      }
    }
    if (batch.length > 0) {
      await flushBatch(batch);
      processed += batch.length;
    }

    await patchRadarJobSettings("scb_directory_sync", {
      lastSyncedAt: new Date().toISOString(),
      lastSyncedCount: processed,
    });

    const message = `SCB directory: indexed ${processed.toLocaleString("en-US")} companies`;
    await options.onProgress?.({ message, processed });
    return { processed, skipped: false, message };
  } finally {
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}
