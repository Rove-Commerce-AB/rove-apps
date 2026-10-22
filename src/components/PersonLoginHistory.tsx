"use client";

import { useEffect, useState } from "react";
import {
  getCustomerLoginHistoryAction,
  type CustomerLoginHistoryResult,
} from "@/lib/appUserLoginHistoryActions";
import { formatWorkTimestamp } from "@/lib/workTimeAgo";

function shortenUserAgent(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= 64) return trimmed;
  return `${trimmed.slice(0, 61)}…`;
}

export function PersonLoginHistory({ appUserId }: { appUserId: string }) {
  const [data, setData] = useState<CustomerLoginHistoryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getCustomerLoginHistoryAction(appUserId)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          setData(null);
          return;
        }
        setData(result);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load login history");
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appUserId]);

  return (
    <section className="mt-8 border-t border-border-subtle pt-6">
      <h2 className="text-sm font-medium text-text-primary">Login history</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Admin-only. Successful and failed password sign-ins.
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-text-secondary">Loading…</p>
      ) : error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-text-primary">
            Last successful login:{" "}
            <span className="tabular-nums text-text-secondary">
              {data?.lastLoginAt
                ? formatWorkTimestamp(data.lastLoginAt)
                : "Never"}
            </span>
          </p>

          {data && data.events.length === 0 ? (
            <p className="mt-3 text-sm text-text-secondary">
              No login attempts recorded yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle">
              {data?.events.map((event) => {
                const ua = shortenUserAgent(event.userAgent);
                return (
                  <li
                    key={event.id}
                    className="flex flex-col gap-0.5 px-3 py-2.5 text-sm"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className="tabular-nums text-text-primary">
                        {formatWorkTimestamp(event.occurredAt)}
                      </span>
                      <span
                        className={
                          event.success
                            ? "text-label-s text-success"
                            : "text-label-s text-danger"
                        }
                      >
                        {event.success ? "Success" : "Failed"}
                      </span>
                    </div>
                    <p className="text-label-s text-text-tertiary">
                      {[event.ip, ua].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
