import "server-only";

import { getCurrentAppUser } from "@/lib/appUsers";
import { googleTranslateText } from "@/lib/googleTranslate";
import {
  DRAFT_TRANSLATION_LANG,
  parseTranslationLang,
  type TranslationLang,
} from "@/lib/translationLang";
import {
  getAppUserTranslationLang,
  getCachedTranslation,
  putCachedTranslation,
  setAppUserTranslationLang,
  translationSourceHash,
} from "@/lib/translationCacheQueries";

const MAX_TRANSLATE_CHARS = 8000;

export type TranslateTextResult = {
  translatedText: string;
  targetLang: TranslationLang;
  detectedSourceLanguage: string | null;
  fromCache: boolean;
  /** True when source already matched target — returned original. */
  skipped: boolean;
};

function normalizeForTranslate(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

export async function translateTextForCurrentUser(input: {
  text: string;
  /** Override preferred reading language (e.g. draft → always en). */
  targetLang?: TranslationLang;
}): Promise<TranslateTextResult> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Unauthorized");

  const text = normalizeForTranslate(input.text);
  if (!text) {
    throw new Error("Nothing to translate");
  }
  if (text.length > MAX_TRANSLATE_CHARS) {
    throw new Error(
      `Text is too long to translate (max ${MAX_TRANSLATE_CHARS} characters).`
    );
  }

  const targetLang =
    input.targetLang ?? (await getAppUserTranslationLang(user.id));

  const sourceHash = translationSourceHash(text);
  const cached = await getCachedTranslation(sourceHash, targetLang);
  if (cached) {
    const detected = cached.sourceLang?.toLowerCase() ?? null;
    if (detected && detected.startsWith(targetLang)) {
      return {
        translatedText: text,
        targetLang,
        detectedSourceLanguage: detected,
        fromCache: true,
        skipped: true,
      };
    }
    return {
      translatedText: cached.translatedText,
      targetLang,
      detectedSourceLanguage: cached.sourceLang,
      fromCache: true,
      skipped: false,
    };
  }

  const result = await googleTranslateText({ text, targetLang });
  const detected = result.detectedSourceLanguage?.toLowerCase() ?? null;
  if (detected && detected.startsWith(targetLang)) {
    await putCachedTranslation({
      sourceHash,
      targetLang,
      sourceLang: detected,
      translatedText: text,
    });
    return {
      translatedText: text,
      targetLang,
      detectedSourceLanguage: detected,
      fromCache: false,
      skipped: true,
    };
  }

  await putCachedTranslation({
    sourceHash,
    targetLang,
    sourceLang: detected,
    translatedText: result.translatedText,
  });

  return {
    translatedText: result.translatedText,
    targetLang,
    detectedSourceLanguage: detected,
    fromCache: false,
    skipped: false,
  };
}

export async function translateDraftToEnglish(
  text: string
): Promise<TranslateTextResult> {
  return translateTextForCurrentUser({
    text,
    targetLang: DRAFT_TRANSLATION_LANG,
  });
}

export async function getCurrentTranslationLang(): Promise<TranslationLang> {
  const user = await getCurrentAppUser();
  if (!user) return parseTranslationLang(null);
  return getAppUserTranslationLang(user.id);
}

export async function setCurrentTranslationLang(
  lang: TranslationLang
): Promise<TranslationLang> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Unauthorized");
  await setAppUserTranslationLang(user.id, lang);
  return lang;
}
