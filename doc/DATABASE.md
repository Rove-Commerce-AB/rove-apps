# Database schema

This document mirrors the **PostgreSQL** application schema after the
People / customer-user / Work rollout, including MCP permissions (**2026-10-14**). Use it when
generating queries, types, or UI logic.

Terminology: we use **customer** (never client).

Authorization and most row-level rules are enforced in **application code**
(Auth.js + `app_users` + `app_user_apps` + checks in `src/lib/`). Database
triggers additionally enforce customer-user rules. See
[`PEOPLE_MIGRATION.md`](PEOPLE_MIGRATION.md) for People / app-access rollout.

---

## Enums

### project_type

`customer` | `internal` | `absence`

Used by `projects.type`. Default `customer`.

---

## app_users

Authenticated application users. Google sign-in resolves the account by email;
all internal relationships use the account UUID.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| email | text | NOT NULL, UNIQUE |
| role | text | NOT NULL, default `member`; check: `admin`, `member`, `customer` |
| name | text | nullable |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Indexes: unique `(email)`; btree `(email)`.

Trigger `app_users_customer_role_enforce` (BEFORE INSERT/UPDATE) runs
`enforce_customer_user_rules()`.

Underkonsult is not a login role. It is `consultants.is_external`. A
subcontractor login is a `member` (or rarely `admin`) linked to that
profile, with apps in `app_user_apps`.

See [`scripts/20260913_drop_subcontractor_role.sql`](../scripts/20260913_drop_subcontractor_role.sql).

---

## apps

Catalogue of assignable Rove apps.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| key | text | NOT NULL, UNIQUE; check `^[a-z][a-z0-9_]*$` |
| name | text | NOT NULL |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Live catalogue rows: `planner` / Planner, `time_report` / Time report,
`insights` / Insights, `work` / Work.

`work` is added by
[`scripts/20260911_rove_work_app.sql`](../scripts/20260911_rove_work_app.sql)
and is not auto-granted.

---

## app_user_apps

Many-to-many app access assigned to login accounts.

| Column | Type | Notes |
|--------|------|--------|
| app_user_id | uuid | PK part, FK → `app_users.id`, ON DELETE CASCADE |
| app_id | uuid | PK part, FK → `apps.id`, ON DELETE CASCADE |
| mcp_access | boolean | NOT NULL, default `false`, MCP permission for this app |
| created_at | timestamptz | NOT NULL, default `now()` |

Index: `(app_id)`.

Trigger `app_user_apps_customer_user_enforce` (BEFORE INSERT/UPDATE) runs
`enforce_customer_user_rules()`.

Application actions require every **Rove** account (`admin`, `member`)
to retain at least one app. `customer` accounts must have
none of the Rove apps.

MCP permissions require an existing app grant. Removing that grant also removes
its MCP permission. All MCP permissions start disabled.

---

## app_user_mcp_tokens

One revocable MCP token per login account. Only admins can manage tokens through
Settings / People. Token management does not grant app permissions.

| Column | Type | Notes |
|--------|------|--------|
| app_user_id | uuid | PK, FK to `app_users.id`, ON DELETE CASCADE |
| token_hash | text | NOT NULL, UNIQUE, SHA-256 hex digest for token lookup |
| encrypted_token | text | NOT NULL, AES-256-GCM ciphertext for explicit Show / Copy |
| created_at | timestamptz | NOT NULL, default `now()` |

The encryption key is derived from `AUTH_SECRET`, with `NEXTAUTH_SECRET` as a
fallback. Revocation deletes the token row and preserves app permission settings.

---

## app_user_shortcuts

Per-user sidebar shortcuts. Each row stores a display name and a full app
href (`pathname` + query) so filters and views round-trip when opened.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| app_user_id | uuid | NOT NULL, FK → `app_users.id`, ON DELETE CASCADE |
| name | text | NOT NULL; trimmed non-empty; max 80 chars |
| href | text | NOT NULL; must start with `/` |
| created_at | timestamptz | NOT NULL, default `now()` |

Index: `(app_user_id, created_at)`.

Added by
[`scripts/20260920_app_user_shortcuts.sql`](../scripts/20260920_app_user_shortcuts.sql).

---

## google_user_connections

OAuth tokens for Google Tasks sync. Treat token columns as secrets.

| Column | Type | Notes |
|--------|------|--------|
| app_user_id | uuid | PK, FK → `app_users.id`, ON DELETE CASCADE |
| google_sub | text | NOT NULL |
| google_email | text | nullable |
| scope | text | nullable |
| access_token | text | nullable; secret |
| refresh_token | text | nullable; secret |
| token_type | text | nullable |
| access_token_expires_at | timestamptz | nullable |
| last_sync_at | timestamptz | nullable |
| last_error | text | nullable |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

---

## customers

Customer / company.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| name | text | NOT NULL |
| contact_name | text | nullable; denormalized from the contact user when `contact_app_user_id` is set |
| contact_email | text | nullable; denormalized from the contact user when `contact_app_user_id` is set |
| color | text | default `#3b82f6` |
| logo_url | text | nullable |
| is_internal | boolean | NOT NULL, default false; unique partial index allows at most one `true` row |
| is_active | boolean | NOT NULL, default true |
| account_manager_id | uuid | nullable, FK → `consultants.id`, ON DELETE SET NULL |
| contact_app_user_id | uuid | nullable, FK → `app_users.id`, ON DELETE SET NULL; must be a `customer` user assigned to this customer |
| url | text | nullable (website for favicon / links) |
| subscription_id | text | nullable; exactly 6 characters when set; unique on `lower(subscription_id)` |
| litium_version | text | nullable; can be set in the app; overwritten by the Litium version ingest when `subscription_id` matches |
| billing_currency | text | NOT NULL, default `SEK`; check `SEK` or `EUR` |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Indexes: unique `(is_internal) WHERE is_internal = true`;
`(contact_app_user_id) WHERE contact_app_user_id IS NOT NULL`;
unique `(lower(subscription_id)) WHERE subscription_id IS NOT NULL`.

