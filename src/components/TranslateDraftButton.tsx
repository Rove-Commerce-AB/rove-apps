"use client";

import { useState, useTransition } from "react";
import { Languages } from "lucide-react";
import { translateDraftToEnglishAction } from "@/app/(app)/translate/actions";

type Props = {
  text: string;
  disabled?: boolean;
  onTranslated: (english: string) => void;
  className?: string;
};

/** Replace draft in-place with English (comment / support compose). */
export function TranslateDraftButton({
  text,
  disabled = false,
  onTranslated,
  className = "",
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const empty = !text.trim();
  const label = pending ? "Translating…" : "Translate draft to English";

  return (
    <div className={`inline-flex items-center ${className}`.trim()}>
      <button
        type="button"
        disabled={disabled || pending || empty}
        title={label}
        aria-label={label}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-text-primary/[0.06] hover:text-text-secondary disabled:opacity-40"
        onClick={() => {
          if (empty) return;
          setError(null);
          startTransition(() => {
            void translateDraftToEnglishAction(text).then((result) => {
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onTranslated(result.translatedText);
            });
          });
        }}
      >
        <Languages className="h-3.5 w-3.5" aria-hidden />
      </button>
      {error ? (
        <span role="alert" className="ml-1 text-[11px] text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
