import "server-only";

import { createHash } from "node:crypto";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import {
  parseTranslationLang,
  type TranslationLang,
} from "@/lib/translationLang";

/** v2: line-preserving translate (invalidates earlier collapsed-line cache). */
export function translationSourceHash(text: string): string {
  return createHash("sha256").update(`v2\n${text}`, "utf8").digest("hex");
}

export async function getCachedTranslation(
  sourceHash: string,
  targetLang: TranslationLang
): Promise<{
  translatedText: string;
  sourceLang: string | null;
} | null> {
  const { rows } = await cloudSqlPool.query<{
    translated_text: string;
    source_lang: string | null;
  }>(
    `SELECT translated_text, source_lang
     FROM translation_cache
     WHERE source_hash = $1 AND target_lang = $2`,
    [sourceHash, targetLang]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    translatedText: row.translated_text,
    sourceLang: row.source_lang,
  };
}

export async function putCachedTranslation(input: {
  sourceHash: string;
  targetLang: TranslationLang;
  sourceLang: string | null;
  translatedText: string;
}): Promise<void> {
  await cloudSqlPool.query(
    `INSERT INTO translation_cache (
       source_hash, target_lang, source_lang, translated_text
     ) VALUES ($1, $2, $3, $4)
     ON CONFLICT (source_hash, target_lang) DO UPDATE
     SET translated_text = EXCLUDED.translated_text,
         source_lang = EXCLUDED.source_lang,
         created_at = now()`,
    [
      input.sourceHash,
      input.targetLang,
      input.sourceLang,
      input.translatedText,
    ]
  );
}

export async function getAppUserTranslationLang(
  appUserId: string
): Promise<TranslationLang> {
  const { rows } = await cloudSqlPool.query<{
    translation_lang: string | null;
  }>(`SELECT translation_lang FROM app_users WHERE id = $1`, [appUserId]);
  return parseTranslationLang(rows[0]?.translation_lang);
}

export async function setAppUserTranslationLang(
  appUserId: string,
  lang: TranslationLang
): Promise<void> {
  await cloudSqlPool.query(
    `UPDATE app_users SET translation_lang = $2 WHERE id = $1`,
    [appUserId, lang]
  );
}
