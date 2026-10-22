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
    ],
    subject: impersonateEmail(),
  });
  return cachedJwt;
}

async function gmailFetch<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string> }
): Promise<T> {
  const client = getJwt();
  const url = new URL(`${GMAIL_API}${path}`);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      url.searchParams.set(k, v);
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
  // Only new/unread mail; already-read inbox noise must not become cases.
  const q = `in:inbox is:unread -label:"${label}"`;
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
  };
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
