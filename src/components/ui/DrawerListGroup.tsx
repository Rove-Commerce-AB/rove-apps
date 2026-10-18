"use client";

import { Children, type ReactNode } from "react";

export type DrawerListBleed = "drawer" | "panel" | "none";

const bleedClass: Record<DrawerListBleed, string> = {
  drawer: "-mx-6 px-6",
  panel: "-mx-3 px-3",
  none: "px-0",
};

export function drawerListBleedClass(bleed: DrawerListBleed = "drawer") {
  return bleedClass[bleed];
}

export function drawerListRowClass(bleed: DrawerListBleed = "drawer") {
  return `relative flex items-center gap-3 ${bleedClass[bleed]} py-2.5 transition-colors hover:bg-interactive-secondary`;
}

/**
 * Muted uppercase group header for drawer / panel lists (Projects, People, Rates…).
 * Meta chrome — not a list row.
 */
export function DrawerListGroupHeader({
  title,
  count,
  action,
  bleed = "drawer",
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  bleed?: DrawerListBleed;
}) {
  return (
    <div
      className={`${bleedClass[bleed]} flex items-center justify-between gap-2 rounded-md bg-bg-muted/60 py-1.5`}
    >
      <h3 className="min-w-0 truncate text-label-s font-semibold uppercase tracking-wide text-text-tertiary">
        {title}
        {count != null ? (
          <span className="ml-1.5 font-medium normal-case tracking-normal text-text-tertiary">
            {count}
          </span>
        ) : null}
      </h3>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function DrawerListGroup({
  title,
  count,
  action,
  empty,
  children,
  bleed = "drawer",
  className = "",
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  empty?: ReactNode;
  children?: ReactNode;
  bleed?: DrawerListBleed;
  className?: string;
}) {
  const items = Children.toArray(children);
  return (
    <section className={`space-y-1 ${className}`.trim()}>
      <DrawerListGroupHeader
        title={title}
        count={count}
        action={action}
        bleed={bleed}
      />
      {items.length > 0 ? (
        <ul className="divide-y divide-border-subtle">{items}</ul>
      ) : empty != null ? (
        <div className={`${bleedClass[bleed]} py-2 text-sm text-text-tertiary`}>
          {empty}
        </div>
      ) : null}
    </section>
  );
}
