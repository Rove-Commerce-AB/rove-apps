# Rove Support — architecture & product brief

Status: **MVP implemented in app** (apply `scripts/20261021_rove_support.sql` to each environment).  
Date: 2026-10-21 (updated same day with first implementation)  
Scope: product IA, access model, data model, Work integration, monitoring placement, phased delivery.

This document captures agreed decisions from product design discussion. Implementation lives under `/support`, customer drawer Support tab, and related `src/lib/support*.ts` modules.

---

## 1. Product intent

**Rove Support** is the collaboration surface between Rove and customers:

- Raise and follow **support cases** (backed by Work)
- See **monitoring / drift status** for their sites
- See **contact paths and support schedule**
- Internally: operate monitoring, triage across customers, manage contracts

**Rove Monitor is not a separate app.** Monitoring is a module inside Support (plus master-data hooks on the customer). The existing Cloud Run worker pool `rove-support-worker` and schema `monitoring.*` remain the runtime; this repo owns UI, access, and customer master data.

---

## 2. Decision log (locked)

| # | Topic | Decision |
|---|--------|----------|
| D1 | App placement | Single **Rove Support** app (replace sidebar placeholder). Not a separate Monitor app. |
| D2 | Support contract | Master data on the customer (`support_contracts` + tiers Bas / Utökad / future). Unlocks Support modules beyond monitoring. Includes **contract value**. Edited in **Customer drawer → Support** tab. |
| D3 | Monitoring without contract | Allowed. Monitors may exist for customers with no active support contract. |
| D4 | Monitor UX | **A (customer):** read-only status / uptime / incidents. **B (staff):** full CRUD + config. |
| D5 | Navigation | Work-like **customer tree** + staff **Overview**. |
| D6 | Customer tree visibility | Only customers the person is linked to (`customer_app_users`). |
| D7 | Overview visibility | Staff only; shows **all** customers/monitors (jour radar). Customer-role users **never** see Overview. |
| D8 | Monitor CRUD location | Under **customer → Drift**; Overview is status + deep-links. Move out of Settings in the same delivery sweep. |
| D9 | Cases vs Work | Cases **are** Work issues on an auto-provisioned support project per customer. |
| D10 | Auto board | Activating a support contract ensures a linked Work project (prefix `SUP`, unique per customer). |
| D11 | Board members | At creation: all **staff** linked to the customer; **exclude** `role = customer`. Sync = **at creation only** (not continuous). |
| D12 | Customer cases access | Customer users see/create cases **via Support**, without being Work board members. |
| D13 | Bas / Utökad | Metadata (and value) only for MVP; no feature gating by tier yet. |
| D14 | Settings Monitors | Relocate into Support in the same epic (Settings keeps only global admin leftovers if any, e.g. Slack destinations later). |

---

## 3. Information architecture

```
Rove Support
├── Overview                          [staff only]
│     Cross-customer monitor status, open incidents, filters
│     Deep-link → customer Drift (staff CRUD)
│
└── [Customer]                        [if actor linked to customer]
      ├── Drift / Monitors            [always if monitors exist OR staff creating]
      │     Customer role → view A (read-only)
      │     Staff → view B (CRUD)
      ├── Cases (Ärenden)             [only if active support contract]
      │     Work issues on support project
      └── Contact                     [only if active support contract]
            Schedule, channels, how to reach us
```

### Sidebar

- Replace `NavPlaceholder` “Rove Support” with a real `AppGroup` (same pattern as Work).
- Remove **Settings → Monitors** (or redirect to Support Overview / first customer).
- Customer drawer gains tab **Support** (contract master data) — this is *Settings → Customers*, not the Support app.

### Module visibility matrix

| Surface | Staff (linked) | Staff Overview | Customer role | No contract |
|---------|----------------|----------------|---------------|-------------|
| Overview | — | Yes (all customers) | No | N/A |
| Customer in tree | If linked | N/A | If linked | If linked |
| Drift | Yes (B) | Via link | Yes (A) if policy allows | Yes (monitors may exist) |
| Cases | Yes | — | Yes (via Support API) | Hidden |
| Contact | Yes | — | Yes | Hidden |
| Contract edit | Customer drawer (admin/member per existing customer edit rules) | — | No | — |

**Customer visibility of Drift without contract:** allowed for linked customer users if the customer has monitors (status transparency). If product later wants Drift only with contract, gate with the same flag as Cases — do not change monitoring worker behavior.

---

## 4. Access control

### 4.1 Primitives (reuse)

- `app_users.role`: `admin` | `member` | `customer`
- `customer_app_users`: person ↔ customer assignment (already drives Work customer lists)
- Work: `work_project_members` for board membership
- Monitoring: today admin-only UI (`assertAdmin` in `monitors.ts`) — **must widen** for Support staff CRUD under customer, keep Overview/CRUD staff-only

