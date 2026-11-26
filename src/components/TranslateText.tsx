"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Languages } from "lucide-react";
import {
  getTranslationLangAction,
  setTranslationLangAction,
  translateTextAction,
} from "@/app/(app)/translate/actions";
import {
  TRANSLATION_LANG_LABELS,
  TRANSLATION_LANGS,
  type TranslationLang,
} from "@/lib/translationLang";

type Props = {
  text: string;
  className?: string;
  /** Render mode for the translated block. */
  as?: "pre" | "div";
};

/**
 * On-demand Translate under the original text (Work comments, Support mail, …).
 * Copy lets writers paste the result into the draft when needed.
 */
export function TranslateText({ text, className = "", as = "div" }: Props) {
  const plain = text.trim();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<TranslationLang>("en");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getTranslationLangAction().then((result) => {
      if (cancelled || !result.ok) return;
      setLang(result.lang);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setOpen(false);
    setTranslated(null);
    setSkipped(false);
    setError(null);
    setCopied(false);
  }, [plain]);

  if (!plain) return null;

  function runTranslate(nextLang?: TranslationLang) {
    const target = nextLang ?? lang;
    setError(null);
    setCopied(false);
    startTransition(() => {
      void translateTextAction(plain, target).then((result) => {
        if (!result.ok) {
          setError(result.error);
          setOpen(true);
          return;
        }
        setTranslated(result.translatedText);
        setSkipped(result.skipped);
        setLang(result.targetLang);
        setOpen(true);
      });
    });
  }

  async function copyTranslation() {
    if (!translated) return;
    try {
      await navigator.clipboard.writeText(translated);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  const TranslatedTag = as;
  const shown = open && translated != null;
  const label = pending
    ? "Translating…"
    : shown
      ? "Hide translation"
      : `Translate to ${TRANSLATION_LANG_LABELS[lang]}`;

  return (
    <div className={`mt-1 ${className}`.trim()}>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          disabled={pending}
          title={label}
          aria-label={label}
          aria-pressed={shown}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-text-primary/[0.06] hover:text-text-secondary disabled:opacity-50"
          onClick={() => {
            if (shown) {
              setOpen(false);
              return;
            }
            runTranslate();
          }}
        >
          <Languages className="h-3.5 w-3.5" aria-hidden />
        </button>
        <label className="inline-flex items-center">
          <span className="sr-only">Translation language</span>
          <select
            value={lang}
            disabled={pending}
            title="Translation language"
            className="h-6 rounded-md border-0 bg-transparent px-0.5 text-[11px] text-text-tertiary hover:text-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-signal/30 disabled:opacity-50"
            onChange={(event) => {
              const next = event.target.value as TranslationLang;
              setLang(next);
              startTransition(() => {
                void setTranslationLangAction(next).then((result) => {
                  if (result.ok) setLang(result.lang);
                });
              });
              if (open) runTranslate(next);
            }}
          >
            {TRANSLATION_LANGS.map((code) => (
              <option key={code} value={code}>
                {code.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-danger">
          {error}
        </p>
      ) : null}
      {shown ? (
        <TranslatedTag
          className={`mt-1.5 whitespace-pre-wrap rounded-md border border-border-subtle bg-bg-muted/50 px-2 py-1.5 text-[13px] leading-snug text-text-secondary ${
            as === "pre" ? "font-sans" : ""
          }`}
        >
          <span className="mb-1 flex items-center gap-1 text-[11px] text-text-tertiary">
            <span className="min-w-0 flex-1">
              {skipped
                ? `Already in ${TRANSLATION_LANG_LABELS[lang]}`
                : `Translated to ${TRANSLATION_LANG_LABELS[lang]}`}
            </span>
            <button
              type="button"
              title={copied ? "Copied" : "Copy translation"}
              aria-label={copied ? "Copied" : "Copy translation"}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-tertiary transition-colors hover:bg-text-primary/[0.06] hover:text-text-secondary"
              onClick={() => {
                void copyTranslation();
              }}
            >
              {copied ? (
                <Check className="h-3 w-3" aria-hidden />
              ) : (
                <Copy className="h-3 w-3" aria-hidden />
              )}
            </button>
          </span>
          {translated}
        </TranslatedTag>
      ) : null}
    </div>
  );
}
