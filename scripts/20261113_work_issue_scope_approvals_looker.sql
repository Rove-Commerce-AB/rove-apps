-- Fixed-price scope approval transactions for Looker (alongside Done deliveries).
-- EventTypes: approved / unapproved / delivered / reversed.
-- Safe to rerun.

BEGIN;

CREATE TABLE IF NOT EXISTS work_issue_scope_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES work_issues (id) ON DELETE CASCADE,
  work_project_id uuid NOT NULL REFERENCES work_projects (id) ON DELETE CASCADE,
  size text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'SEK',
  approved_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_issue_scope_approvals_size_check
    CHECK (size IN ('xs', 's', 'm', 'l', 'xl')),
  CONSTRAINT work_issue_scope_approvals_amount_check
    CHECK (amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS work_issue_scope_approvals_active_uidx
  ON work_issue_scope_approvals (issue_id)
  WHERE reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS work_issue_scope_approvals_approved_at_idx
  ON work_issue_scope_approvals (approved_at);

CREATE INDEX IF NOT EXISTS work_issue_scope_approvals_project_idx
  ON work_issue_scope_approvals (work_project_id);

COMMENT ON TABLE work_issue_scope_approvals IS
  'Fixed-price (t-shirt) scope-approval snapshots. One active row per issue; reverse on unapprove.';

-- Backfill: already-approved issues without an active approval row.
INSERT INTO work_issue_scope_approvals (
  issue_id, work_project_id, size, amount, currency, approved_at
)
SELECT
  i.id,
  i.project_id,
  i.estimate_size,
  COALESCE(psp.amount, csp.amount),
  COALESCE(psp.currency, csp.currency, c.billing_currency, 'SEK'),
  i.scope_approved_at
FROM work_issues i
JOIN work_projects wp ON wp.id = i.project_id
JOIN customers c ON c.id = wp.customer_id
LEFT JOIN project_size_prices psp
  ON psp.project_id = wp.planner_project_id
 AND psp.size = i.estimate_size
LEFT JOIN customer_size_prices csp
  ON csp.customer_id = wp.customer_id
 AND csp.size = i.estimate_size
WHERE wp.estimate_unit = 'tshirt'
  AND wp.fixed_price_enabled = true
  AND i.scope_approved_at IS NOT NULL
  AND i.estimate_size IS NOT NULL
  AND COALESCE(psp.amount, csp.amount) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM work_issue_scope_approvals a
    WHERE a.issue_id = i.id
      AND a.reversed_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- Looker: unified fixed-price value events
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS v_work_delivered_consultant_looker;
DROP VIEW IF EXISTS v_work_delivered_looker;

CREATE VIEW v_work_delivered_looker AS
WITH delivery_events AS (
  SELECT
    d.id::text AS "EventId",
    e.event_at AS "EventAt",
    to_char(e.event_at, 'YYYY-MM') AS "EventYYYYMM",
    date_trunc('week', e.event_at) AS "EventWeek",
    e.event_type AS "EventType",
    e.signed_amount AS "SignedAmount",
    d.amount AS "CatalogAmount",
    d.currency AS "Currency",
    d.size AS "Size",
    d.delivered_at AS "CommittedAt",
    d.reversed_at AS "ReversedAt",
    (d.reversed_at IS NULL) AS "IsActive",
    'delivery'::text AS "EventSource",
    i.id AS issue_id,
    d.work_project_id AS work_project_id
  FROM work_issue_deliveries d
  JOIN work_issues i ON i.id = d.issue_id
  JOIN LATERAL (
    SELECT d.delivered_at AS event_at, 'delivered'::text AS event_type, d.amount AS signed_amount
    UNION ALL
    SELECT d.reversed_at, 'reversed'::text, -d.amount
    WHERE d.reversed_at IS NOT NULL
  ) e ON true
),
approval_events AS (
  SELECT
    a.id::text AS "EventId",
    e.event_at AS "EventAt",
    to_char(e.event_at, 'YYYY-MM') AS "EventYYYYMM",
    date_trunc('week', e.event_at) AS "EventWeek",
    e.event_type AS "EventType",
    e.signed_amount AS "SignedAmount",
    a.amount AS "CatalogAmount",
    a.currency AS "Currency",
    a.size AS "Size",
    a.approved_at AS "CommittedAt",
    a.reversed_at AS "ReversedAt",
    (a.reversed_at IS NULL) AS "IsActive",
    'scope_approval'::text AS "EventSource",
    i.id AS issue_id,
    a.work_project_id AS work_project_id
  FROM work_issue_scope_approvals a
  JOIN work_issues i ON i.id = a.issue_id
  JOIN LATERAL (
    SELECT a.approved_at AS event_at, 'approved'::text AS event_type, a.amount AS signed_amount
    UNION ALL
    SELECT a.reversed_at, 'unapproved'::text, -a.amount
    WHERE a.reversed_at IS NOT NULL
  ) e ON true
),
events AS (
  SELECT * FROM delivery_events
  UNION ALL
  SELECT * FROM approval_events
)
SELECT
  e."EventId",
  e."EventId" AS "DeliveryId",
  e."EventAt",
  e."EventYYYYMM",
  e."EventWeek",
  e."EventType",
  e."SignedAmount",
  e."CatalogAmount",
  e."Currency",
  e."Size",
  e."CommittedAt",
  e."CommittedAt" AS "DeliveredAt",
  e."ReversedAt",
  e."IsActive",
  e."EventSource",
  i.id::text AS "IssueId",
  (wp.prefix || '-' || i.number::text) AS "IssueKey",
  i.title AS "IssueTitle",
  (i.scope_approved_at IS NOT NULL) AS "ScopeApproved",
  i.scope_approved_at AS "ScopeApprovedAt",
  COALESCE(s.is_done, false) AS "IsDone",
  s.name AS "StatusName",
  wp.id::text AS "WorkProjectId",
  wp.title AS "WorkProjectTitle",
  wp.planner_project_id::text AS "ProjectId",
  p.name AS "ProjectName",
  c.id::text AS "CustomerId",
  c.name AS "CustomerName",
  i.owner_app_user_id::text AS "OwnerAppUserId",
  ou.name AS "OwnerName"
FROM events e
JOIN work_issues i ON i.id = e.issue_id
JOIN work_projects wp ON wp.id = e.work_project_id
JOIN customers c ON c.id = wp.customer_id
LEFT JOIN projects p ON p.id = wp.planner_project_id
LEFT JOIN app_users ou ON ou.id = i.owner_app_user_id
LEFT JOIN work_project_statuses s
  ON s.id = i.status AND s.project_id = i.project_id
WHERE wp.estimate_unit = 'tshirt'
  AND wp.fixed_price_enabled = true;

COMMENT ON VIEW v_work_delivered_looker IS
  'Fixed-price t-shirt value events for Looker. EventType: approved/unapproved/delivered/reversed. SignedAmount +/−. Filter EventType for delivery vs commitment; use ScopeApproved/IsDone for current state dims.';

CREATE VIEW v_work_delivered_consultant_looker AS
WITH issue_hours AS (
  SELECT
    l.work_issue_id,
    l.consultant_id,
    COALESCE(SUM(e.hours), 0)::numeric AS hours
  FROM time_report_entry_lines l
  JOIN time_report_entries e
    ON e.entry_line_id = l.id
   AND e.consultant_id = l.consultant_id
   AND l.iso_year = EXTRACT(ISOYEAR FROM e.entry_date)::int
   AND l.iso_week = EXTRACT(WEEK FROM e.entry_date)::int
  WHERE l.work_issue_id IS NOT NULL
    AND e.hours > 0
  GROUP BY l.work_issue_id, l.consultant_id
),
issue_totals AS (
  SELECT work_issue_id, SUM(hours) AS total_hours
  FROM issue_hours
  GROUP BY work_issue_id
)
SELECT
  v.*,
  co.id::text AS "ConsultantId",
  co.name AS "ConsultantName",
  co.is_external AS "ExternalConsultant",
  t.id::text AS "TeamId",
  t.name AS "TeamName",
  ih.hours AS "ConsultantIssueHours",
  it.total_hours AS "IssueHoursTotal",
  CASE
    WHEN it.total_hours IS NULL OR it.total_hours = 0 THEN NULL::numeric
    ELSE ROUND(v."SignedAmount" * ih.hours / it.total_hours, 2)
  END AS "AllocatedSignedAmount"
FROM v_work_delivered_looker v
LEFT JOIN issue_totals it ON it.work_issue_id = v."IssueId"::uuid
LEFT JOIN issue_hours ih ON ih.work_issue_id = v."IssueId"::uuid
LEFT JOIN consultants co ON co.id = ih.consultant_id
LEFT JOIN teams t ON t.id = co.team_id;

COMMENT ON VIEW v_work_delivered_consultant_looker IS
  'Fixed-price value events split by consultant hours on the Work issue. AllocatedSignedAmount is null when no linked time.';

COMMIT;
