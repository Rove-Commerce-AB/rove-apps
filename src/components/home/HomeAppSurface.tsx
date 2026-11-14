import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { Panel } from "@/components/ui";
import { APP_BRAND_BY_KEY } from "@/lib/appTheme";
import type { AppKey } from "@/lib/peopleTypes";

type Props = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Colors the header icon tile with the product brand. */
  brand?: AppKey;
  description?: string;
  children: React.ReactNode;
  className?: string;
};

/** One app surface on the home dashboard. */
export function HomeAppSurface({
  title,
  href,
  icon: Icon,
  brand,
  description,
  children,
  className = "",
}: Props) {
  const tileClass = brand
    ? APP_BRAND_BY_KEY[brand].tile
    : "bg-bg-muted text-text-primary";

  return (
    <Panel className={`flex h-full flex-col ${className}`.trim()}>
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${tileClass}`}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-heading-m text-text-primary">{title}</h2>
              {description ? (
                <p className="mt-0.5 text-xs text-text-secondary">{description}</p>
              ) : null}
            </div>
          </div>
        </div>
        <Link
          href={href}
          prefetch={false}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-brand-signal transition-colors hover:bg-accent-primary-subtle"
        >
          Open
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      <div className="flex flex-1 flex-col px-4 py-3">{children}</div>
    </Panel>
  );
}