Triggers: `customers_contact_user_enforce` (BEFORE INSERT/UPDATE) →
`enforce_customer_user_rules()`; `trg_customers_updated_at` → `set_updated_at()`.

The app also rejects marking a customer internal while it still has customer
users.

---

## roles

Roles for consultants, allocation overrides, and rate tables.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| name | text | NOT NULL, UNIQUE |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Trigger `trg_roles_updated_at` → `set_updated_at()`.

---

## calendars

Working-hours context (holidays in `calendar_holidays`).

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| name | text | NOT NULL |
| country_code | text | NOT NULL; length 2–3 |
| hours_per_week | numeric(5,2) | NOT NULL, default 40, ≥ 0 |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Trigger `trg_calendars_updated_at` → `set_updated_at()`.

---

## calendar_holidays

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| calendar_id | uuid | NOT NULL, FK → `calendars.id`, ON DELETE CASCADE |
| holiday_date | date | NOT NULL |
| name | text | NOT NULL |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Unique: `(calendar_id, holiday_date)`.

Trigger `trg_calendar_holidays_updated_at` → `set_updated_at()`.

---

## teams

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| name | text | NOT NULL, UNIQUE |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Trigger `teams_updated_at` → `set_updated_at()`.

---

## consultants

Allocatable person; default role, calendar, optional team, optional login.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| app_user_id | uuid | nullable, UNIQUE when present; FK → `app_users.id`, ON DELETE SET NULL |
| name | text | NOT NULL |
| email | text | nullable |
| role_id | uuid | NOT NULL, FK → `roles.id` |
| calendar_id | uuid | NOT NULL, FK → `calendars.id` |
| team_id | uuid | nullable, FK → `teams.id`, ON DELETE SET NULL |
| is_external | boolean | NOT NULL, default false; underkonsult. Scopes time report (hide internal customer; booked projects only) |
| work_percentage | smallint | NOT NULL, default 100; check 5–100 |
| overhead_percentage | smallint | nullable, default 0 |
| start_date | date | nullable; first available day |
| end_date | date | nullable; last available day |
| birth_date | date | nullable; admin-only in UI |
| utilization_target_pct | numeric(5,2) | nullable; target billable utilization for Reports |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Indexes: unique `(app_user_id) WHERE app_user_id IS NOT NULL`; `(team_id)`.

Triggers: `consultants_customer_user_enforce` → `enforce_customer_user_rules()`;
`trg_consultants_updated_at` → `set_updated_at()`.

A person is either a consultant or a customer user, never both.

---

## customer_consultants

Which consultants may work on which customers. Source of truth for planning,
time reporting, and which customers a consultant sees in Rove apps.

| Column | Type | Notes |
|--------|------|--------|
| customer_id | uuid | PK part, FK → `customers.id`, ON DELETE CASCADE |
| consultant_id | uuid | PK part, FK → `consultants.id`, ON DELETE CASCADE |
| created_at | timestamptz | NOT NULL, default `now()` |

Index: `(consultant_id)`.

---

## customer_app_users

Which **customer users** belong to which customers. These accounts can log in
and be chosen as the customer contact. They are never allocatable. They may
receive the **Work** app only (never Planner, Time report, or Insights).

| Column | Type | Notes |
|--------|------|--------|
| customer_id | uuid | PK part, FK → `customers.id`, ON DELETE CASCADE |
| app_user_id | uuid | PK part, FK → `app_users.id`, ON DELETE CASCADE |
| created_at | timestamptz | NOT NULL, default `now()` |

Index: `(app_user_id)`.

Triggers: `customer_app_users_enforce` (BEFORE INSERT/UPDATE) →
`enforce_customer_user_rules()`; `customer_app_users_clear_contact`
(AFTER DELETE) → `clear_customer_contact_on_unlink()`.

Rows cannot reference the internal (Rove) customer. Unlinking a user who is
the contact clears `customers.contact_app_user_id`.

DDL: [`scripts/20260911_customer_users.sql`](../scripts/20260911_customer_users.sql).

---

## projects

Belongs to one customer. Optional Jira / DevOps integration fields, PM, budgets.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| customer_id | uuid | NOT NULL, FK → `customers.id`, ON DELETE CASCADE |
| name | text | NOT NULL |
| start_date | date | nullable |
| end_date | date | nullable |
| is_active | boolean | NOT NULL, default true |
| type | `project_type` | NOT NULL, default `customer` |
| probability | integer | NOT NULL, default 100; check 1–100 |
| jira_project_key | text | nullable; joins `jira_issues.project_key` |
| devops_project | text | nullable; joins `devops_work_items.project` |
| budget_hours | numeric | nullable |
| budget_money | numeric | nullable; for `billing_type = fixed`, this is the contract value |
| billing_type | text | NOT NULL, default `hourly`; check `hourly` or `fixed` |
| project_manager_id | uuid | nullable; app links to `consultants.id` (no FK in this snapshot) |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Checks: `end_date >= start_date` when both are set; probability 1–100; `billing_type` in (`hourly`, `fixed`).

