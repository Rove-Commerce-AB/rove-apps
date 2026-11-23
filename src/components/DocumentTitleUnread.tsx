"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { formatUnreadDocumentTitle } from "@/lib/documentTitle";

/**
 * Mirrors unread notification count into the browser tab title,
 * e.g. "(3) Rove Apps" — same pattern as Pinterest/Gmail.
 *
 * Next.js re-applies root metadata.title ("Rove Apps") on soft navigations
 * and after some client interactions (RSC refresh). Observing the <title>
 * node itself fails when Next replaces that node — always watch <head>,
 * re-assert on a few delayed ticks, and on focus/visibility.
 */
export function DocumentTitleUnread({
  unreadCount,
}: {
  unreadCount: number;
}) {
  const pathname = usePathname();
  const title = formatUnreadDocumentTitle(unreadCount);
  const titleRef = useRef(title);
  titleRef.current = title;

  useEffect(() => {
    const apply = () => {
      const next = titleRef.current;
      if (document.title !== next) {
        document.title = next;
      }
    };

    apply();
    // Next often reapplies metadata after paint / soft nav / refresh.
    const timeouts = [0, 50, 200, 500, 1500].map((ms) =>
      window.setTimeout(apply, ms)
    );

    // Watch <head>, not the title node — Next replaces <title> wholesale
    // and an observer on the old node goes silent.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    const onFocus = () => apply();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    // Safety net for missed mutations during long interactions.
    const interval = window.setInterval(apply, 2000);

    return () => {
      for (const id of timeouts) window.clearTimeout(id);
      window.clearInterval(interval);
      observer.disconnect();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [title, pathname]);

  // React 19 moves this into <head>; keep a single text child.
  return <title>{title}</title>;
}
