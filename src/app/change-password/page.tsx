"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";
import { Button, IconButton, Panel } from "@/components/ui";
import { changeOwnPassword } from "@/lib/customerPasswords";
import { PASSWORD_MIN_LENGTH } from "@/lib/passwords";

function PasswordField({
  id,
  label,
  value,
  onChange,
  disabled,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-sm font-medium text-text-primary"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={PASSWORD_MIN_LENGTH}
          disabled={disabled}
          className="box-border w-full rounded-lg border border-form bg-bg-default py-2 pl-3 pr-10 text-sm text-text-primary placeholder-text-muted focus:border-brand-signal focus:outline-none focus:ring-1 focus:ring-inset focus:ring-brand-signal disabled:opacity-50"
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          <IconButton
            type="button"
            aria-label={visible ? "Hide password" : "Show password"}
            title={visible ? "Hide password" : "Show password"}
            disabled={disabled}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? (
              <EyeOff className="h-4 w-4" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}
          </IconButton>
        </div>
      </div>
    </div>
  );
}

export default function ChangePasswordPage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const result = await changeOwnPassword({ newPassword });
      await signIn("customer-password", {
        email: result.email,
        password: newPassword,
        callbackUrl: "/",
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Failed to change password"
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6">
      <Panel className="w-full max-w-sm p-8">
        <h1 className="text-heading-m text-text-primary">
          Choose a new password
        </h1>
        <p className="mt-2 text-sm text-text-primary opacity-70">
          You must set a new password before continuing. Minimum{" "}
          {PASSWORD_MIN_LENGTH} characters.
        </p>
        {error ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <PasswordField
            id="new-password"
            label="New password"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
            disabled={busy}
          />
          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            disabled={busy}
          />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Save password and continue"}
          </Button>
        </form>
      </Panel>
    </div>
  );
}
