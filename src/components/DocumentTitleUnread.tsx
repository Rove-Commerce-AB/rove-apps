"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const BASE_TITLE = "Rove Apps";

function formatTitle(unreadCount: number): string {
  const count = Number.isFinite(unreadCount) ? Math.max(0, unreadCount) : 0;
  if (count <= 0) return BASE_TITLE;
  return `(${count > 99 ? "99+" : count}) ${BASE_TITLE}`;
}

/**
 * Mirrors unread notification count into the browser tab title,
 * e.g. "(3) Rove Apps" — same pattern as Pinterest/Gmail.
 *
 * Next.js re-applies static metadata.title on soft navigations and can
 * overwrite a one-shot document.title write, so we re-assert on every
 * pathname change and whenever head mutates the <title> node.
 */
export function DocumentTitleUnread({
  unreadCount,
}: {
  unreadCount: number;
}) {
  const pathname = usePathname();
  const title = formatTitle(unreadCount);

  useEffect(() => {
    const apply = () => {
      if (document.title !== title) {
        document.title = title;
      }
    };

    apply();
    // Next often reapplies metadata after paint / soft nav.
    const t0 = window.setTimeout(apply, 0);
    const t1 = window.setTimeout(apply, 50);

    const titleEl = document.querySelector("head > title");
    const observer = new MutationObserver(apply);
    observer.observe(titleEl ?? document.head, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      observer.disconnect();
    };
  }, [title, pathname]);

  // React 19 moves this into <head>; keep a single text child.
  return <title>{title}</title>;
}
