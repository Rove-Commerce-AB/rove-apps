import "server-only";

import { readFileSync } from "node:fs";
import { JWT } from "google-auth-library";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const DEFAULT_LABEL = "Rove case";
const DEFAULT_IMPERSONATE = "support@rove.se";

export type GmailListedMessage = {
  id: string;
  threadId: string;
};

export type GmailParsedMessage = {
  id: string;
  threadId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  snippet: string;
  bodyText: string;
  receivedAt: Date | null;
  permalink: string;
  /** True when Auto-Submitted / list-mail headers say not to auto-reply. */
  suppressAutoReply: boolean;
};

type SaKey = {
  client_email: string;
  private_key: string;
};

function loadSaKey(): SaKey {
  const json = process.env.GMAIL_SUPPORT_SA_JSON?.trim();
  if (json) {
    return JSON.parse(json) as SaKey;
  }
  const path = process.env.GMAIL_SUPPORT_SA_KEY_PATH?.trim();
  if (!path) {
    throw new Error(
      "Set GMAIL_SUPPORT_SA_KEY_PATH or GMAIL_SUPPORT_SA_JSON for Support mail sync"
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as SaKey;
}

function impersonateEmail(): string {
  return (
    process.env.GMAIL_SUPPORT_IMPERSONATE?.trim() || DEFAULT_IMPERSONATE
  );
}

export function supportMailLabelName(): string {
  return process.env.GMAIL_SUPPORT_LABEL?.trim() || DEFAULT_LABEL;
}

let cachedJwt: JWT | null = null;

function getJwt(): JWT {
  if (cachedJwt) return cachedJwt;
  const key = loadSaKey();
  cachedJwt = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    subject: impersonateEmail(),
  });
  return cachedJwt;
}

export function supportMailboxAddress(): string {
  return impersonateEmail();
}

async function gmailFetch<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string | string[]> }
): Promise<T> {
  const client = getJwt();
  const url = new URL(`${GMAIL_API}${path}`);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, item);
      } else {
        url.searchParams.set(k, v);
      }
    }
  }
  const res = await client.request<T>({
    url: url.toString(),
    method: init?.method ?? "GET",
    data: init?.body ? JSON.parse(String(init.body)) : undefined,
    headers: init?.headers as Record<string, string> | undefined,
  });
  return res.data as T;
}

function headerValue(
  headers: { name?: string; value?: string }[] | undefined,
  name: string
): string {
  const lower = name.toLowerCase();
  return (
    headers?.find((h) => (h.name ?? "").toLowerCase() === lower)?.value?.trim() ??
    ""
  );
}

/** Parse `Name <email@x>` or bare email. */
export function parseFromHeader(raw: string): {
  email: string;
  name: string | null;
} {
  const trimmed = raw.trim();
  const angle = trimmed.match(/^(.*)<([^>]+)>\s*$/);
  if (angle) {
    const email = angle[2].trim().toLowerCase();
    const name = angle[1].replace(/^"|"$/g, "").trim() || null;
    return { email, name };
  }
  return { email: trimmed.toLowerCase(), name: null };
}

function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

type GmailPart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};

function collectTextParts(part: GmailPart | undefined, out: string[]): void {
  if (!part) return;
  const mime = (part.mimeType ?? "").toLowerCase();
  if (mime === "text/plain" && part.body?.data) {
    out.push(decodeBase64Url(part.body.data));
    return;
  }
  if (part.parts) {
    for (const child of part.parts) collectTextParts(child, out);
  }
}

function extractBodyText(payload: GmailPart | undefined, snippet: string): string {
  const texts: string[] = [];
  collectTextParts(payload, texts);
  const joined = texts.join("\n\n").trim();
  if (joined) return joined.slice(0, 20_000);
  return snippet.trim().slice(0, 20_000);
}

export async function listUnprocessedInboxMessages(input?: {
  maxResults?: number;
}): Promise<GmailListedMessage[]> {
  const label = supportMailLabelName();
  // Inbox without the processed label. Read state must not block ingest
  // (staff often open mail in Gmail before sync runs).
  const q = `in:inbox -label:"${label}"`;
  const data = await gmailFetch<{
    messages?: { id: string; threadId: string }[];
  }>("/messages", {
    query: {
      q,
      maxResults: String(input?.maxResults ?? 25),
    },
  });
  return (data.messages ?? []).map((m) => ({
    id: m.id,
    threadId: m.threadId,
  }));
}

