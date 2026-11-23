/**
 * Create / configure the Work files GCS bucket (private + CORS for signed uploads).
 *
 * Usage:
 *   node scripts/setup-work-files-gcs.mjs
 *   node scripts/setup-work-files-gcs.mjs --bucket=rove-work-files-prod
 *
 * Defaults project continual-mind-442414-e0, region europe-north2.
 */
import { Storage } from "@google-cloud/storage";

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT?.trim() || "continual-mind-442414-e0";
const LOCATION = process.env.WORK_FILES_GCS_LOCATION?.trim() || "europe-north2";

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

async function main() {
  const bucketName =
    argValue("bucket", null) ||
    process.env.WORK_FILES_GCS_BUCKET?.trim() ||
    "rove-work-files";

  const storage = new Storage({ projectId: PROJECT });
  const bucket = storage.bucket(bucketName);
  const [exists] = await bucket.exists();
  if (!exists) {
    console.log(`Creating bucket gs://${bucketName} in ${LOCATION}…`);
    await storage.createBucket(bucketName, {
      location: LOCATION,
      uniformBucketLevelAccess: true,
      publicAccessPrevention: "enforced",
      versioning: { enabled: false },
    });
  } else {
    console.log(`Bucket gs://${bucketName} already exists`);
  }

  await bucket.setCorsConfiguration([
    {
      maxAgeSeconds: 3600,
      method: ["PUT", "GET", "HEAD", "OPTIONS"],
      origin: [
        "https://apps.rove.se",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ],
      responseHeader: ["Content-Type", "Content-Length", "x-goog-resumable"],
    },
  ]);
  console.log("CORS configured for apps.rove.se + localhost");

  // Keep objects private; app SA needs objectAdmin / objectUser.
  console.log(`
Next:
  1. Grant the Cloud Run runtime SA roles/storage.objectAdmin on the bucket
     (or roles/storage.objectUser + create permission).
  2. Grant the same SA roles/iam.serviceAccountTokenCreator on itself
     (required for V4 signed URLs via signBlob).
  3. Set WORK_FILES_GCS_BUCKET=${bucketName} on Cloud Run / .env.local
  4. Run scripts/20261123_work_issue_files_gcs.sql
  5. Run: node scripts/migrate-work-files-to-gcs.mjs
`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
