"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  CalendarCheck,
  Check,
  Circle,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui";
import { ListFilterMenu } from "@/components/ListFilterMenu";
import { ListTableToolbar } from "@/components/ListTableToolbar";
import { APP_BRAND_BY_KEY } from "@/lib/appTheme";
import type { UserNotificationRow } from "@/lib/userNotificationKinds";
import {
  markAllDashboardNotificationsReadAction,
  markDashboardNotificationReadAction,
  markDashboardNotificationUnreadAction,
} from "@/app/(app)/dashboardNotificationsActions";
import {
  NOTIFICATION_APP_FILTER_OPTIONS,
  formatNotificationTimestamp,
  notificationAppGroup,
  notificationBody,
  type NotificationAppGroup,
} from "@/lib/notificationDisplay";

type Props = {
  notifications: UserNotificationRow[];
};

const APP_ICONS: Record<NotificationAppGroup, LucideIcon> = {
  planner: CalendarCheck,
  work: Briefcase,
  product: Sparkles,
};

const APP_ICON_CLASS: Record<NotificationAppGroup, string> = {
  planner: APP_BRAND_BY_KEY.planner.icon,
  work: APP_BRAND_BY_KEY.work.icon,
  product: "text-text-tertiary",
};

export function DashboardNotificationsPanel({ notifications }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [statusFilterIds, setStatusFilterIds] = useState<string[]>([]);
  const [appFilterIds, setAppFilterIds] = useState<string[]>([]);

  const hasUnread = notifications.some((n) => n.read_at == null);

  const visible = useMemo(() => {
    return notifications.filter((n) => {
      const unread = n.read_at == null;
      if (statusFilterIds.length > 0) {
        const matchUnread =
          statusFilterIds.includes("unread") && unread;
        const matchRead = statusFilterIds.includes("read") && !unread;
        if (!matchUnread && !matchRead) return false;
      }
      if (appFilterIds.length > 0) {
        const group = notificationAppGroup(n.kind);
        if (!group || !appFilterIds.includes(group)) return false;
      }
      return true;
    });
  }, [notifications, statusFilterIds, appFilterIds]);

  function afterToggle() {
    router.refresh();
  }

  function markRead(id: string) {
    startTransition(() => {
      void markDashboardNotificationReadAction(id).then(afterToggle);
    });
  }

  function markUnread(id: string) {
    startTransition(() => {
      void markDashboardNotificationUnreadAction(id).then(afterToggle);
    });
  }

  return (
    <div>
      <ListTableToolbar
        className="mb-3"
        trailing={
          <>
            <ListFilterMenu
              ariaLabel="Filter notifications"
              sections={[
                {
                  id: "status",
                  label: "Status",
                  allLabel: "All statuses",
                  options: [
                    { id: "unread", name: "Unread" },
                    { id: "read", name: "Read" },
                  ],
                  selectedIds: statusFilterIds,
                  onChange: setStatusFilterIds,
                },
                {
                  id: "app",
                  label: "App",
                  allLabel: "All apps",
                  options: NOTIFICATION_APP_FILTER_OPTIONS,
                  selectedIds: appFilterIds,
                  onChange: setAppFilterIds,
                },
              ]}
            />
            {hasUnread ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                className="h-7 px-2 text-[13px] font-medium text-text-secondary hover:text-text-primary"
                onClick={() =>
                  startTransition(() => {
                    void markAllDashboardNotificationsReadAction().then(
                      afterToggle
                    );
                  })
                }
              >
                Mark all as read
              </Button>
            ) : null}
          </>
        }
      />

      {notifications.length === 0 ? (
        <p className="py-8 text-sm text-text-secondary">
          No notifications right now.
        </p>
      ) : visible.length === 0 ? (
        <p className="py-8 text-sm text-text-secondary">
          No notifications match this filter.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {visible.map((n) => {
            const unread = n.read_at == null;
            const { text } = notificationBody(n);
            const group = notificationAppGroup(n.kind);
            const Icon = group ? APP_ICONS[group] : null;
            const iconClass = group
              ? APP_ICON_CLASS[group]
              : "text-text-tertiary";
            return (
              <li
                key={n.id}
                className="group flex cursor-pointer items-start gap-3 py-3 first:pt-0 last:pb-0"
                onClick={(event) => {
                  const target = event.target;
                  const hitLink =
                    target instanceof Element && target.closest("a") != null;
                  if (hitLink) {
                    // Following a link marks unread → read; leave read alone.
                    if (unread) markRead(n.id);
                    return;
                  }
                  if (unread) markRead(n.id);
                  else markUnread(n.id);
                }}
              >
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    unread ? "bg-text-primary" : "bg-transparent"
                  }`}
                  aria-hidden={!unread}
                  title={unread ? "Unread" : undefined}
                />
                {Icon ? (
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center ${iconClass}`}
                    aria-hidden
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                ) : (
                  <span className="h-5 w-5 shrink-0" aria-hidden />
                )}
                <div className="min-w-0 flex-1 text-sm text-text-primary">
                  <div className="leading-snug">{text}</div>
                  <time
                    className="mt-1 block text-xs tabular-nums text-text-tertiary"
                    dateTime={n.created_at}
                  >
                    {formatNotificationTimestamp(n.created_at)}
                  </time>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (unread) markRead(n.id);
                    else markUnread(n.id);
                  }}
                  className="shrink-0 self-start rounded p-1 text-text-tertiary opacity-0 transition-opacity hover:bg-bg-muted hover:text-text-primary group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-50"
                  aria-label={unread ? "Mark as read" : "Mark as unread"}
                  title={unread ? "Mark as read" : "Mark as unread"}
                >
                  {unread ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
