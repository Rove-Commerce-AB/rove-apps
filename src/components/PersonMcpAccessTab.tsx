"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { AppAccessList } from "@/components/AppAccessList";
import { Button, ConfirmModal, Input } from "@/components/ui";
import {
  generatePersonMcpToken,
  revealPersonMcpToken,
  revokePersonMcpToken,
  setPersonMcpAppAccess,
} from "@/lib/mcpAccess";
import { APP_KEYS, CUSTOMER_APP_KEYS, type AppKey, type PersonMcpAccess } from "@/lib/peopleTypes";

export function PersonMcpAccessTab({ appUserId, isCustomer, appKeys, initialAccess }: {
  appUserId: string;
  isCustomer: boolean;
  appKeys: AppKey[];
  initialAccess: PersonMcpAccess | null;
}) {
  const router = useRouter();
  const [access, setAccess] = useState(initialAccess);
  const [visibleToken, setVisibleToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<"generate" | "show" | "copy" | "revoke" | "apps" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timeout = setTimeout(() => setCopied(false), 2000);

    return () => clearTimeout(timeout);
  }, [copied]);

  async function generateToken() {
    if (busy) return;

    setBusy("generate");
    setError(null);

    try {
      await generatePersonMcpToken(appUserId);
      setAccess((current) => current ? { ...current, hasToken: true } : current);
      setVisibleToken(null);
      setCopied(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to generate token");
    } finally {
      setBusy(null);
    }
  }

  async function showToken() {
    if (busy) return;

    if (visibleToken) {
      setVisibleToken(null);
      return;
    }

    setBusy("show");
    setError(null);

    try {
      setVisibleToken(await revealPersonMcpToken(appUserId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to show token");
    } finally {
      setBusy(null);
    }
  }

  async function copyToken() {
    if (busy) return;

    setBusy("copy");
    setError(null);

    try {
      const token = visibleToken ?? await revealPersonMcpToken(appUserId);
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setError("Could not copy the token. Use Show to copy it manually.");
    } finally {
      setBusy(null);
    }
  }

  async function revokeToken() {
    if (busy) return;

    setBusy("revoke");
    setError(null);

    try {
      await revokePersonMcpToken(appUserId);
      setAccess((current) => current ? { ...current, hasToken: false } : current);
      setVisibleToken(null);
      setCopied(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to revoke token");
    } finally {
      setBusy(null);
    }
  }

  async function updateApps(next: AppKey[]) {
    if (busy || !access) return;

    const appKey = APP_KEYS.find((key) => next.includes(key) !== access.mcpAppKeys.includes(key));

    if (!appKey) return;

    const previous = access.mcpAppKeys;
    setAccess((current) => current ? { ...current, mcpAppKeys: next } : current);
    setBusy("apps");
    setError(null);

    try {
      await setPersonMcpAppAccess(appUserId, appKey, next.includes(appKey));
    } catch (cause) {
      setAccess((current) => current ? { ...current, mcpAppKeys: previous } : current);
      setError(cause instanceof Error ? cause.message : "Failed to update MCP access");
    } finally {
      setBusy(null);
    }
  }

  if (!access) {
    return (
      <div className="px-6 py-6">
        <p className="text-body-m text-danger" role="alert">Unable to load MCP access. Refresh to retry.</p>
        <Button type="button" variant="secondary" className="mt-4" onClick={() => router.refresh()}>
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 px-6 py-6">
      <section>
        <h3 className="text-heading-m text-text-primary">Access token</h3>
        <p className="mt-1 text-body-m text-text-secondary">Generate a token for this person to use with MCP clients.</p>
        {access.hasToken ? (
          <>
            <div className="mt-4 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  aria-label="MCP access token"
                  type={visibleToken ? "text" : "password"}
                  value={visibleToken ?? "************************"}
                  readOnly
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                />
              </div>
              <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void showToken()}>
                {visibleToken ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                {visibleToken ? "Hide" : "Show"}
              </Button>
              <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void copyToken()}>
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="mt-5 rounded-lg border border-danger/30 p-4">
              <h4 className="text-label-l text-danger">Danger zone</h4>
              <p className="mt-1 text-body-s text-text-secondary">Revoking this token removes MCP access for clients using it.</p>
              <Button
                type="button"
                variant="dangerSecondary"
                size="sm"
                className="mt-3"
                disabled={busy !== null}
                onClick={() => setConfirmRevoke(true)}
              >
                Revoke token
              </Button>
            </div>
          </>
        ) : (
          <Button type="button" className="mt-4" disabled={busy !== null} onClick={() => void generateToken()}>
            {busy === "generate" ? "Generating..." : "Generate token"}
          </Button>
        )}
      </section>
      <section>
        <h3 className="text-heading-m text-text-primary">Access to apps</h3>
        <p className="mt-1 text-body-m text-text-secondary">MCP access requires App access. Changes save automatically.</p>
        <div className="mt-6">
          <AppAccessList
            idPrefix={`person-mcp-apps-${appUserId}`}
            value={access.mcpAppKeys}
            onChange={(next) => void updateApps(next)}
            allowedKeys={isCustomer ? CUSTOMER_APP_KEYS : APP_KEYS}
            availableKeys={appKeys}
            description="MCP access"
            disabled={busy !== null}
          />
        </div>
      </section>
      {error ? <p className="text-body-m text-danger" role="alert">{error}</p> : null}
      <ConfirmModal
        isOpen={confirmRevoke}
        title="Revoke access token"
        message="Revoke this token? Clients using it will need a new token to access MCP."
        confirmLabel={busy === "revoke" ? "Revoking..." : "Revoke token"}
        onClose={() => setConfirmRevoke(false)}
        onConfirm={revokeToken}
      />
    </div>
  );
}