### 4.2 New capability helpers (proposed)

Centralize in something like `src/lib/supportAccess.ts` (mirrors `workAccess.ts`):

| Function | Rule |
|----------|------|
| `canSeeSupportApp(actor)` | Staff always (or via future `support` AppKey). Customer if linked to ≥1 customer **and** (has Work/Support access policy — see AppKey below). |
| `canSeeSupportOverview(actor)` | `admin` or `member` only. Never `customer`. |
| `listSupportNavCustomers(actor)` | Intersection of active customers and `customer_app_users` for actor. Admins: either all customers or still assignment-based — **recommend assignment-based for tree**, Overview unrestricted for staff. |
| `canSeeSupportCustomer(actor, customerId)` | Linked via `customer_app_users`, or admin policy (prefer: admin also needs link for tree consistency; Overview bypasses). |
| `canManageMonitors(actor, customerId)` | Staff + `canSeeSupportCustomer`. Not customer role. |
| `canViewMonitors(actor, customerId)` | Staff as above, or customer role linked to customer. |
| `canUseSupportCases(actor, customerId)` | Active support contract **and** (`canSeeSupportCustomer` or customer linked). |
| `canEditSupportContract(actor, customerId)` | Same as editing other customer master data (admin / assigned member — follow existing Customers permissions). |

### 4.3 AppKey strategy

Today: `APP_KEYS = planner | time_report | insights | work`; customers may only receive `work`.

**Recommendation for long-term:**

1. Add AppKey **`support`** (staff + customer-assignable).
2. Customer-role users with Support access get `support` (and typically still `work` if they use Work elsewhere).
3. Until AppKey ships, temporary rule: customer with `work` + linked customer + active contract can open Cases; Drift if monitors exist.

Do **not** overload Work membership to mean Support portal access — that fights D12.

### 4.4 Cases without Work membership (D12)

Customer users must **not** be added to `work_project_members` on the support board.

Implementation pattern:

- Support Cases UI calls dedicated server actions / queries that:
  - Assert `canUseSupportCases`
  - Assert issue belongs to `support_work_project_id` for that customer
  - Create/update issues as a **system/staff proxy actor** or as the customer user with a **support-scoped bypass** of membership checks (narrow, project-id allowlist only)
- Prefer: extend Work issue create/list with an explicit `accessMode: "support_portal"` path that only allows the linked support project, rather than sprinkling exceptions across Work.

Staff who are board members use normal Work permissions when opening the board in Work; Support Cases can reuse the same issue APIs with membership.

### 4.5 Overview vs tree (D6 / D7)

| | Tree | Overview |
|--|------|----------|
| Staff | Assigned customers only | All customers with monitors (and/or all with contract) |
| Customer | Their linked customers | Hidden |

Support people who need the full tree must be **manually linked** to each customer in People/Customers (accepted operational cost). Overview still works for jour without linking.

---

## 5. Data model

### 5.1 Support contracts (new)

Prefer a dedicated table (history + value + period) over a boolean on `customers`.

```sql
-- Conceptual DDL (to be finalized in a migration script)

CREATE TABLE support_contract_tiers (
  code text PRIMARY KEY,           -- 'bas' | 'utokad' | future
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

INSERT INTO support_contract_tiers (code, name, sort_order) VALUES
  ('bas', 'Bas', 1),
  ('utokad', 'Utökad', 2);

CREATE TABLE support_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  tier_code text NOT NULL REFERENCES support_contract_tiers(code),
  active boolean NOT NULL DEFAULT true,
  value_amount numeric(12,2),      -- contract value
  value_currency text NOT NULL DEFAULT 'SEK',
  starts_on date,
  ends_on date,
  notes text,
  support_work_project_id uuid REFERENCES work_projects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_app_user_id uuid REFERENCES app_users(id),
  CONSTRAINT support_contracts_value_nonnegative
    CHECK (value_amount IS NULL OR value_amount >= 0)
);

-- At most one *active* contract per customer (enforce in app or partial unique index)
CREATE UNIQUE INDEX support_contracts_one_active_per_customer
  ON support_contracts (customer_id)
  WHERE active;
```

**Active contract** = `active AND (ends_on IS NULL OR ends_on >= current_date)` (exact rule TBD; keep one function `customerHasActiveSupportContract(customerId)`).

Deactivating a contract:

- Does **not** delete or archive the Work support project
- Hides Cases / Contact in Support
- Leaves monitors and board history intact
- Clears or keeps `support_work_project_id` link (keep)

### 5.2 Link to Work project

