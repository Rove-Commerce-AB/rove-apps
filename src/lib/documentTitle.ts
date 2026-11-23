export const ROVE_APPS_DOCUMENT_TITLE = "Rove Apps";

/** Tab title with unread count, e.g. "(3) Rove Apps". */
export function formatUnreadDocumentTitle(unreadCount: number): string {
  const count = Number.isFinite(unreadCount) ? Math.max(0, unreadCount) : 0;
  if (count <= 0) return ROVE_APPS_DOCUMENT_TITLE;
  return `(${count > 99 ? "99+" : count}) ${ROVE_APPS_DOCUMENT_TITLE}`;
}
