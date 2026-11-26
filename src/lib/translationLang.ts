export const TRANSLATION_LANGS = ["en", "pl", "sv"] as const;

export type TranslationLang = (typeof TRANSLATION_LANGS)[number];

export const TRANSLATION_LANG_LABELS: Record<TranslationLang, string> = {
  en: "English",
  pl: "Polish",
  sv: "Swedish",
};

export const DEFAULT_TRANSLATION_LANG: TranslationLang = "en";
/** Outgoing draft language (comment / support compose → English). */
export const DRAFT_TRANSLATION_LANG: TranslationLang = "en";

export function parseTranslationLang(
  value: string | null | undefined
): TranslationLang {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "en" ||
    normalized === "pl" ||
    normalized === "sv"
  ) {
    return normalized;
  }
  return DEFAULT_TRANSLATION_LANG;
}

export function isTranslationLang(value: string): value is TranslationLang {
  return (TRANSLATION_LANGS as readonly string[]).includes(value);
}
