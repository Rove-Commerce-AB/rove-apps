import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { Readable } from "node:stream";
import {
  buildWorkFileStorageKey,
  createWorkFileSignedUploadUrl,
  deleteWorkFileObject,
  downloadWorkFileBytes,
  isWorkFilesGcsEnabled,
  openWorkFileReadStream,
  uploadWorkFileBytes,
} from "@/lib/workFilesStorage";
import {
  deleteWorkIssueFile,
  insertWorkIssueFile,
} from "@/lib/workIssuesQueries";
import { WORK_FILE_MAX_BYTES, WORK_FILE_MAX_LABEL } from "@/lib/workTypes";

export { WORK_FILE_MAX_BYTES, WORK_FILE_MAX_LABEL, isWorkFilesGcsEnabled };

export function workFileTooLargeMessage(): string {
  return `File must be ${WORK_FILE_MAX_LABEL} or smaller`;
}

export function workFileEachTooLargeMessage(): string {
  return `Each attachment must be ${WORK_FILE_MAX_LABEL} or smaller`;
}

export type WorkFileDownloadRow = {
  id: string;
  issue_id: string;
  project_id: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  content: Buffer | null;
  storage_key: string | null;
};

/** Persist bytes to GCS (when configured) or legacy BYTEA. */
export async function persistWorkIssueFileBytes(input: {
  id?: string;
  issueId: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  uploadedByAppUserId: string;
  client?: PoolClient;
}): Promise<string> {
  if (input.bytes.byteLength <= 0) throw new Error("File is empty");
  if (input.bytes.byteLength > WORK_FILE_MAX_BYTES) {
    throw new Error(workFileTooLargeMessage());
  }

  const fileId = input.id ?? randomUUID();
  if (isWorkFilesGcsEnabled()) {
    const storageKey = buildWorkFileStorageKey(
      input.issueId,
      fileId,
      input.fileName
    );
    await uploadWorkFileBytes({
      storageKey,
      bytes: input.bytes,
      mimeType: input.mimeType,
    });
    try {
      return await insertWorkIssueFile(
        {
          id: fileId,
          issueId: input.issueId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          byteSize: input.bytes.byteLength,
          content: null,
          storageKey,
          uploadedByAppUserId: input.uploadedByAppUserId,
        },
        input.client
      );
    } catch (error) {
      await deleteWorkFileObject(storageKey);
      throw error;
    }
  }

  return insertWorkIssueFile(
    {
      id: input.id,
      issueId: input.issueId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      byteSize: input.bytes.byteLength,
      content: input.bytes,
      storageKey: null,
      uploadedByAppUserId: input.uploadedByAppUserId,
    },
    input.client
  );
}

export async function beginSignedWorkFileUpload(input: {
  issueId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  uploadedByAppUserId: string;
}): Promise<
  | { mode: "legacy" }
  | {
      mode: "signed";
      fileId: string;
      uploadUrl: string;
      contentType: string;
    }
> {
  if (input.byteSize <= 0) throw new Error("File is empty");
  if (input.byteSize > WORK_FILE_MAX_BYTES) {
    throw new Error(workFileTooLargeMessage());
  }
  if (!isWorkFilesGcsEnabled()) {
    return { mode: "legacy" };
  }

  const fileId = randomUUID();
  const contentType = input.mimeType || "application/octet-stream";
  const storageKey = buildWorkFileStorageKey(
    input.issueId,
    fileId,
    input.fileName
  );
  await insertWorkIssueFile({
    id: fileId,
    issueId: input.issueId,
    fileName: input.fileName,
    mimeType: contentType,
    byteSize: input.byteSize,
    content: null,
    storageKey,
    uploadedByAppUserId: input.uploadedByAppUserId,
  });
  try {
    const uploadUrl = await createWorkFileSignedUploadUrl({
      storageKey,
      mimeType: contentType,
      byteSize: input.byteSize,
    });
    return { mode: "signed", fileId, uploadUrl, contentType };
  } catch (error) {
    // Local user ADC often cannot mint V4 signed URLs (needs SA signBlob).
    // Roll back the pending row and let the client use FormData → server put.
    await deleteWorkIssueFile(input.issueId, fileId);
    await deleteWorkFileObject(storageKey);
    console.warn(
      "[work-files] signed upload unavailable, falling back to server upload",
      error instanceof Error ? error.message : error
    );
    return { mode: "legacy" };
  }
}

export async function resolveWorkFileBytes(
  file: WorkFileDownloadRow
): Promise<Buffer> {
  if (file.storage_key) {
    return downloadWorkFileBytes(file.storage_key);
  }
  if (file.content) return file.content;
  throw new Error("File has no content");
}

export function resolveWorkFileReadStream(file: WorkFileDownloadRow): {
  kind: "buffer";
  buffer: Buffer;
} | {
  kind: "stream";
  stream: Readable;
} {
  if (file.storage_key) {
    return { kind: "stream", stream: openWorkFileReadStream(file.storage_key) };
  }
  if (file.content) {
    return { kind: "buffer", buffer: file.content };
  }
  throw new Error("File has no content");
}

export async function deleteWorkFileStorage(
  storageKey: string | null | undefined
): Promise<void> {
  if (storageKey) await deleteWorkFileObject(storageKey);
}