`billing_type = fixed`: time is still reported; Looker/`v_time_report_looker` **Income** is **0** (hours × rate is not used). Contract value is `budget_money`. DDL: [`scripts/20261008_project_billing_type.sql`](../scripts/20261008_project_billing_type.sql).

Trigger `trg_projects_updated_at` → `set_updated_at()`.

The app can use `projects.clickup_project_id` when present
([`scripts/alter_projects_add_clickup_project_id.sql`](../scripts/alter_projects_add_clickup_project_id.sql)).
It stores a ClickUp **folder id**; time report looks up tasks via `clickup.folder_id`.
That column is **not** in this snapshot.

---

## allocations

Consultant allocation per project (and optional role) per ISO week.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| consultant_id | uuid | nullable, FK → `consultants.id`, ON DELETE CASCADE |
| project_id | uuid | NOT NULL, FK → `projects.id`, ON DELETE CASCADE |
| role_id | uuid | nullable, FK → `roles.id`, ON DELETE RESTRICT |
| customer_rate_id | uuid | nullable, FK → `customer_rates.id`, ON DELETE RESTRICT |
| project_rate_id | uuid | nullable, FK → `project_rates.id`, ON DELETE RESTRICT |
| year | smallint | NOT NULL; check 2000–2100 |
| week | smallint | NOT NULL; check 1–53 |
| hours | numeric(6,2) | NOT NULL, ≥ 0 |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Unique (partial):

- `(consultant_id, project_id, year, week, role_id)` WHERE `role_id` IS NOT NULL
- `(consultant_id, project_id, year, week, customer_rate_id)` WHERE `customer_rate_id` IS NOT NULL
- `(consultant_id, project_id, year, week, project_rate_id)` WHERE `project_rate_id` IS NOT NULL
- `(consultant_id, project_id, year, week)` WHERE all task FKs are null

(Equivalent unique indexes exist for `consultant_id IS NULL` / To plan.)

Indexes: `(consultant_id)`; `(consultant_id, project_id, year, week)`;
`(year, week)`.

Trigger `trg_allocations_updated_at` → `set_updated_at()`.

---

## allocation_history

Audit log for allocation changes.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| allocation_id | uuid | nullable |
| action | text | NOT NULL; check: `create`, `update`, `delete`, `bulk` |
| changed_by_email | text | NOT NULL |
| changed_at | timestamptz | NOT NULL, default `now()` |
| details | jsonb | nullable; for `bulk`: `{ "allocation_ids": ["uuid", ...] }` |

Indexes: `(allocation_id) WHERE allocation_id IS NOT NULL`;
`(changed_at DESC)`.

---

## customer_status_entries

Weekly traffic-light notes per customer.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| customer_id | uuid | NOT NULL, FK → `customers.id`, ON DELETE CASCADE |
| traffic_light | text | NOT NULL; check: `red`, `yellow`, `green` |
| body | text | NOT NULL |
| year | integer | NOT NULL |
| week | integer | NOT NULL |
| created_at | timestamptz | NOT NULL, default `now()` |

Index: `(customer_id, created_at DESC)`.

---

## customer_rates

Customer-level hourly rates: either a **global role** (`role_id`) or a **custom task** (`name`).

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| customer_id | uuid | NOT NULL, FK → `customers.id`, ON DELETE CASCADE |
| role_id | uuid | nullable, FK → `roles.id`, ON DELETE RESTRICT |
| name | text | custom task name when `role_id` is null |
| active | boolean | NOT NULL, default true; deactivate when the rate is referenced |
| rate_per_hour | numeric(12,2) | NOT NULL, ≥ 0 |
| currency | text | NOT NULL, default `SEK` |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Check: exactly one of `role_id` or `name`. Unique: `(customer_id, role_id)` where `role_id` is not null; `(customer_id, lower(btrim(name)))` where `role_id` is null.

Trigger `trg_customer_rates_updated_at` → `set_updated_at()`.

---

## project_rates

Project-level rates (override customer rates for the same global `role_id`). Custom project tasks (`name`) are **project-only**.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| project_id | uuid | NOT NULL, FK → `projects.id`, ON DELETE CASCADE |
| role_id | uuid | nullable, FK → `roles.id`, ON DELETE CASCADE |
| name | text | custom task name when `role_id` is null |
| active | boolean | NOT NULL, default true |
| rate_per_hour | numeric | NOT NULL |
| currency | text | NOT NULL, default `SEK` |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Check: exactly one of `role_id` or `name`. Unique: `(project_id, role_id)` where `role_id` is not null; `(project_id, lower(btrim(name)))` where `role_id` is null. Indexes: `(project_id)`, `(role_id)`.

---

## project_month_invoice_hours

Invoiced hours per project calendar month (from time-report lines, optional
fixed override).

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| project_id | uuid | NOT NULL, FK → `projects.id`, ON DELETE CASCADE |
| year | integer | NOT NULL; check 2000–3000 |
| month | integer | NOT NULL; check 1–12 |
| invoiced_hours_from_lines | numeric(14,4) | NOT NULL, default 0 |
| invoiced_hours_fixed | numeric(14,4) | nullable |
| updated_at | timestamptz | NOT NULL, default `now()` |
| updated_by | uuid | nullable, FK → `consultants.id` |

Unique: `(project_id, year, month)`. Index: `(project_id)`.

---

## time_report_entry_lines

