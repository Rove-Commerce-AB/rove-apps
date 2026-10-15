"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, IconButton } from "@/components/ui";

type Props = {
  email: string;
  temporaryPassword: string;
  onDone: () => void;
  title?: string;
};

export function TemporaryPasswordReveal({
  email,
  temporaryPassword,
  onDone,
  title = "Temporary password",
}: Props) {
  const [copied, setCopied] = useState(false);

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Copy this password and share it with <strong>{email}</strong> out of
          band. It will not be shown again. They must change it on first login.
        </p>
      </div>
      <div className="flex items-center gap-1 rounded-lg border border-form bg-bg-muted/40 py-2 pl-3 pr-1.5">
        <p className="min-w-0 flex-1 font-mono text-base tracking-wide text-text-primary break-all">
          {temporaryPassword}
        </p>
        <IconButton
          aria-label={copied ? "Copied" : "Copy password"}
          title={copied ? "Copied" : "Copy to clipboard"}
          onClick={() => void copyPassword()}
        >
          {copied ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
        </IconButton>
      </div>
      <div className="flex justify-end">
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
