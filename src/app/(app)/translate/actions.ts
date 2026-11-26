"use server";

import {
  getCurrentTranslationLang,
  setCurrentTranslationLang,
  translateDraftToEnglish,
  translateTextForCurrentUser,
} from "@/lib/translateText";
import {
  isTranslationLang,
  type TranslationLang,
} from "@/lib/translationLang";

type OkTranslate = {
  ok: true;
  translatedText: string;
  targetLang: TranslationLang;
  detectedSourceLanguage: string | null;
  fromCache: boolean;
  skipped: boolean;
};
type Err = { ok: false; error: string };

function fail(error: unknown): Err {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Translation failed",
  };
}

export async function translateTextAction(
  text: string,
  targetLang?: TranslationLang
): Promise<OkTranslate | Err> {
  try {
    const result = await translateTextForCurrentUser({
      text,
      targetLang,
    });
    return { ok: true, ...result };
  } catch (error) {
    return fail(error);
  }
}

export async function translateDraftToEnglishAction(
  text: string
): Promise<OkTranslate | Err> {
  try {
    const result = await translateDraftToEnglish(text);
    return { ok: true, ...result };
  } catch (error) {
    return fail(error);
  }
}

export async function getTranslationLangAction(): Promise<
  { ok: true; lang: TranslationLang } | Err
> {
  try {
    const lang = await getCurrentTranslationLang();
    return { ok: true, lang };
  } catch (error) {
    return fail(error);
  }
}

export async function setTranslationLangAction(
  lang: string
): Promise<{ ok: true; lang: TranslationLang } | Err> {
  try {
    if (!isTranslationLang(lang)) {
      return { ok: false, error: "Invalid language" };
    }
    const saved = await setCurrentTranslationLang(lang);
    return { ok: true, lang: saved };
  } catch (error) {
    return fail(error);
  }
}