Logical grid row for one consultant ISO week (customer / project / role /
Jira-DevOps key / description / optional Work issue). Day cells live in
`time_report_entries`.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK part |
| consultant_id | uuid | PK part, FK → `consultants.id`, ON DELETE CASCADE |
| iso_year | integer | PK part |
| iso_week | integer | PK part |
| customer_id | uuid | NOT NULL, FK → `customers.id`, ON DELETE RESTRICT |
| project_id | uuid | nullable, FK → `projects.id`, ON DELETE RESTRICT |
| role_id | uuid | nullable, FK → `roles.id`, ON DELETE RESTRICT |
| customer_rate_id | uuid | nullable, FK → `customer_rates.id`, ON DELETE RESTRICT |
| project_rate_id | uuid | nullable, FK → `project_rates.id`, ON DELETE RESTRICT |
| jira_devops_key | text | nullable |
| description | text | nullable; row-level task text |
| work_issue_id | uuid | nullable, FK → `work_issues.id`, ON DELETE SET NULL; set when `jira_devops_key` is `work:<issue-id>` |
| display_order | integer | NOT NULL, default 0 |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

PK / unique: `(consultant_id, iso_year, iso_week, id)`.

Index: `(consultant_id, iso_year, iso_week, display_order, id)`.
Partial index: `(work_issue_id)` where not null.

---

## time_report_entries

One row per **calendar day** on a week line. The UI groups by week.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| consultant_id | uuid | NOT NULL, FK → `consultants.id`, ON DELETE CASCADE |
| customer_id | uuid | NOT NULL, FK → `customers.id`, ON DELETE CASCADE |
| project_id | uuid | NOT NULL, FK → `projects.id`, ON DELETE CASCADE |
| role_id | uuid | nullable, FK → `roles.id`, ON DELETE CASCADE |
| customer_rate_id | uuid | nullable, FK → `customer_rates.id`, ON DELETE RESTRICT |
| project_rate_id | uuid | nullable, FK → `project_rates.id`, ON DELETE RESTRICT |
| role_name_snapshot | text | nullable; Looker `RoleName` for custom tasks |
| jira_devops_key | text | nullable |
| entry_date | date | NOT NULL |
| hours | numeric(4,2) | NOT NULL, default 0; check `hours > 0` |
| internal_comment | text | nullable (per-day comment) |
| rate_snapshot | numeric(10,2) | nullable; rate at save, in `currency_snapshot` |
| currency_snapshot | text | nullable; `SEK` or `EUR` at save; existing rows with a rate default to `SEK` |
| display_order | smallint | NOT NULL, default 0 |
| description | text | nullable |
| pm_edited_hours | numeric | nullable; consultant hours before PM edit |
| pm_edited_comment | text | nullable |
| pm_edited_at | timestamptz | nullable |
| pm_edited_by | uuid | nullable, FK → `consultants.id`, ON DELETE SET NULL |
| invoiced_at | timestamptz | nullable |
| entry_line_id | uuid | NOT NULL; links to `time_report_entry_lines.id` (no FK in this snapshot) |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Unique:

- `(consultant_id, entry_line_id, entry_date)` — one cell per line per day
- Partial (custom rates, no role): `(consultant_id, customer_rate_id, COALESCE(jira_devops_key,''), entry_date)` where `customer_rate_id` set and `role_id` null
- Partial (custom rates, no role): `(consultant_id, project_rate_id, COALESCE(jira_devops_key,''), entry_date)` where `project_rate_id` set and `role_id` null

Do **not** keep a table unique on `(consultant_id, customer_id, project_id, role_id, jira_devops_key, entry_date)` — that legacy constraint blocks multiple Work/time-report lines that share the same billing dimensions on the same day. Drop it with `scripts/alter_time_report_drop_legacy_row_day_unique.sql` if it still exists.

Indexes: `(consultant_id, entry_date)`; `(entry_date)`.

---

## time_report_week_revisions

Optimistic concurrency token per consultant ISO week.

| Column | Type | Notes |
|--------|------|--------|
| consultant_id | uuid | PK part, FK → `consultants.id`, ON DELETE CASCADE |
| iso_year | integer | PK part |
| iso_week | integer | PK part |
| revision | bigint | NOT NULL, default 0 |
| updated_at | timestamptz | NOT NULL, default `now()` |
| updated_by_app_user_id | uuid | nullable, FK → `app_users.id` |

Index: `(consultant_id)`.

---

## time_report_entries_history

Audit log for time-report day cells.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| time_report_entry_id | uuid | nullable |
| entry_line_id | uuid | NOT NULL |
| consultant_id | uuid | NOT NULL, FK → `consultants.id`, ON DELETE CASCADE |
| operation | text | NOT NULL; check: `insert`, `update`, `delete` |
| before_json | jsonb | nullable |
| after_json | jsonb | nullable |
| changed_at | timestamptz | NOT NULL, default `now()` |
| changed_by_app_user_id | uuid | nullable, FK → `app_users.id` |
| source_revision | bigint | NOT NULL |

Indexes: `(consultant_id, changed_at DESC)`; `(entry_line_id, changed_at DESC)`.

---

## jira_issues

Synced Jira issues.

| Column | Type | Notes |
|--------|------|--------|
| jira_key | text | PK |
| summary | text | nullable |
| parent_key | text | nullable |
| parent_summary | text | nullable |
| parent_type | text | nullable |
| status | text | nullable |
| created_at | timestamptz | nullable |
| updated_at | timestamptz | nullable |
| due_date | date | nullable |
| issue_type | text | nullable |
| original_estimate_hours | numeric | nullable |
| source_instance | text | nullable |
| last_synced_at | timestamptz | nullable, default `now()` |
| project_key | text | nullable |
| project_name | text | nullable |
| url | text | nullable |