export async function getGmailMessage(
  messageId: string
): Promise<GmailParsedMessage> {
  const data = await gmailFetch<{
    id: string;
    threadId: string;
    snippet?: string;
    internalDate?: string;
    payload?: GmailPart & {
      headers?: { name?: string; value?: string }[];
    };
  }>(`/messages/${encodeURIComponent(messageId)}`, {
    query: { format: "full" },
  });

  const headers = data.payload?.headers;
  const fromRaw = headerValue(headers, "From");
  const { email, name } = parseFromHeader(fromRaw);
  const subject = headerValue(headers, "Subject") || "(no subject)";
  const snippet = data.snippet ?? "";
  const receivedAt = data.internalDate
    ? new Date(Number(data.internalDate))
    : null;

  return {
    id: data.id,
    threadId: data.threadId,
    fromEmail: email,
    fromName: name,
    subject,
    snippet,
    bodyText: extractBodyText(data.payload, snippet),
    receivedAt,
    permalink: `https://mail.google.com/mail/u/0/#inbox/${data.threadId}`,
    suppressAutoReply: shouldSuppressAutoReply(headers),
  };
}

/** RFC 3834 / list-mail: do not send vacation-style auto replies. */
function shouldSuppressAutoReply(
  headers: { name?: string; value?: string }[] | undefined
): boolean {
  const autoSubmitted = headerValue(headers, "Auto-Submitted").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;

  const precedence = headerValue(headers, "Precedence").toLowerCase();
  if (
    precedence === "bulk" ||
    precedence === "list" ||
    precedence === "junk"
  ) {
    return true;
  }

  const listId = headerValue(headers, "List-Id");
  if (listId.trim()) return true;

  return false;
}

async function listLabels(): Promise<{ id: string; name: string }[]> {
  const data = await gmailFetch<{
    labels?: { id: string; name: string }[];
  }>("/labels");
  return data.labels ?? [];
}

export async function ensureSupportMailLabelId(): Promise<string> {
  const name = supportMailLabelName();
  const existing = (await listLabels()).find(
    (l) => l.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) return existing.id;

  const created = await gmailFetch<{ id: string }>("/labels", {
    method: "POST",
    body: JSON.stringify({
      name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
    headers: { "Content-Type": "application/json" },
  });
  return created.id;
}

export async function applySupportMailLabel(
  messageId: string,
  labelId: string
): Promise<void> {
  await gmailFetch(`/messages/${encodeURIComponent(messageId)}/modify`, {
    method: "POST",
    body: JSON.stringify({
      addLabelIds: [labelId],
    }),
    headers: { "Content-Type": "application/json" },
  });
}

function encodeBase64Url(value: string | Buffer): string {
  const buf = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encodeMimeFileName(fileName: string): string {
  const cleaned = fileName.replace(/[\r\n"]/g, "_").trim() || "file";
  if (/^[\x20-\x7E]*$/.test(cleaned)) return cleaned;
  return `=?UTF-8?B?${Buffer.from(cleaned, "utf8").toString("base64")}?=`;
}

export type GmailOutgoingAttachment = {
  fileName: string;
  mimeType: string;
  content: Buffer;
};

function buildRawMimeMessage(input: {
  from: string;
  to: string;
  subjectHeader: string;
  bodyText: string;
  extraHeaders: string[];
  attachments: GmailOutgoingAttachment[];
}): Buffer {
  const body = input.bodyText.replace(/\r\n/g, "\n").trim();
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subjectHeader}`,
    "MIME-Version: 1.0",
    ...input.extraHeaders,
  ];

  if (input.attachments.length === 0) {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    headers.push("Content-Transfer-Encoding: 8bit");
    return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}\r\n`, "utf8");
  }

  const boundary = `rove_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const chunks: Buffer[] = [
    Buffer.from(`${headers.join("\r\n")}\r\n\r\n`, "utf8"),
    Buffer.from(
      `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body}\r\n`,
      "utf8"
    ),
  ];

  for (const file of input.attachments) {
    const mime = (file.mimeType || "application/octet-stream").replace(
      /[\r\n]/g,
      ""
    );
    const name = encodeMimeFileName(file.fileName);
    const asciiName =
      file.fileName
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .replace(/[^\x20-\x7E]/g, "_")
        .replace(/"/g, "") || "file";
    const b64 = file.content.toString("base64");
    const wrapped = b64.replace(/(.{76})/g, "$1\r\n").replace(/\r\n$/g, "");
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Type: ${mime}; name="${asciiName}"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${asciiName}"${
          name !== asciiName ? `; filename*=UTF-8''${encodeURIComponent(file.fileName.trim() || "file")}` : ""
        }\r\n\r\n${wrapped}\r\n`,
        "utf8"
      )
    );
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return Buffer.concat(chunks);
}