- `support_contracts.support_work_project_id` → `work_projects.id`
- Optional denormalized `work_projects.is_support_board boolean` (or `purpose = 'support'`) for safe detection if title is renamed
- Prefix: **`SUP`** — already unique **per customer** via `work_projects_customer_prefix_idx`

### 5.3 Monitoring (existing — no schema fork)

Reuse:

- `monitoring.monitors.customer_id` + `customer_name_snapshot`
- `monitor_state`, `incidents`, `check_runs`, Slack outbox tables
- Worker: `rove-support-worker` (separate repo / Cloud Run worker pool)

**Note:** There is currently **no FK** from `monitoring.monitors.customer_id` → `customers.id`. App validates on write. Long-term: add FK when comfortable with delete/archive rules (RESTRICT recommended).

### 5.4 Contact content (MVP)

Start simple — either:

- Columns on `support_contracts` / customer support profile text fields, or
- `support_customer_profiles (customer_id, contact_markdown, schedule_markdown)`

Avoid building a full CMS. Global default blurb + per-customer override is enough for MVP.

---

## 6. Work integration — auto support board

### 6.1 Trigger

When a support contract is **activated** (create active row or flip `active` false→true):

1. If `support_work_project_id` set and project exists → reuse  
2. Else if a project marked `is_support_board` exists for customer → link it  
3. Else `createWorkBoard(customerId, "Support", "SUP", memberIds)` with staff-only members  
4. Persist project id on the contract  

If prefix `SUP` taken by a non-support board → use `SUP2` / next free, or fail with clear admin message (prefer explicit failure over silent wrong board).

### 6.2 Initial members (D11)

At creation only:

```
members = customer_app_users for customer
  JOIN app_users WHERE role IN ('admin', 'member')
```

Exclude `role = customer`.

**Implication of “sync only at creation”:** staff added to the customer later are **not** auto-added to the support board. They still see the customer in Support tree (via `customer_app_users`) and can use Cases via Support APIs if we grant staff Cases by customer link + board membership OR by staff Support bypass.

Clarify staff Cases access:

- **Recommended:** staff with `canSeeSupportCustomer` may use Support Cases UI even if not on `work_project_members` (same support-scoped path as customers, but staff). Optionally also add them to the board when they open Cases the first time — out of scope unless requested.
- Opening the board inside **Work** still requires membership; ops may add members manually.

Document this operational caveat in People training.

### 6.3 Default columns / template

Use `DEFAULT_WORK_PROJECT_STATUSES` or a Support-specific template, e.g.:

- New  
- In progress  
- Waiting on customer  
- Done (`isDone`)

Can refine later; not tier-gated in MVP.

### 6.4 Issue identity

- Keys: `SUP-123` (per project numbering — already how Work works)
- Support Cases list = `listIssues` filtered to `support_work_project_id`
- Optional label `support` redundant if dedicated board

---

## 7. Monitoring UX detail

### 7.1 View A — customer (read-only)