Index: `(project_key)`.

---

## devops_work_items

Synced Azure DevOps work items.

| Column | Type | Notes |
|--------|------|--------|
| work_item_id | bigint | PK |
| title | text | nullable |
| project | text | nullable |
| state | text | nullable |
| last_synced_at | timestamptz | nullable, default `now()` |

Index: `(project)`.

---

## clickup

Synced ClickUp tasks (same shape as Jira sync).

| Column | Type | Notes |
|--------|------|--------|
| clickup_id | text | PK |
| summary | text | nullable |
| parent_key | text | nullable |
| parent_summary | text | nullable |
| parent_type | text | nullable |
| status | text | nullable |
| created_at | timestamptz | nullable |
| updated_at | timestamptz | nullable |
| due_date | timestamptz | nullable |
| issue_type | text | nullable |
| original_estimate_hours | numeric | nullable |
| source_instance | text | nullable |
| last_synced_at | timestamptz | nullable |
| project_key | text | nullable (ClickUp List id) |
| project_name | text | nullable (ClickUp List name) |
| space_id | text | nullable |
| space_name | text | nullable |
| folder_id | text | nullable |
| folder_name | text | nullable |
| url | text | nullable |

Indexes: `(project_key)`, `(space_id)`, `(folder_id)`.

---

## task_boards

Shared task boards.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| title | text | NOT NULL |
| created_by_app_user_id | uuid | NOT NULL, FK → `app_users.id`, ON DELETE RESTRICT |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

---

## task_board_members

| Column | Type | Notes |
|--------|------|--------|
| board_id | uuid | PK part, FK → `task_boards.id`, ON DELETE CASCADE |
| app_user_id | uuid | PK part, FK → `app_users.id`, ON DELETE CASCADE |
| created_at | timestamptz | NOT NULL, default `now()` |

Index: `(app_user_id)`.

---

## task_board_todos

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| board_id | uuid | NOT NULL, FK → `task_boards.id`, ON DELETE CASCADE |
| title | text | NOT NULL |
| status | text | NOT NULL; check: `todo`, `done` |
| sort_order | integer | NOT NULL, default 0 |
| assigned_to_app_user_id | uuid | nullable, FK → `app_users.id`, ON DELETE SET NULL |
| due_date | date | nullable |
| updated_at | timestamptz | NOT NULL, default `now()` |

Index: `(board_id)`.

---

## task_board_google_task_lists

Per-user Google Task list bound to a board.

| Column | Type | Notes |
|--------|------|--------|
| app_user_id | uuid | PK part, FK → `app_users.id`, ON DELETE CASCADE |
| board_id | uuid | PK part, FK → `task_boards.id`, ON DELETE CASCADE |
| google_task_list_id | text | NOT NULL |
| google_task_list_title | text | nullable |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Unique: `(app_user_id, google_task_list_id)`.

---

## task_board_google_task_map

Maps a board todo to a Google Task for one user.

| Column | Type | Notes |
|--------|------|--------|
| app_user_id | uuid | PK part, FK → `app_users.id`, ON DELETE CASCADE |
| todo_id | uuid | PK part, FK → `task_board_todos.id`, ON DELETE CASCADE |
| board_id | uuid | NOT NULL, FK → `task_boards.id`, ON DELETE CASCADE |
| google_task_list_id | text | NOT NULL |
| google_task_id | text | NOT NULL |
| source_last_write | text | NOT NULL, default `taskboard` |
| source_last_modified_at | timestamptz | NOT NULL, default `now()` |
| last_synced_at | timestamptz | NOT NULL, default `now()` |
| deleted_at | timestamptz | nullable |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Unique: `(app_user_id, google_task_list_id, google_task_id)`.
Index: `(app_user_id, board_id)`.

---

## work_projects

Customer-scoped Work projects (formerly `work_boards`). Board / Sprint / Timeline
are views on a project. Optionally linked to a Planner `projects` row.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| customer_id | uuid | NOT NULL, FK → `customers.id`, ON DELETE CASCADE |
| title | text | NOT NULL |
| agents_md | text | NOT NULL, default `''`. Project instructions edited in Project settings / agents.md and returned by MCP |
| prefix | text | NOT NULL; 2–8 chars `^[A-Z][A-Z0-9]{1,7}$`; unique per customer |
| planner_project_id | uuid | nullable, FK → `projects.id`, ON DELETE SET NULL; at most one Work project per planner project |
| created_by_app_user_id | uuid | NOT NULL, FK → `app_users.id`, ON DELETE RESTRICT |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |
| archived_at | timestamptz | NULL when active; set when the project is archived |

Index: `(customer_id)`; unique `(customer_id, prefix)`; partial
`(customer_id) WHERE archived_at IS NULL`; unique `(planner_project_id) WHERE NOT NULL`.
Trigger `trg_work_projects_updated_at` → `set_updated_at()`.

Visibility is `work_project_members`. Child tables use `project_id`
(`work_issues`, `work_sprints`, `work_project_statuses`, …).

DDL: [`scripts/20260913_rove_work_boards.sql`](../scripts/20260913_rove_work_boards.sql),
[`scripts/20260914_work_board_archive.sql`](../scripts/20260914_work_board_archive.sql),
[`scripts/20260925_work_boards_to_projects.sql`](../scripts/20260925_work_boards_to_projects.sql),
[`scripts/20261015_work_project_context.sql`](../scripts/20261015_work_project_context.sql).

