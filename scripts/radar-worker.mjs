/**
 * Cloud Run Job / Scheduler entrypoint for short Radar jobs
 * (company import, domain enrichment, tech scan).
 *
 * SCB directory sync is NOT handled here (too long for HTTP 15m timeout).
 * See scripts/radar-scb-directory-sync.mjs + Cloud Run Job
 * `radar-scb-directory-sync` (scheduled Sat 02:00 Europe/Stockholm).
 *
 * Same container image as the web app. Override the Cloud Run Job command to:
 *   node scripts/radar-worker.mjs
 *
 * Required env:
 *   RADAR_WORKER_URL  – base URL of the Radar web service (or itself)
 *   RADAR_WORKER_API_KEY
 *
 * Optional:
 *   RADAR_BOLAGSVERKET_PATH – JSON extract for company import
 *   RADAR_WEBANALYZE_BIN – path to webanalyze binary
 */

const baseUrl = (process.env.RADAR_WORKER_URL || "").replace(/\/$/, "");
const apiKey = process.env.RADAR_WORKER_API_KEY || "";

if (!baseUrl) {
  console.error("RADAR_WORKER_URL is required");
  process.exit(1);
}
if (!apiKey) {
  console.error("RADAR_WORKER_API_KEY is required");
  process.exit(1);
}

const res = await fetch(`${baseUrl}/api/radar/jobs/run`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ enqueueScheduled: true }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`Worker tick failed (${res.status}): ${text}`);
  process.exit(1);
}

console.log(text);
