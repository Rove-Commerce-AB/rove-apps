-- Work fixed-price deliveries: snapshot when an issue first enters Done.
-- Leaving Done reverses the active delivery (no double-count on re-Done).
-- Scope: work_projects.estimate_unit = tshirt AND fixed_price_enabled.
-- Safe to rerun.

BEGIN;

CREATE TABLE IF NOT EXISTS work_issue_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES work_issues (id) ON DELETE CASCADE,
  work_project_id uuid NOT NULL REFERENCES work_projects (id) ON DELETE CASCADE,
  size text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'SEK',
  delivered_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_issue_deliveries_size_check
    CHECK (size IN ('xs', 's', 'm', 'l', 'xl')),
  CONSTRAINT work_issue_deliveries_amount_check
    CHECK (amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS work_issue_deliveries_active_uidx
  ON work_issue_deliveries (issue_id)
  WHERE reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS work_issue_deliveries_delivered_at_idx
  ON work_issue_deliveries (delivered_at);

CREATE INDEX IF NOT EXISTS work_issue_deliveries_project_idx
  ON work_issue_deliveries (work_project_id);

COMMENT ON TABLE work_issue_deliveries IS
  'Fixed-price (t-shirt) delivery snapshots. One active row per issue; reverse on leave-Done.';

-- ---------------------------------------------------------------------------
-- Looker: issue-level delivery events (delivered +, reversed -)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS v_work_delivered_consultant_looker;
DROP VIEW IF EXISTS v_work_delivered_looker;

CREATE VIEW v_work_delivered_looker AS
SELECT
  d.id::text AS "DeliveryId",
  e.event_at AS "EventAt",
  to_char(e.event_at, 'YYYY-MM') AS "EventYYYYMM",
  date_trunc('week', e.event_at) AS "EventWeek",
  e.event_type AS "EventType",
  e.signed_amount AS "SignedAmount",
  d.amount AS "CatalogAmount",
  d.currency AS "Currency",
  d.size AS "Size",
  d.delivered_at AS "DeliveredAt",
  d.reversed_at AS "ReversedAt",
  (d.reversed_at IS NULL) AS "IsActive",
  i.id::text AS "IssueId",
  (wp.prefix || '-' || i.number::text) AS "IssueKey",
  i.title AS "IssueTitle",
  wp.id::text AS "WorkProjectId",
  wp.title AS "WorkProjectTitle",
  wp.planner_project_id::text AS "ProjectId",
  p.name AS "ProjectName",
  c.id::text AS "CustomerId",
  c.name AS "CustomerName",
  i.owner_app_user_id::text AS "OwnerAppUserId",
  ou.name AS "OwnerName"
FROM work_issue_deliveries d
JOIN work_issues i ON i.id = d.issue_id
JOIN work_projects wp ON wp.id = d.work_project_id
JOIN customers c ON c.id = wp.customer_id
LEFT JOIN projects p ON p.id = wp.planner_project_id
LEFT JOIN app_users ou ON ou.id = i.owner_app_user_id
JOIN LATERAL (
  SELECT d.delivered_at AS event_at, 'delivered'::text AS event_type, d.amount AS signed_amount
  UNION ALL
  SELECT d.reversed_at, 'reversed'::text, -d.amount
  WHERE d.reversed_at IS NOT NULL
) e ON true
WHERE wp.estimate_unit = 'tshirt'
  AND wp.fixed_price_enabled = true;

COMMENT ON VIEW v_work_delivered_looker IS
  'Fixed-price t-shirt deliveries for Looker. SignedAmount: + on deliver, - on reverse. Filter EventAt for periods.';

-- ---------------------------------------------------------------------------
-- Looker: allocate SignedAmount by consultant hours on the issue (all time)
-- ---------------------------------------------------------------------------
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
  'Delivery events split by consultant hours on the Work issue. AllocatedSignedAmount is null when no linked time.';

COMMIT;