---

## work_project_members

People with access to a Work project (formerly `work_board_members`).

| Column | Type | Notes |
|--------|------|--------|
| project_id | uuid | PK part, FK → `work_projects.id`, ON DELETE CASCADE |
| app_user_id | uuid | PK part, FK → `app_users.id`, ON DELETE CASCADE |
| preferred_view | text | nullable; `board` \| `sprint` \| `timeline` — last view for this member |
| created_at | timestamptz | NOT NULL, default `now()` |

Index: `(app_user_id)`.

---

## work_project_statuses

Columns on a Work project (formerly `work_board_statuses`). New projects get
Todo → In progress → To be tested → In review → Done.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| project_id | uuid | NOT NULL, FK → `work_projects.id`, ON DELETE CASCADE |
| name | text | NOT NULL |
| sort_order | integer | NOT NULL, default 0 |
| is_done | boolean | NOT NULL, default false; Done-style header |

Index: `(project_id, sort_order)`.

---

## work_boards (removed)

Renamed to `work_projects` in
[`scripts/20260925_work_boards_to_projects.sql`](../scripts/20260925_work_boards_to_projects.sql).

## work_issues

Issues on a Work project. Keys are `{prefix}-{number}` with `number` unique per project.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| project_id | uuid | NOT NULL, FK → `work_projects.id`, ON DELETE CASCADE |
| number | integer | NOT NULL; sequential per project |
| title | text | NOT NULL |
| status | uuid | NOT NULL, FK → `work_project_statuses.id` |
| sort_order | integer | NOT NULL, default 0; order within a status |
| issue_type | text | NOT NULL, default `issue`; check `issue` or `bug` |
| component_id | uuid | nullable, FK → `work_components.id`, ON DELETE SET NULL |
| owner_app_user_id | uuid | nullable, FK → `app_users.id`, ON DELETE SET NULL |
| description | text | NOT NULL, default `''` |
| current_state | text | NOT NULL, default `''` |
| next_step | text | NOT NULL, default `''` |
| out_of_scope | text | NOT NULL, default `''`; Requirements tab |
| priority | text | nullable; `low` \| `medium` \| `high` |
| estimate_hours | numeric(8,2) | nullable; planned hours. Must be `>= 0` when set. Logged hours are not stored here — they are summed from Time report lines linked via `time_report_entry_lines.work_issue_id`. |
| sprint_id | uuid | nullable, FK → `work_sprints.id`, ON DELETE SET NULL |
| start_date | date | nullable; Timeline bar start |
| due_date | date | nullable; Timeline bar end; must be `>= start_date` when both set |
| created_by_app_user_id | uuid | nullable, FK → `app_users.id`, ON DELETE RESTRICT; shown as Reporter |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Unique: `(project_id, number)`. Index: `(project_id, status, sort_order)`.
Trigger `trg_work_issues_updated_at` → `set_updated_at()`.

Statuses live in `work_project_statuses` and can be added or reordered per project.
Default columns: Todo, In progress, To be tested, In review, Done.

DDL: [`scripts/20260913_work_issues.sql`](../scripts/20260913_work_issues.sql),
[`scripts/20260913_work_board_statuses.sql`](../scripts/20260913_work_board_statuses.sql),
[`scripts/20260913_work_issue_details.sql`](../scripts/20260913_work_issue_details.sql),
[`scripts/20260919_work_issue_estimate.sql`](../scripts/20260919_work_issue_estimate.sql),
[`scripts/20260924_work_issue_nullable_reporter.sql`](../scripts/20260924_work_issue_nullable_reporter.sql),
[`scripts/20260924_work_issue_priority_requirements.sql`](../scripts/20260924_work_issue_priority_requirements.sql),
[`scripts/20260924_work_issue_requirements_sections.sql`](../scripts/20260924_work_issue_requirements_sections.sql),
[`scripts/20260924_work_sprints_schedule.sql`](../scripts/20260924_work_sprints_schedule.sql),
[`scripts/20261008_work_issue_type_component.sql`](../scripts/20261008_work_issue_type_component.sql).

---

## work_components

Named product areas on a Work project (Checkout, PLP, …). Optional on each issue
(at most one). Distinct from free-form labels.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| project_id | uuid | NOT NULL, FK → `work_projects.id`, ON DELETE CASCADE |
| name | text | NOT NULL; blank names rejected |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Unique: `(project_id, lower(btrim(name)))`. Deleting a component sets
`work_issues.component_id` to null.

DDL: [`scripts/20261008_work_issue_type_component.sql`](../scripts/20261008_work_issue_type_component.sql).

---

## work_sprints

Timeboxed sprints on a Work project (Sprint mode + Timeline bands).

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| project_id | uuid | NOT NULL, FK → `work_projects.id`, ON DELETE CASCADE |
| number | integer | NOT NULL; sequential per project (`Sprint N`) |
| title | text | NOT NULL, default `''`; optional subtitle |
| starts_on | date | NOT NULL |
| ends_on | date | NOT NULL; must be `>= starts_on` |
| status | text | `current` \| `next` \| `completed`; at most one current and one next per project |
| capacity_hours | numeric(8,2) | nullable; manual capacity for Σ estimates |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Unique: `(project_id, number)`. Partial unique indexes enforce one `current` and one `next` per project.

DDL: [`scripts/20260924_work_sprints_schedule.sql`](../scripts/20260924_work_sprints_schedule.sql).

