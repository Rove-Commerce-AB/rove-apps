import "server-only";

import { GoogleAuth } from "google-auth-library";
import type { TranslationLang } from "@/lib/translationLang";

const CLOUD_PLATFORM_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform";

/** Max segments per Cloud Translation request. */
const TRANSLATE_BATCH = 40;

let googleAuth: GoogleAuth | null = null;

function gcpProjectId(): string {
  return (
    process.env.GCP_PROJECT_ID?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GCP_PROJECT?.trim() ||
    "continual-mind-442414-e0"
  );
}

function getGoogleAuth(): GoogleAuth {
  if (!googleAuth) {
    googleAuth = new GoogleAuth({
      scopes: [CLOUD_PLATFORM_SCOPE],
      // Local ADC user creds need an explicit quota project.
      projectId: gcpProjectId(),
      clientOptions: { quotaProjectId: gcpProjectId() },
    });
  }
  return googleAuth;
}

async function getAccessToken(): Promise<string> {
  const client = await getGoogleAuth().getClient();
  const result = await client.getAccessToken();
  const token = typeof result === "string" ? result : result?.token;
  if (!token) {
    throw new Error("Missing access token for Cloud Translation API");
  }
  return token;
}

export type GoogleTranslateResult = {
  translatedText: string;
  detectedSourceLanguage: string | null;
};

async function translateContents(input: {
  contents: string[];
  targetLang: TranslationLang;
}): Promise<{
  translations: Array<{
    translatedText: string;
    detectedLanguageCode: string | null;
  }>;
}> {
  if (input.contents.length === 0) {
    return { translations: [] };
  }

  const projectId = gcpProjectId();
  const url = `https://translate.googleapis.com/v3/projects/${encodeURIComponent(
    projectId
  )}:translateText`;
  const token = await getAccessToken();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-goog-user-project": projectId,
    },
    body: JSON.stringify({
      contents: input.contents,
      targetLanguageCode: input.targetLang,
      mimeType: "text/plain",
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Cloud Translation failed (${response.status})${
        detail ? `: ${detail.slice(0, 240)}` : ""
      }`
    );
  }

  const payload = (await response.json()) as {
    translations?: Array<{
      translatedText?: string;
      detectedLanguageCode?: string;
    }>;
  };
  const rows = payload.translations ?? [];
  if (rows.length !== input.contents.length) {
    throw new Error("Cloud Translation returned unexpected segment count");
  }
  return {
    translations: rows.map((row) => ({
      translatedText: row.translatedText ?? "",
      detectedLanguageCode: row.detectedLanguageCode?.trim() || null,
    })),
  };
}

/**
 * Cloud Translation API v3 (Neural).
 * Translates line-by-line so newlines / markdown line structure survive.
 */
export async function googleTranslateText(input: {
  text: string;
  targetLang: TranslationLang;
}): Promise<GoogleTranslateResult> {
  const text = input.text.replace(/\r\n/g, "\n").trim();
  if (!text) {
    return { translatedText: "", detectedSourceLanguage: null };
  }

  const lines = text.split("\n");
  const workIndexes: number[] = [];
  const workContents: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) {
      workIndexes.push(i);
      workContents.push(lines[i]);
    }
  }

  if (workContents.length === 0) {
    return { translatedText: text, detectedSourceLanguage: null };
  }

  const outLines = [...lines];
  let detectedSourceLanguage: string | null = null;

  for (let offset = 0; offset < workContents.length; offset += TRANSLATE_BATCH) {
    const batch = workContents.slice(offset, offset + TRANSLATE_BATCH);
    const { translations } = await translateContents({
      contents: batch,
      targetLang: input.targetLang,
    });
    for (let i = 0; i < translations.length; i++) {
      const row = translations[i];
      if (!detectedSourceLanguage && row.detectedLanguageCode) {
        detectedSourceLanguage = row.detectedLanguageCode;
      }
      const lineIndex = workIndexes[offset + i];
      const translated = row.translatedText;
      if (!translated.trim()) {
        throw new Error("Cloud Translation returned an empty result");
      }
      outLines[lineIndex] = translated;
    }
  }

  return {
    translatedText: outLines.join("\n"),
    detectedSourceLanguage,
  };
}
