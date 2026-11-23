import "server-only";

import { Storage, type Bucket } from "@google-cloud/storage";
import { GoogleAuth, Impersonated } from "google-auth-library";
import { Readable } from "node:stream";

const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;
const DEFAULT_GCP_PROJECT = "continual-mind-442414-e0";
/** Used to mint V4 signed URLs when local ADC is a user login (no client_email). */
const DEFAULT_SIGNING_SA =
  "716231934728-compute@developer.gserviceaccount.com";

let storageClient: Storage | null = null;
let signingStorageClient: Storage | null = null;
let signingStoragePromise: Promise<Storage> | null = null;

export function workFilesBucketName(): string | null {
  const name = process.env.WORK_FILES_GCS_BUCKET?.trim();
  return name || null;
}

export function isWorkFilesGcsEnabled(): boolean {
  return workFilesBucketName() != null;
}

function gcpProjectId(): string {
  return (
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    process.env.GCP_PROJECT?.trim() ||
    DEFAULT_GCP_PROJECT
  );
}

function getStorage(): Storage {
  if (!storageClient) {
    storageClient = new Storage({ projectId: gcpProjectId() });
  }
  return storageClient;
}

async function getSigningStorage(): Promise<Storage> {
  if (signingStorageClient) return signingStorageClient;
  if (signingStoragePromise) return signingStoragePromise;

  signingStoragePromise = (async () => {
    const projectId = gcpProjectId();
    const targetSa =
      process.env.WORK_FILES_SIGNING_SA?.trim() || DEFAULT_SIGNING_SA;
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const sourceClient = await auth.getClient();
    const email =
      "email" in sourceClient && typeof sourceClient.email === "string"
        ? sourceClient.email
        : null;
    // Cloud Run SA (or any key with client_email) can sign directly.
    if (email) {
      signingStorageClient = new Storage({
        projectId,
        authClient: sourceClient,
      });
      return signingStorageClient;
    }
    // Local user ADC: impersonate the runtime SA (needs TokenCreator on that SA).
    const impersonated = new Impersonated({
      sourceClient,
      targetPrincipal: targetSa,
      lifetime: 3600,
      delegates: [],
      targetScopes: [
        "https://www.googleapis.com/auth/devstorage.full_control",
        "https://www.googleapis.com/auth/iam",
      ],
    });
    signingStorageClient = new Storage({
      projectId,
      authClient: impersonated,
    });
    return signingStorageClient;
  })();

  try {
    return await signingStoragePromise;
  } catch (error) {
    signingStoragePromise = null;
    throw error;
  }
}

function getBucket(): Bucket {
  const name = workFilesBucketName();
  if (!name) {
    throw new Error("WORK_FILES_GCS_BUCKET is not configured");
  }
  return getStorage().bucket(name);
}

/** Object path: work/{issueId}/{fileId}/{safeFileName} */
export function buildWorkFileStorageKey(
  issueId: string,
  fileId: string,
  fileName: string
): string {
  const safe = fileName.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 180) || "file";
  return `work/${issueId}/${fileId}/${safe}`;
}

export async function uploadWorkFileBytes(input: {
  storageKey: string;
  bytes: Buffer;
  mimeType: string;
}): Promise<void> {
  const file = getBucket().file(input.storageKey);
  await file.save(input.bytes, {
    resumable: false,
    contentType: input.mimeType || "application/octet-stream",
    metadata: {
      cacheControl: "private, max-age=0",
    },
  });
}

export async function createWorkFileSignedUploadUrl(input: {
  storageKey: string;
  mimeType: string;
  byteSize: number;
}): Promise<string> {
  void input.byteSize; // validated by caller before issuing the URL
  const storage = await getSigningStorage();
  const bucketName = workFilesBucketName();
  if (!bucketName) {
    throw new Error("WORK_FILES_GCS_BUCKET is not configured");
  }
  const file = storage.bucket(bucketName).file(input.storageKey);
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + UPLOAD_URL_TTL_MS,
    contentType: input.mimeType || "application/octet-stream",
  });
  return url;
}

export async function downloadWorkFileBytes(storageKey: string): Promise<Buffer> {
  const file = getBucket().file(storageKey);
  const [buf] = await file.download();
  return buf;
}

export function openWorkFileReadStream(storageKey: string): Readable {
  return getBucket().file(storageKey).createReadStream();
}

export async function deleteWorkFileObject(storageKey: string): Promise<void> {
  try {
    await getBucket().file(storageKey).delete({ ignoreNotFound: true });
  } catch (error) {
    // Best-effort: DB row is source of truth for UX; log orphans separately.
    console.warn("[work-files] GCS delete failed", storageKey, error);
  }
}

export async function workFileObjectExists(storageKey: string): Promise<boolean> {
  const [exists] = await getBucket().file(storageKey).exists();
  return exists;
}
