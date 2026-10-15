"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button, Input, Panel } from "@/components/ui";

function LoginForm() {
  const searchParams = useSearchParams();
  const authError = searchParams.get("error") === "auth";
  const credentialsError =
    searchParams.get("error") === "CredentialsSignin" ||
    searchParams.get("error") === "credentials";
  const passwordUpdated = searchParams.get("passwordUpdated") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"google" | "password" | null>(null);

  async function signInWithGoogle() {
    setBusy("google");
    try {
      await signIn("google", { callbackUrl: "/" });
    } finally {
      setBusy(null);
    }
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy("password");
    try {
      await signIn("customer-password", {
        email: email.trim(),
        password,
        callbackUrl: "/",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6">
      <Panel className="w-full max-w-sm p-8">
        <h1 className="text-heading-m text-text-primary">
          Log in to Rove Apps
        </h1>
        {passwordUpdated && (
          <p className="mt-4 text-sm text-text-primary opacity-80">
            Password updated. Sign in with your new password.
          </p>
        )}
        {(authError || credentialsError) && (
          <p className="mt-4 text-sm text-danger">
            Sign-in failed. Please try again.
          </p>
        )}

        <section className="mt-6">
          <h2 className="text-sm font-medium text-text-primary">Rove users</h2>
          <Button
            type="button"
            onClick={signInWithGoogle}
            className="mt-3 w-full"
            disabled={busy !== null}
          >
            {busy === "google" ? "Redirecting…" : "Log in with Google"}
          </Button>
        </section>

        <div className="my-6 border-t border-form" />

        <section>
          <h2 className="text-sm font-medium text-text-primary">
            Customer login
          </h2>
          <form onSubmit={signInWithPassword} className="mt-3 space-y-3">
            <Input
              id="login-email"
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={busy !== null}
            />
            <Input
              id="login-password"
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={busy !== null}
            />
            <Button
              type="submit"
              variant="secondary"
              className="w-full"
              disabled={busy !== null || !email.trim() || !password}
            >
              {busy === "password" ? "Signing in…" : "Log in"}
            </Button>
          </form>
        </section>
      </Panel>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center p-6 text-text-primary opacity-70">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
