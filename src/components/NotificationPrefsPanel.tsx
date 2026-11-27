"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui";
import { saveNotificationPrefsAction } from "@/app/(app)/dashboardNotificationsActions";
import type { UserNotificationPrefs } from "@/lib/userNotificationPrefs";

type Props = {
  initialPrefs: UserNotificationPrefs;
};

type RowKey =
  | "assign"
  | "comment"
  | "commentReaction"
  | "mention"
  | "done";

export function NotificationPrefsPanel({ initialPrefs }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [prefs, setPrefs] = useState(initialPrefs);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function patch(next: Partial<UserNotificationPrefs>) {
    const merged = {
      ...prefs,
      ...next,
      workMentionEmail: true,
    };
    setPrefs(merged);
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const result = await saveNotificationPrefsAction(merged);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPrefs(result.prefs);
      setSaved(true);
      router.refresh();
    });
  }

  const rows: {
    key: RowKey;
    label: string;
    hint?: string;
    inApp: boolean;
    email: boolean;
    emailLocked?: boolean;
    setInApp: (value: boolean) => void;
    setEmail: (value: boolean) => void;
  }[] = [
    {
      key: "assign",
      label: "Assigned / made owner",
      inApp: prefs.workAssignInApp,
      email: prefs.workAssignEmail,
      setInApp: (value) => patch({ workAssignInApp: value }),
      setEmail: (value) => patch({ workAssignEmail: value }),
    },
    {
      key: "comment",
      label: "Comments on my cards",
      hint: "When you’re assignee or owner",
      inApp: prefs.workCommentInApp,
      email: prefs.workCommentEmail,
      setInApp: (value) => patch({ workCommentInApp: value }),
      setEmail: (value) => patch({ workCommentEmail: value }),
    },
    {
      key: "commentReaction",
      label: "Reactions on my comments",
      inApp: prefs.workCommentReactionInApp,
      email: prefs.workCommentReactionEmail,
      setInApp: (value) => patch({ workCommentReactionInApp: value }),
      setEmail: (value) => patch({ workCommentReactionEmail: value }),
    },
    {
      key: "mention",
      label: "@mentions",
      hint: "Email can’t be turned off",
      inApp: prefs.workMentionInApp,
      email: true,
      emailLocked: true,
      setInApp: (value) => patch({ workMentionInApp: value }),
      setEmail: () => {},
    },
    {
      key: "done",
      label: "My issue marked Done",
      inApp: prefs.workDoneInApp,
      email: prefs.workDoneEmail,
      setInApp: (value) => patch({ workDoneInApp: value }),
      setEmail: (value) => patch({ workDoneEmail: value }),
    },
  ];

  return (
    <section className="mb-8 rounded-lg border border-border-subtle bg-bg-default p-4">
      <h2 className="text-label-l text-text-primary">Preferences</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Email is sent as a digest about every 15 minutes from noreply@rove.se.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[20rem] text-left text-sm">
          <thead>
            <tr className="text-text-tertiary">
              <th className="pb-2 pr-3 font-medium">Event</th>
              <th className="pb-2 pr-3 font-medium">In-app</th>
              <th className="pb-2 font-medium">Email</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-border-subtle">
                <td className="py-3 pr-3 align-middle">
                  <div className="text-text-primary">{row.label}</div>
                  {row.hint ? (
                    <div className="text-caption text-text-tertiary">
                      {row.hint}
                    </div>
                  ) : null}
                </td>
                <td className="py-3 pr-3 align-middle">
                  <Switch
                    id={`notif-inapp-${row.key}`}
                    checked={row.inApp}
                    disabled={pending}
                    onCheckedChange={row.setInApp}
                    aria-label={`${row.label} in-app`}
                  />
                </td>
                <td className="py-3 align-middle">
                  <Switch
                    id={`notif-email-${row.key}`}
                    checked={row.email}
                    disabled={pending || row.emailLocked}
                    onCheckedChange={row.setEmail}
                    aria-label={`${row.label} email`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {saved && !error ? (
        <p className="mt-3 text-sm text-text-secondary" role="status">
          Saved
        </p>
      ) : null}
    </section>
  );
}