function encodeHeaderWord(value: string): string {
  // Keep ASCII subjects plain; encode the rest as RFC 2047 UTF-8.
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Fetch RFC Message-ID (and friends) for threading a reply. */
export async function getGmailMessageHeaders(messageId: string): Promise<{
  messageIdHeader: string | null;
  subject: string;
  fromEmail: string;
  references: string | null;
}> {
  const data = await gmailFetch<{
    payload?: { headers?: { name?: string; value?: string }[] };
  }>(`/messages/${encodeURIComponent(messageId)}`, {
    query: {
      format: "metadata",
      metadataHeaders: [
        "Message-ID",
        "Subject",
        "From",
        "References",
        "In-Reply-To",
      ],
    },
  });
  const headers = data.payload?.headers;
  const messageIdHeader = headerValue(headers, "Message-ID") || null;
  const subject = headerValue(headers, "Subject") || "(no subject)";
  const fromRaw = headerValue(headers, "From");
  const { email } = parseFromHeader(fromRaw);
  const references = headerValue(headers, "References") || null;
  return { messageIdHeader, subject, fromEmail: email, references };
}

/**
 * Send a reply into an existing Gmail thread as support@.
 * Optional image/video (or other) attachments use multipart/mixed.
 * Requires domain-wide delegation scope `gmail.send` for the impersonated mailbox.
 */
export async function sendGmailThreadReply(input: {
  threadId: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  inReplyToMessageId?: string | null;
  references?: string | null;
  /** Set on automatic acknowledgements (RFC 3834). */
  autoSubmitted?: "auto-replied" | "auto-generated" | null;
  attachments?: GmailOutgoingAttachment[];
}): Promise<{ id: string; threadId: string }> {
  const from = impersonateEmail();
  const to = input.toEmail.trim().toLowerCase();
  if (!to.includes("@")) throw new Error("Invalid reply recipient");

  const subject = input.subject.trim() || "(no subject)";
  const replySubject = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
  const body = input.bodyText.replace(/\r\n/g, "\n").trim();
  if (!body) throw new Error("Reply body is required");

  const extraHeaders: string[] = [];
  if (input.autoSubmitted) {
    extraHeaders.push(`Auto-Submitted: ${input.autoSubmitted}`);
    extraHeaders.push("X-Auto-Response-Suppress: All");
  }
  if (input.inReplyToMessageId) {
    extraHeaders.push(`In-Reply-To: ${input.inReplyToMessageId}`);
    const refs = [input.references, input.inReplyToMessageId]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (refs) extraHeaders.push(`References: ${refs}`);
  }

  const raw = buildRawMimeMessage({
    from,
    to,
    subjectHeader: encodeHeaderWord(replySubject),
    bodyText: body,
    extraHeaders,
    attachments: input.attachments ?? [],
  });
  const encoded = encodeBase64Url(raw);

  const sent = await gmailFetch<{ id: string; threadId: string }>("/messages/send", {
    method: "POST",
    body: JSON.stringify({
      raw: encoded,
      threadId: input.threadId,
    }),
    headers: { "Content-Type": "application/json" },
  });

  return { id: sent.id, threadId: sent.threadId || input.threadId };
}
