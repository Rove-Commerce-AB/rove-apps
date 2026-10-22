import "server-only";

import { cloudSqlPool } from "@/lib/cloudSqlPool";

export type SupportOverviewCaseItem = {
  id: string;
  key: string;
  title: string;
  statusName: string;
  createdAt: string;
  customerId: string;
  customerName: string;
  boardId: string;
  isInbox: boolean;
  fromMail: boolean;
  fromEmail: string | null;
};

/** Open issues on the shared Support Inbox board (needs routing). */
export async function listSupportInboxQueue(): Promise<
  SupportOverviewCaseItem[]
> {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    number: number;
    title: string;
    created_at: Date;
    prefix: string;
    status_name: string;
    customer_id: string;
    customer_name: string;
    board_id: string;
    from_mail: boolean;
    from_email: string | null;
  }>(
    `SELECT i.id,
            i.number,
            i.title,
            i.created_at,
            p.prefix,
            COALESCE(s.name, 'Unknown') AS status_name,
            p.customer_id,
            c.name AS customer_name,
            p.id AS board_id,
            EXISTS (
              SELECT 1 FROM support_mail_messages m WHERE m.work_issue_id = i.id
            ) AS from_mail,
            (
              SELECT m.from_email
              FROM support_mail_messages m
              WHERE m.work_issue_id = i.id
              ORDER BY m.created_at ASC
              LIMIT 1
            ) AS from_email
     FROM work_issues i
     JOIN work_projects p ON p.id = i.project_id
     JOIN customers c ON c.id = p.customer_id
     LEFT JOIN work_project_statuses s
       ON s.id = i.status AND s.project_id = p.id
     WHERE p.is_support_inbox
       AND p.archived_at IS NULL
       AND COALESCE(s.is_done, false) = false
     ORDER BY i.created_at DESC
     LIMIT 50`
  );

  return rows.map((row) => ({
    id: row.id,
    key: `${row.prefix}-${row.number}`,
    title: row.title,
    statusName: row.status_name,
    createdAt: new Date(row.created_at).toISOString(),
    customerId: row.customer_id,
    customerName: "Support Inbox",
    boardId: row.board_id,
    isInbox: true,
    fromMail: row.from_mail,
    fromEmail: row.from_email,
  }));
}

/**
 * Cases in status "New" on support boards (incl. inbox), newest first.
 */
export async function listSupportNewCases(): Promise<SupportOverviewCaseItem[]> {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    number: number;
    title: string;
    created_at: Date;
    prefix: string;
    status_name: string;
    customer_id: string;
    customer_name: string;
    board_id: string;
    is_inbox: boolean;
    from_mail: boolean;
    from_email: string | null;
  }>(
    `SELECT i.id,
            i.number,
            i.title,
            i.created_at,
            p.prefix,
            s.name AS status_name,
            p.customer_id,
            CASE
              WHEN p.is_support_inbox THEN 'Support Inbox'
              ELSE c.name
            END AS customer_name,
            p.id AS board_id,
            p.is_support_inbox AS is_inbox,
            EXISTS (
              SELECT 1 FROM support_mail_messages m WHERE m.work_issue_id = i.id
            ) AS from_mail,
            (
              SELECT m.from_email
              FROM support_mail_messages m
              WHERE m.work_issue_id = i.id
              ORDER BY m.created_at ASC
              LIMIT 1
            ) AS from_email
     FROM work_issues i
     JOIN work_projects p ON p.id = i.project_id
     JOIN customers c ON c.id = p.customer_id
     JOIN work_project_statuses s
       ON s.id = i.status AND s.project_id = p.id
     WHERE p.is_support_board
       AND p.archived_at IS NULL
       AND lower(btrim(s.name)) = 'new'
       AND s.is_done = false
     ORDER BY i.created_at DESC
     LIMIT 50`
  );

  return rows.map((row) => ({
    id: row.id,
    key: `${row.prefix}-${row.number}`,
    title: row.title,
    statusName: row.status_name,
    createdAt: new Date(row.created_at).toISOString(),
    customerId: row.customer_id,
    customerName: row.customer_name,
    boardId: row.board_id,
    isInbox: row.is_inbox,
    fromMail: row.from_mail,
    fromEmail: row.from_email,
  }));
}

export type SupportRouteCustomerOption = {
  id: string;
  name: string;
  hasActiveContract: boolean;
  hasSupportBoard: boolean;
};

export async function listSupportRouteCustomers(): Promise<
  SupportRouteCustomerOption[]
> {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    name: string;
    has_active_contract: boolean;
    has_support_board: boolean;
  }>(
    `SELECT c.id,
            c.name,
            EXISTS (
              SELECT 1 FROM support_contracts sc
              WHERE sc.customer_id = c.id
                AND sc.active
                AND (sc.ends_on IS NULL OR sc.ends_on >= CURRENT_DATE)
            ) AS has_active_contract,
            EXISTS (
              SELECT 1 FROM work_projects wp
              WHERE wp.customer_id = c.id
                AND wp.is_support_board
                AND NOT wp.is_support_inbox
                AND wp.archived_at IS NULL
            ) AS has_support_board
     FROM customers c
     WHERE c.is_active
       AND NOT c.is_internal
     ORDER BY lower(c.name)`
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    hasActiveContract: row.has_active_contract,
    hasSupportBoard: row.has_support_board,
  }));
}

export type SupportRouteBoardOption = {
  id: string;
  title: string;
  prefix: string;
  isSupportBoard: boolean;
};

export async function listCustomerBoardsForRouting(
  customerId: string
): Promise<SupportRouteBoardOption[]> {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    title: string;
    prefix: string;
    is_support_board: boolean;
  }>(
    `SELECT id, title, prefix, is_support_board
     FROM work_projects
     WHERE customer_id = $1
       AND archived_at IS NULL
       AND NOT is_support_inbox
     ORDER BY is_support_board DESC, lower(title)`,
    [customerId]
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    prefix: row.prefix,
    isSupportBoard: row.is_support_board,
  }));
}
