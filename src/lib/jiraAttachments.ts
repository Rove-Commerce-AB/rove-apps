import "server-only";

import sharp from "sharp";
import { WORK_FILE_MAX_BYTES } from "@/lib/workTypes";

export type JiraAttachmentCredential = {
  host: string;
  email: string;
  apiToken: string;
};

export type PreparedJiraAttachment = {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
};

export type JiraAttachmentSkip = {
  attachmentId: string;
  fileName: string;
  reason: string;
};

function normalizeHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

/** Parse `JIRA_ATTACHMENT_INSTANCES` JSON env (same shape as jira-sync credentials). */
export function loadJiraAttachmentCredentials(
  envValue = process.env.JIRA_ATTACHMENT_INSTANCES
): JiraAttachmentCredential[] {
  if (!envValue?.trim()) return [];
  try {
    const parsed = JSON.parse(envValue) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: JiraAttachmentCredential[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const host = normalizeHost(String((row as { host?: unknown }).host ?? ""));
      const email = String((row as { email?: unknown }).email ?? "").trim();
      const apiToken = String(
        (row as { apiToken?: unknown; token?: unknown }).apiToken ??
          (row as { token?: unknown }).token ??
          ""
      ).trim();
      if (!host || !email || !apiToken) continue;
      out.push({ host, email, apiToken });
    }
    return out;
  } catch {
    return [];
  }
}

export function credentialForJiraLink(
  issueLink: string,
  credentials = loadJiraAttachmentCredentials()
): JiraAttachmentCredential | null {
  let host = "";
  try {
    host = normalizeHost(new URL(issueLink).host);
  } catch {
    return null;
  }
  if (!host) return null;
  return (
    credentials.find((c) => c.host === host) ??
    credentials.find((c) => host.endsWith(`.${c.host}`) || c.host.endsWith(`.${host}`)) ??
    null
  );
}

export function jiraAttachmentContentUrl(
  issueLink: string,
  attachmentId: string
): string | null {
  try {
    const url = new URL(issueLink);
    return `${url.origin}/rest/api/3/attachment/content/${encodeURIComponent(attachmentId)}`;
  } catch {
    return null;
  }
}

function isLikelyImage(fileName: string, mimeType: string): boolean {
  if (mimeType.toLowerCase().startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(fileName);
}

/**
 * Resize/compress images so they fit WORK_FILE_MAX_BYTES when possible.
 * Non-images are returned unchanged (caller enforces size).
 */
export async function prepareAttachmentBytes(
  raw: Buffer,
  fileName: string,
  mimeType: string
): Promise<
  | { ok: true; fileName: string; mimeType: string; content: Buffer }
  | { ok: false; reason: string }
> {
  if (!isLikelyImage(fileName, mimeType)) {
    if (raw.byteLength > WORK_FILE_MAX_BYTES) {
      return {
        ok: false,
        reason: `File exceeds ${WORK_FILE_MAX_BYTES} bytes and is not an image`,
      };
    }
    return {
      ok: true,
      fileName,
      mimeType: mimeType || "application/octet-stream",
      content: raw,
    };
  }

  try {
    let quality = 82;
    let width = 1920;
    let best: Buffer | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const out = await sharp(raw, { failOn: "none" })
        .rotate()
        .resize({
          width,
          height: width,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      best = out;
      if (out.byteLength <= WORK_FILE_MAX_BYTES) {
        const base = fileName.replace(/\.[^.]+$/, "") || "image";
        return {
          ok: true,
          fileName: `${base}.jpg`,
          mimeType: "image/jpeg",
          content: out,
        };
      }
      quality = Math.max(55, quality - 12);
      width = Math.max(1024, Math.round(width * 0.75));
    }
    if (best && best.byteLength <= WORK_FILE_MAX_BYTES) {
      const base = fileName.replace(/\.[^.]+$/, "") || "image";
      return {
        ok: true,
        fileName: `${base}.jpg`,
        mimeType: "image/jpeg",
        content: best,
      };
    }
    return {
      ok: false,
      reason: `Image still exceeds ${WORK_FILE_MAX_BYTES} bytes after compression`,
    };
  } catch (error) {
    if (raw.byteLength <= WORK_FILE_MAX_BYTES) {
      return {
        ok: true,
        fileName,
        mimeType: mimeType || "image/png",
        content: raw,
      };
    }
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `Could not compress image: ${error.message}`
          : "Could not compress image",
    };
  }
}

export async function downloadJiraAttachment(input: {
  issueLink: string;
  attachmentId: string;
  fileName: string;
  credentials?: JiraAttachmentCredential | null;
}): Promise<
  | { ok: true; prepared: PreparedJiraAttachment }
  | { ok: false; skip: JiraAttachmentSkip }
> {
  const credentials =
    input.credentials === undefined
      ? credentialForJiraLink(input.issueLink)
      : input.credentials;
  if (!credentials) {
    return {
      ok: false,
      skip: {
        attachmentId: input.attachmentId,
        fileName: input.fileName,
        reason:
          "No Jira credentials configured for this host (set JIRA_ATTACHMENT_INSTANCES)",
      },
    };
  }

  const url = jiraAttachmentContentUrl(input.issueLink, input.attachmentId);
  if (!url) {
    return {
      ok: false,
      skip: {
        attachmentId: input.attachmentId,
        fileName: input.fileName,
        reason: "Could not build attachment URL from issue link",
      },
    };
  }

  const auth = Buffer.from(
    `${credentials.email}:${credentials.apiToken}`,
    "utf8"
  ).toString("base64");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "*/*",
      },
      redirect: "follow",
    });
  } catch (error) {
    return {
      ok: false,
      skip: {
        attachmentId: input.attachmentId,
        fileName: input.fileName,
        reason:
          error instanceof Error
            ? `Download failed: ${error.message}`
            : "Download failed",
      },
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      skip: {
        attachmentId: input.attachmentId,
        fileName: input.fileName,
        reason: `Jira returned HTTP ${response.status}`,
      },
    };
  }

  const mimeType =
    response.headers.get("content-type")?.split(";")[0]?.trim() ||
    "application/octet-stream";
  const raw = Buffer.from(await response.arrayBuffer());
  const prepared = await prepareAttachmentBytes(raw, input.fileName, mimeType);
  if (!prepared.ok) {
    return {
      ok: false,
      skip: {
        attachmentId: input.attachmentId,
        fileName: input.fileName,
        reason: prepared.reason,
      },
    };
  }

  return {
    ok: true,
    prepared: {
      attachmentId: input.attachmentId,
      fileName: prepared.fileName,
      mimeType: prepared.mimeType,
      content: prepared.content,
    },
  };
}
