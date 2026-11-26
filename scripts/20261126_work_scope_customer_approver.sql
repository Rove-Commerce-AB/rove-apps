-- Customer approver required for fixed-price t-shirt scope approval.
-- Safe to rerun.

BEGIN;

ALTER TABLE work_projects
  ADD COLUMN IF NOT EXISTS requires_customer_approver boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN work_projects.requires_customer_approver IS
  'When fixed-price t-shirt: approving scope requires selecting a customer Work user as approver.';

-- Keep flag off when fixed price / t-shirt is not active.
UPDATE work_projects
SET requires_customer_approver = false
WHERE requires_customer_approver = true
  AND (
    estimate_unit IS DISTINCT FROM 'tshirt'
    OR COALESCE(fixed_price_enabled, false) = false
  );

ALTER TABLE work_issues
  ADD COLUMN IF NOT EXISTS scope_approver_app_user_id uuid
    REFERENCES app_users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS work_issues_scope_approver_app_user_id_idx
  ON work_issues (scope_approver_app_user_id)
  WHERE scope_approver_app_user_id IS NOT NULL;

COMMENT ON COLUMN work_issues.scope_approver_app_user_id IS
  'Customer Work user designated as approver for the current scope approval; cleared on unapprove.';

ALTER TABLE work_issue_scope_approvals
  ADD COLUMN IF NOT EXISTS approver_app_user_id uuid
    REFERENCES app_users (id) ON DELETE SET NULL;

COMMENT ON COLUMN work_issue_scope_approvals.approver_app_user_id IS
  'Customer approver snapshot at approve time (Looker / history).';

-- ---------------------------------------------------------------------------
-- Looker: include project flag + approver on fixed-price value events
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
    d.work_project_id AS work_project_id,
    NULL::uuid AS event_approver_app_user_id
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
    a.work_project_id AS work_project_id,
    a.approver_app_user_id AS event_approver_app_user_id
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
  COALESCE(wp.requires_customer_approver, false) AS "RequiresCustomerApprover",
  COALESCE(e.event_approver_app_user_id, i.scope_approver_app_user_id)::text
    AS "ScopeApproverAppUserId",
  COALESCE(ea.name, sa.name, ea.email, sa.email) AS "ScopeApproverName",
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
LEFT JOIN app_users ea ON ea.id = e.event_approver_app_user_id
LEFT JOIN app_users sa ON sa.id = i.scope_approver_app_user_id
LEFT JOIN work_project_statuses s
  ON s.id = i.status AND s.project_id = i.project_id
WHERE wp.estimate_unit = 'tshirt'
  AND wp.fixed_price_enabled = true;

COMMENT ON VIEW v_work_delivered_looker IS
  'Fixed-price t-shirt value events for Looker. EventType: approved/unapproved/delivered/reversed. SignedAmount +/−. Filter EventType for delivery vs commitment; use ScopeApproved/IsDone/RequiresCustomerApprover/ScopeApprover* for dims.';

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