- Monitor name, status (up/down/unknown), last checked  
- Uptime summary for selected range (reuse incident/uptime APIs from #23/#24)  
- Incident list (date-filtered)  
- No enable/disable, no edit URL/interval, no delete  
- Optional: “Report issue” → creates Support case when contract active  

### 7.2 View B — staff (under customer → Drift)

- Full current Monitors CRUD (move from Settings)  
- Incidents detail links  
- Enabled toggle, intervals, expected status, etc.  

### 7.3 Overview — staff

- Table/cards: customer, monitor, status, active incident, last check  
- Filters: down only, customer, search  
- Click → `/support/{customerId}/monitors` or `/support/{customerId}/monitors/{id}`  
- No requirement to be linked to customer  

### 7.4 Migration from Settings

- Routes: `ROUTES.monitors` → redirect to Support Overview  
- Sidebar: remove Settings → Monitors  
- Reuse `src/lib/monitors.ts`, `monitorIncidents.ts`, components; change auth from blanket `assertAdmin` to `canManageMonitors` / `canViewMonitors`  
- Keep admin-only for any global Slack webhook admin UI if introduced  

---

## 8. System context (as-is dependencies)

```
┌─────────────────────┐     ┌──────────────────────────┐
│ rove-planner        │     │ rove-support-worker      │
│ (this repo)         │     │ (GitHub, Cloud Run       │
│                     │     │  Worker Pool)            │
│ Support UI          │     │ Ping → Postgres          │
│ Contract master data│     │ Slack webhook outbox     │
│ Work boards/issues  │     │ BigQuery heartbeats      │
└─────────┬───────────┘     └────────────┬─────────────┘
          │                              │
          └──────────┬───────────────────┘
                     ▼
              Cloud SQL rove-erp
              public.customers
              public.work_*
              monitoring.*
```

Deploy/ownership:

- Schema migrations for `support_*` and UI: **rove-planner**
- Probe loop / Slack send / BQ export: **rove-support-worker**
- Do not duplicate worker logic in Next.js

---

## 9. Suggested routes

```
/support                          → redirect Overview (staff) or first customer (customer)
/support/overview                 → staff Overview
/support/[customerId]             → redirect to drift or cases
/support/[customerId]/monitors    → Drift (A or B by role)
/support/[customerId]/monitors/[id]/incidents  → (reuse existing incidents page pattern)
/support/[customerId]/cases       → Cases list/detail
/support/[customerId]/contact     → Contact
```

Customer drawer (existing Customers settings):

```
/settings/customers → drawer tab "Support"
```

---

## 10. Phased delivery

### Phase 0 — Foundations

- `support_contract_tiers` + `support_contracts` migration  
- Customer drawer **Support** tab (tier, active, value, dates, notes)  
- `supportAccess.ts` + tests  
- AppKey `support` (or interim policy)  

### Phase 1 — Shell + monitoring move (D14)

- Replace Support placeholder with AppGroup + customer tree  
- Overview (staff)  
- Move Monitors CRUD to customer Drift; redirect old Settings route  
- View A vs B by role  
- Widen monitor auth beyond admin-only as per §4  

### Phase 2 — Contract → Work board

- On activate: provision/link `SUP` board, staff members only at creation  
- Cases UI over that project  
- Customer create/list via support-scoped Work access path  

### Phase 3 — Contact + polish

- Contact/schedule content  
- “Report issue from incident”  
- Optional: FK monitors→customers; continuous member sync (future — not MVP)  

### Out of scope for MVP

- Tier-based feature flags (Bas vs Utökad)  
- Continuous Work membership sync when People change  
- Separate Monitor app  
- Customer access to Overview  
- Auto-archive Work board when contract ends  
- Replacing Slack worker behavior  

---

## 11. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Staff added to customer after board create lack Work membership | Document; Support Cases staff path by customer link; manual add in Work Access |
| Customer users gain Work board powers | Never add them to `work_project_members`; narrow support-scoped APIs |
| Prefix `SUP` collision | Detect `is_support_board` / linked id; fail loudly if foreign project owns `SUP` |
| Overview too heavy | Paginate; default filter “down or incident open” |
| Admin-only monitors today blocks support staff | Replace `assertAdmin` with `canManageMonitors` carefully; audit who can delete |
| Two truths for “active contract” | Single helper function; partial unique index |
| Token/AppKey sprawl for customers | Add `support` to `CUSTOMER_APP_KEYS` deliberately |

---

## 12. Open implementation choices (non-blocking)

These do not reopen product intent; pick during build:

1. Admin: assignment-required for Support **tree**, or see all customers in tree? (Overview already all.)  
2. Exact “active” date rule for contracts.  
3. Whether customer users see Drift with zero contract (recommend yes if monitors exist).  
4. Support-scoped Work API: proxy actor vs membership bypass flag.  
5. Whether Slack webhook admin UI stays in Settings or Support Admin.  

---

## 13. Acceptance criteria (MVP definition of done)

1. Customer drawer can set Bas/Utökad, value, period, active.  
2. Activating contract creates/links Work project `Support` / `SUP` with staff-only initial members.  
3. Support nav lists only linked customers; Overview (staff) lists all monitor status.  
4. Customer role cannot open Overview.  
5. Customer role can list/create cases on the support project without board membership.  
6. Monitors CRUD lives under customer Drift; Settings → Monitors gone or redirects.  
7. Customers without contract still can have monitors; Cases/Contact hidden.  
8. Bas vs Utökad do not change feature set yet.  
9. Existing `rove-support-worker` continues to operate against `monitoring.*` unchanged.  

---

## 14. References in codebase (today)

- Monitors UI/API: `src/lib/monitors.ts`, `src/app/(app)/settings/monitors/**`  
- Incidents/uptime: `src/lib/monitorIncidents.ts`, `monitorIncidentFilters.ts`  
- Monitoring SQL: `scripts/20261021_monitoring_*.sql`  
- Work create board: `createWorkBoard` in `src/lib/workBoards.ts`  
- Customer ↔ people: `customer_app_users` / `src/lib/customerAppUsersQueries.ts`  
- Customer drawer tabs: `src/components/CustomerDrawerContent.tsx`  
- Support placeholder: `Sidebar.tsx` (`NavPlaceholder` “Rove Support”)  
- Worker: repo `Rove-Commerce-AB/rove-support-worker`, Cloud Run worker pool `rove-support-worker`  
- Kuma/history: `doc/KUMA_HISTORY_IMPORT.md`  