---

## work_issue_requirements

Acceptance criteria and definition-of-done checklists on a Work issue (Requirements tab).

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| issue_id | uuid | NOT NULL, FK → `work_issues.id`, ON DELETE CASCADE |
| body | text | NOT NULL |
| is_done | boolean | NOT NULL, default false |
| kind | text | NOT NULL, default `acceptance`; `acceptance` \| `dod` |
| sort_order | integer | NOT NULL, default 0 |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |

Index: `(issue_id, kind, sort_order, created_at)`.

DDL: [`scripts/20260924_work_issue_priority_requirements.sql`](../scripts/20260924_work_issue_priority_requirements.sql),
[`scripts/20260924_work_issue_requirements_sections.sql`](../scripts/20260924_work_issue_requirements_sections.sql).

---

## work_issue_references

Linked URLs on a Work issue (Requirements tab).

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| issue_id | uuid | NOT NULL, FK → `work_issues.id`, ON DELETE CASCADE |
| url | text | NOT NULL |
| label | text | NOT NULL, default `''` |
| sort_order | integer | NOT NULL, default 0 |
| created_at | timestamptz | NOT NULL, default `now()` |

Index: `(issue_id, sort_order, created_at)`.

DDL: [`scripts/20260924_work_issue_requirements_sections.sql`](../scripts/20260924_work_issue_requirements_sections.sql).

---

## work_issue_assignees

Many assignees per issue (owner is a separate field on `work_issues`).

| Column | Type | Notes |
|--------|------|--------|
| issue_id | uuid | PK part, FK → `work_issues.id`, ON DELETE CASCADE |
| app_user_id | uuid | PK part, FK → `app_users.id`, ON DELETE CASCADE |
| created_at | timestamptz | NOT NULL, default `now()` |

Index: `(app_user_id)`.

---

## work_issue_labels

Free-text labels scoped to a project.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| project_id | uuid | NOT NULL, FK → `work_projects.id`, ON DELETE CASCADE |
| name | text | NOT NULL |
| created_at | timestamptz | NOT NULL, default `now()` |

Unique: `(project_id, lower(name))`.

---

## work_issue_label_links

| Column | Type | Notes |
|--------|------|--------|
| issue_id | uuid | PK part, FK → `work_issues.id`, ON DELETE CASCADE |
| label_id | uuid | PK part, FK → `work_issue_labels.id`, ON DELETE CASCADE |
| created_at | timestamptz | NOT NULL, default `now()` |

---

## work_issue_relations

Directed links between two issues on the same project.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| project_id | uuid | NOT NULL, FK → `work_projects.id`, ON DELETE CASCADE |
| from_issue_id | uuid | NOT NULL, FK → `work_issues.id`, ON DELETE CASCADE |
| to_issue_id | uuid | NOT NULL, FK → `work_issues.id`, ON DELETE CASCADE |
| kind | text | NOT NULL; `blocks`, `relates`, `parent` |
| created_at | timestamptz | NOT NULL, default `now()` |

`from_issue_id` must differ from `to_issue_id`. Unique `(from_issue_id, to_issue_id, kind)`.

Meaning:
- `blocks`: from blocks to (inverse: to is blocked by from)
- `relates`: undirected; stored with `from_issue_id < to_issue_id`
- `parent`: from is parent of to. At most one parent per child.

Same project only. Parent and blocks cycles are rejected in the app.

Indexes: `(project_id)`; `(to_issue_id)`; unique parent on `to_issue_id` where `kind = 'parent'`.

DDL: [`scripts/20260919_work_issue_relations.sql`](../scripts/20260919_work_issue_relations.sql).

---

## work_issue_comments

Flat comments, newest first. No mentions or attachments.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| issue_id | uuid | NOT NULL, FK → `work_issues.id`, ON DELETE CASCADE |
| author_app_user_id | uuid | NOT NULL, FK → `app_users.id`, ON DELETE RESTRICT |
| body | text | NOT NULL |
| created_at | timestamptz | NOT NULL, default `now()` |

Index: `(issue_id, created_at)`.

---

## work_issue_events

Activity log for status, owner, assignees, labels, comments, files, title, and text fields.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| issue_id | uuid | NOT NULL, FK → `work_issues.id`, ON DELETE CASCADE |
| actor_app_user_id | uuid | NOT NULL, FK → `app_users.id`, ON DELETE RESTRICT |
| kind | text | NOT NULL; `created`, `title`, `status`, `owner`, `assignees`, `labels`, `description`, `current_state`, `next_step`, `comment`, `file`, `relation`, `estimate` |
| summary | text | NOT NULL |
| created_at | timestamptz | NOT NULL, default `now()` |

Index: `(issue_id, created_at)`.

---

## work_issue_files

Issue attachments stored in Postgres (`bytea`, max 8 MB in app code).

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| issue_id | uuid | NOT NULL, FK → `work_issues.id`, ON DELETE CASCADE |
| file_name | text | NOT NULL |
| mime_type | text | NOT NULL |
| byte_size | integer | NOT NULL |
| content | bytea | NOT NULL |
| uploaded_by_app_user_id | uuid | NOT NULL, FK → `app_users.id`, ON DELETE RESTRICT |
| created_at | timestamptz | NOT NULL, default `now()` |

Index: `(issue_id, created_at)`.

---

## feature_requests

