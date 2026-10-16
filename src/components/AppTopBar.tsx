"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { breadcrumbsForPathname } from "@/lib/breadcrumbs";
import { useWorkTrail } from "@/components/WorkTrailContext";
import { ShortcutStarButton } from "@/components/ShortcutStarButton";
import { NotificationsBellDropdown } from "@/components/NotificationsBellDropdown";
import { ThemeToggle } from "@/components/ThemeToggle";

type AppTopBarProps = {
  unreadNotificationCount?: number;
};

export function AppTopBar({ unreadNotificationCount = 0 }: AppTopBarProps) {
  const pathname = usePathname();
  const workTrail = useWorkTrail();
  // Work trail is set by page children after mount. AppTopBar sits in a Suspense
  // boundary above them, so applying trail before mount causes hydration mismatch
  // (server: "Customer", client: real name).
  const [trailReady, setTrailReady] = useState(false);
  useEffect(() => {
    setTrailReady(true);
  }, []);
  const crumbs = breadcrumbsForPathname(
    pathname,
    trailReady ? workTrail ?? undefined : undefined
  );
  const defaultShortcutName =
    crumbs.length > 0 ? crumbs[crumbs.length - 1]!.label : "Shortcut";

  return (
    <header className="flex shrink-0 items-center justify-between border-b border-border-default bg-bg-default px-(--space-32)">
      <div className="flex min-w-0 items-center gap-1.5">
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex min-w-0 items-center gap-1.5 text-xs">
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1;
              return (
                <li
                  key={`${crumb.label}-${index}`}
                  className="flex min-w-0 items-center gap-1.5"
                >
                  {index > 0 && (
                    <span className="shrink-0 text-text-tertiary" aria-hidden>
                      /
                    </span>
                  )}
                  {isLast || crumb.href == null ? (
                    <span
                      className={`truncate ${
                        isLast
                          ? "font-semibold text-text-primary"
                          : "text-text-secondary"
                      }`}
                      aria-current={isLast ? "page" : undefined}
                    >
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      href={crumb.href}
                      prefetch={false}
                      className="truncate text-text-secondary transition-colors hover:text-text-primary"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        <Suspense fallback={null}>
          <ShortcutStarButton defaultName={defaultShortcutName} />
        </Suspense>
      </div>

      <div className="flex shrink-0 items-center">
        <ThemeToggle />
        <NotificationsBellDropdown unreadCount={unreadNotificationCount} />
      </div>
    </header>
  );
}