**Deprecated.** New feature requests are Work issues on the “Rove Apps” board.
The FAB writes there directly. Existing rows were migrated to that board; the
table may still exist for historical reference but is unused by the app.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| content | text | NOT NULL |
| created_at | timestamptz | NOT NULL, default `now()` |
| updated_at | timestamptz | NOT NULL, default `now()` |
| submitted_by_email | text | nullable |
| is_implemented | boolean | NOT NULL, default false |
| declined_at | timestamptz | nullable |
| decline_comment | text | nullable |

---

## user_notifications

In-app notifications for authenticated users.

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK, default `gen_random_uuid()` |
| app_user_id | uuid | NOT NULL, FK → `app_users.id`, ON DELETE CASCADE |
| kind | text | NOT NULL, e.g. `allocation_booked`, `feature_request_implemented`, `feature_request_declined` |
| payload | jsonb | NOT NULL, default `{}` |
| read_at | timestamptz | nullable; null = unread |
| created_at | timestamptz | NOT NULL, default `now()` |

Indexes: `(app_user_id, created_at DESC)`;
`(app_user_id) WHERE read_at IS NULL`.

---

## Views

Read models (column lists from the live catalog).

### allocated_vs_reported

`consultant_id`, `project_id`, `year`, `week`, `week_start_date`,
`week_label`, `consultant_name`, `project_name`, `customer_name`,
`allocated_hours`, `reported_hours`, `diff_hours`, `utilization_pct`.

### v_consultant_forecast

Monthly forecast from allocations, calendars, and rates (consultants,
customers, projects, teams). Present in production; may be absent in some
dev snapshots.

### v_consultant_monthly_summary

Monthly consultant KPIs: hours, income, leave types, utilization, occupancy,
budget, `external`.

### v_consultant_util

Monthly utilization from reported time, calendars, and allocations. Present
in production; may be absent in some dev snapshots.

### v_consultant_util_vs_forecast

Join of `v_consultant_util` and `v_consultant_forecast`. Present in
production; may be absent in some dev snapshots.

### v_time_report_looker

Flattened time-report export for Looker (entry, consultant, customer, project,
Jira, ClickUp, DevOps, PM edits, late-entry flags).

`jira_devops_key` values `jira:…`, `clickup:…`, and `devops:…` join
`jira_issues`, `clickup`, and `devops_work_items` respectively. ClickUp fields
are also coalesced into the existing `Jira*` columns so reports that already
use `JiraKeyAndSummary` / `JiraType` / `JiraEstimate` include ClickUp without
Looker chart changes. Dedicated `ClickUp*` columns are available for new
charts. Also exposes `EntryCreatedAt` and `LateEntry` (created month after
entry month). `Currency` is `currency_snapshot`, else the customer's
`billing_currency`, else `SEK`. `Income` is hours × rate in that currency for
**hourly** projects; for `projects.billing_type = fixed`, **Rate** is null and
**Income** is 0 (contract value is not row-allocated). Do not sum Income across
currencies. Exposes `BillingType`. `RoleName` is
`COALESCE(role_name_snapshot, roles.name)` so custom customer/project tasks
(Workshop, Onsite, …) appear in RoleName.

Apply / refresh: [`scripts/20261008_project_billing_type.sql`](../scripts/20261008_project_billing_type.sql)
(also updates `v_time_report_looker`). Prior:
[`scripts/20261006_customer_project_custom_rates.sql`](../scripts/20261006_customer_project_custom_rates.sql),
[`scripts/20261005_v_time_report_looker_clickup.sql`](../scripts/20261005_v_time_report_looker_clickup.sql).
Customer currency DDL: [`scripts/20261005_customer_billing_currency.sql`](../scripts/20261005_customer_billing_currency.sql).

---

## Operational tables (not application schema)

`time_report_entries_backup_20260503` and
`time_report_entries_backup_20260509` are snapshot copies of
`time_report_entries`. Do not write to them from the app.

---

## Functions and triggers (app-owned)

| Function | Used by |
|----------|---------|
| `set_updated_at()` | BEFORE UPDATE on allocations, calendars, calendar_holidays, consultants, customer_rates, customers, projects, roles, teams, work_projects, work_issues |
| `enforce_customer_user_rules()` | BEFORE INSERT/UPDATE on `app_users`, `app_user_apps`, `consultants`, `customer_app_users`, `customers` |
| `clear_customer_contact_on_unlink()` | AFTER DELETE on `customer_app_users` |

The public schema also contains extension functions (`pgcrypto`, `dblink`).
Those are not part of the application model.

---

## Relationship summary

- **customers** → **projects** → **allocations** / **time_report_entries**
- **app_users** ↔ **apps** via **app_user_apps**; Rove accounts must have one or more apps; `customer` accounts may have Work only
- **work_projects** belong to **customers**; visibility is **work_project_members**; **work_issues** belong to a project (`prefix` + per-project `number`) with owner, assignees, labels, comments, events, and files
- **app_users** → zero or one **consultants** profile via `consultants.app_user_id` (not allowed when `role = customer`)
- **consultants** ↔ **customers** via **customer_consultants**
- **customer** role **app_users** ↔ **customers** via **customer_app_users**; `customers.contact_app_user_id` picks one of those users
- **time_report_entry_lines** (week row) → **time_report_entries** (day cells) + **time_report_week_revisions**
- **customer_rates** / **project_rates** + **roles** drive pricing; **time_report_entries.rate_snapshot** stores the rate at save
- **jira_issues** / **devops_work_items** / **clickup** integrate with **projects** for issue pickers
- **task_boards** → **task_board_members** / **task_board_todos**; Google sync via **google_user_connections** + map tables
