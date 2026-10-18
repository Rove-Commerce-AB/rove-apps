# UI Patterns (Contract)

This document is binding. If it conflicts with other docs, DESIGN_SYSTEM.md wins.

Colors, type, radius, and shadows in this file refer to **semantic tokens** in DESIGN_SYSTEM.md (`accent/*`, `interactive/*`, `status/*`, `surface/*`, `text/*`, `border/*`). Do not use retired names (`brand.signal`, `--color-accent-dim`, `--color-status-ok`).

---

## 1) Overview list page (mandatory structure)

```
PageHeader        (Heading/XL title + Body/L description, right-aligned primary CTA)
Toolbar           (search + SegmentedControl on one row)
DataTable         (on the page canvas — no Panel frame)
```

If grouping is needed (e.g. Internal / External):
- Prefer `SegmentedControl` over stacked `PanelSection` groups when the same columns apply.

### Do
- Put the page title on the canvas (`PageHeader`), not inside `PanelHeader`.
- Search and `SegmentedControl` share one toolbar row. Search is not full-bleed.
- Sort in the **column header** (arrow on the active column), not a separate toolbar Sort control.
- One primary CTA: `interactive/primary` (or `accent/primary` inside an accent app). Default button size, not compact.
- Unselected segmented options use `interactive/secondary-hover`; only the selected option is `interactive/primary`.

### Don't
- Do not wrap the overview table in a bordered `Panel`. The table is white (`surface/default`) on the gray page canvas, with a `blue/100` header.
- Do not create multiple different table styles across pages.
- Do not use “Show inactive” text links when `SegmentedControl` can replace them.
- Do not add a “Showing n of m” footer unless Figma specifies it.

---

## 2) DataTable (required component)

All tables must use `DataTable` from `src/components/ui/`.
No raw `<table>` markup in pages or features.

### Required props
| Prop          | Type                                  | Notes                                  |
|---------------|---------------------------------------|----------------------------------------|
| `columns`     | column config array                   | header, alignment, cell renderer       |
| `rows`        | typed array                           | fully prepared – no logic in the table |
| `getRowId`    | `(row) => string`                     |                                        |
| `rowHref`     | `(row) => string` (optional)          | use OR onRowClick, not both            |
| `onRowClick`  | `(row) => void` (optional)            | use OR rowHref, not both               |
| `sort`        | `{ columnId, direction, onSort }` (optional) | header sort control; page owns order   |
| `emptyState`  | `{ title, description, action }`      |                                        |
| `loading`     | boolean                               | shows skeleton rows                    |
| `density`     | `"compact"` \| `"comfortable"`        | default: `"comfortable"`               |
| `stickyHeader`| boolean                               | default: `true` inside panel           |

### DataTable is "dumb"
- No business logic
- No calculations
- No direct database calls (data comes from server props / server actions)
- Receives fully prepared data only

### Visual behavior
- Sticky header on `table/header` (`blue/100`)
- Header type: Heading/XS, **semibold**, `text/primary`
- Comfortable density: table sits on `surface/default`, top corners `radius/lg`, header clipped to those corners, `shadow/primary` under the table
- Row dividers: `border/default` (visible hairline on white). No divider under the last row. No vertical rules.
- Sortable columns render a chevron in the header of the active sort column only
- Row hover: `interactive/secondary` (`zinc/100`)
- Selected row (overlay open): `nav/active`
- Focus-visible uses `focus/default` or `accent/focus`
- Actions column: fixed width, right-aligned, icon buttons only

### Table typography
- Header: Heading/XS, semibold, `text/primary`
- Column 1 (name/title): Label/L, `text/primary`
- Other cells: Body/L (`text/primary`, or `text/secondary` for metadata)
- Numbers: Body/L + `tabular-nums`

---

## 3) States (required for all tables and list views)

| State   | Implementation                                              |
|---------|-------------------------------------------------------------|
| Loading | Skeleton rows (not a spinner in the corner)                 |
| Empty   | `EmptyState` component inside the panel, with CTA          |
| Error   | Inline Callout/Alert inside the panel (not toast-only)      |

Status callouts:
- Info: `status/info` on `status/info-subtle`
- Success: `status/success` on `status/success-subtle`
- Warning: `status/warning` on `status/warning-subtle`
- Danger: `status/danger` on `status/danger-subtle`

---

## 4) Row interaction (choose one per table, be consistent)

**Option A (preferred):** Whole row navigates to detail. Optional icon-button actions on the right. For Settings master data (Consultants and Customers), row navigation opens a **right SideDrawer overlay** and updates the URL (`/settings/[resource]/[id]`) so the row is linkable. Back, X, Escape, and overlay click return to the list URL.

Keep the list in a **shared layout** so opening a row does not remount the page. Open the drawer immediately on click (local state + `router.push` with `scroll: false`). The drawer **slides in from the right**; the overlay fades. Do not show a full-page loading state on that navigation.

**Option B:** Explicit actions column only. Row itself is not clickable.

Do not mix unclear click targets. If a row has clickable sub-elements, use Option B.

---

## 5) Empty state copy pattern

```
Title:       What is missing (noun phrase)     → Heading/S
Description: Why it matters or what to do next → Body/M, text/secondary
CTA:         Primary button ("Add [thing]")    → Label/M
```

Example:
- Title: "No consultants yet"
- Description: "Add your first consultant to start planning allocations."
- CTA: "Add consultant"

---

## 6) Allocation / planning table (special case)

The allocation grid (week columns × consultant rows) is a specialized DataTable variant.
It follows all DataTable rules plus:

- **Week columns**: fixed minimum width, center-aligned values.
- **Row + column hover**: overlay `interactive/primary` (saturated), never `*-subtle` — subtle tokens read as white on the grid.
- **Current week column**: `accent/primary-subtle` background. Header uses `accent/primary-text` and a bottom border in `accent/primary`.
- **Month group headers**: span multiple week columns, separated by `border/strong`.
- **Allocation pills**: small cells with `radius/sm`. Color-coded:
  - 100%: `status/success` on `status/success-subtle`
  - >100%: `status/danger` on `status/danger-subtle`
  - 75–99%: `status/warning` on `status/warning-subtle`
  - <75%: `text/tertiary` on `surface/subtle`
  - Empty: transparent, no text
- **Consultant name column**: sticky left. Avatar (initials circle, `radius/full`) + name (Body/M) + team (Body/S, `text/secondary`).
- **Sticky header**: both the month row and the week-number row must be sticky.
- **Summary row** (week total / revenue total): `surface/subtle`, Label/S, `tabular-nums`.

Planner views currently share the default `interactive/*` accent with the rest of Rove Apps. Do not set `data-app="planner"` until a dedicated Planner theme is wanted.

---

## 7) Consultant list (example composition)

### Page chrome
- Title: Consultants (Heading/XL). Description: “Manage your consultant team members and their assignments.”
- Search placeholder: “Search consultants…” (fixed width, not full row).
- `SegmentedControl` on the same row as search. All (n), each team (n) with the `Team` prefix stripped (`Stockholm (8)`), External resources. Inactive consultants are hidden from the table (direct URL can still open the drawer).
- Sort: clickable column headers. Default Name ascending. Active column shows a chevron.

### Columns
| Column | Style |
|--------|--------|
| Name     | `InitialsAvatar` (32px, saturated + inverse initials) + name (Label/L, `text/primary`) |
| Team     | Body/L, `text/secondary` (strip leading `Team `) |
| Role     | Body/L, `text/secondary` |
| Capacity | `CapacityBar` from work % |
| Overhead | `CapacityBar` from overhead % |

Column order is Name, Team, Role, Capacity, Overhead. There is no Calendar column in the list.

### Drawer
- Header: 40px avatar, name (Heading/L bold) and `status/success-subtle` pill on the **same line** (`{role} · {team}` with a success dot), then “Consultant since {Mon D, YYYY}”. Close is a bordered icon button.
- Tabs: Overview + Projects (Projects is an empty state until that data exists). Active tab is semibold `text/primary` with a 2px underline under the label (`px-1`, `gap-6`).
- Identity rows (Name, Team, Role, Email, Start date, End date, Date of birth): `DrawerFieldRow` — gray label left (`w-36`), value `flex-1` with **quiet fields** (no permanent border; wash on hover; border/focus only while editing). Team/Role show a chevron. Email uses `text/link`. No phone field. No per-row dividers.
- Section dividers are **full-width** `border/subtle` lines (edge to edge), not inset with the field padding. Groups: identity → metrics → calendar/type → delete.
- Metrics: **Calendar time** (`{n}h`), **Capacity** and **Overhead** (`CapacityBar` size `drawer`) with semibold `text/primary` labels and unboxed values on the right. Follow quiet-field density (`py-1.5` / `py-2`).
- Calendar and Type stay in the last group. Type is a ghost pill (`interactive/secondary`).
- **Delete consultant** sits at the bottom of the drawer (`mt-auto`).
- Animation: slide in from the right; list stays mounted.

---

## 8) Quiet fields & drawer forms (mandatory)

Follow **Quiet fields** in DESIGN_SYSTEM.md. Summary for implementers:

- Settings / customer / consultant / project drawers: `DrawerFieldRow` (label `w-36`, value `flex-1`, tight vertical padding). Display values use quiet triggers (`drawerEditTriggerClass` / `drawerSelectTriggerClass`) — no always-on bordered value box.
- Work / settings drawer **collection CRUD** uses shared `DrawerItemList`: flat `divide-y` rows, click-to-edit labels, hover remove (X), quiet compose — not bordered list boxes. Checklists add a checkbox via `renderLeading`; Components / similar masterdata use the same shell without a checkbox.
- Do not wrap drawer item lists in `rounded-lg border border-border-subtle`. Action rows (e.g. Import providers) also use flat `divide-y` only.
- `OptionSegments` in drawers: muted track, no outer border, selected option as raised surface without a heavy ring.
- `--color-border-form` maps to `border/subtle`. Do not reintroduce `border/default` as resting form chrome.

### Grouped lists in drawers (Customer Projects, People, Rates, etc.)

Group headers are **meta chrome**, not list rows. Use shared `DrawerListGroup` / `DrawerListGroupHeader` (+ `drawerListRowClass`):

- Header: Label/S, semibold, uppercase, `text/tertiary`, on a soft `surface/subtle` band (`bg-bg-muted/60`). Count as normal-case tertiary. Optional quiet `+ Add` in the header — not a primary `Heading/S` page title above the list.
- Rows: `divide-y`, primary title (`text-sm font-medium text/primary`), hover wash; destructive actions appear on row hover. Project rows may add a status dot / probability chip / Work icon via `CustomerProjectGroup`.
- Apply the same pattern for People (Consultants, Customer users), Rates/Tasks, and other drawer collection tabs — not only Projects.

### Danger zone panels (mandatory)

Destructive sections in drawers/settings (Delete, Archive, Revoke, Remove login/profile, etc.) use one shared shell:

```
rounded-lg border border-danger/30 bg-danger/5 p-4
```

- Title: `text-label-l text-danger` (“Danger zone”)
- Body: Body/S or `text-sm` on `text/secondary`
- Destructive CTA: `Button` `variant="dangerSecondary"` `size="sm"` (`mt-3`) — outline with red text, not filled `danger`
- Non-destructive helpers inside the panel (e.g. generate temp password) may stay `secondary`
- Confirm modals keep `variant="danger"` on the confirm action

**Hard vs soft delete (customers & people):**
- Soft: Active / Inactive (`OptionSegments`) — hides from default lists; keeps history
- Hard: Delete — permanent; **blocked** when time report (or planning) history exists; tell the user to Inactive instead
- People may also keep granular Remove login / Remove profile; Delete person removes linked login and/or consultant in one confirm that lists what disappears

Do not invent a different Danger chrome per surface. Prefer wrapping all danger actions for a tab in one panel.

## 9) Density defaults (mandatory)

- **Comfortable is the default** for overview list tables (Consultants and Customers).
- **Compact** is for operational grids (allocation) and dense tool chrome.
- Follow the spacing table in DESIGN_SYSTEM.md.
- Do not wrap overview tables in a `Panel` to “add structure”.

---

## 10) App chrome

- Shared sidebar and footer (Home, Log out) use `interactive/*` and zinc surfaces. Active nav uses `nav/active` + `nav/active-accent` in every app.
- A top bar spans the content column: breadcrumbs (`Rove Apps / … / current page`) on the left, Notifications bell on the right. Unread state is a `status/danger` dot. The bell links to `/notifications`.
- Settings sits in the main nav below the apps, after a `border/subtle` divider. It is an accordion like the apps (no start page): General (admin), Consultants, Customers. Visible to Rove logins (`admin` / `member`); hidden from customer users. General is admin-only. Assigned apps (`app_user_apps`) control which product groups appear. Customer users may be granted Work and then see Rove Work in the sidebar.
- The sidebar can collapse to an icon rail. Expanded: a small toggle sits at the far right of the “Rove Apps” header. Collapsed: the header shows only the expand icon (no R mark or “Rove Apps”); nav items show icons only. Nested accordion children stay hidden until the sidebar is expanded.
- App groups in the sidebar are accordions. Child labels align with the parent app label (same icon column + gap).
- Placeholder apps are not clickable and use `text/disabled` / `icon/disabled`.
- Primary actions inside Planner use `accent/*`. Primary actions on Home / Time report / settings use `interactive/*` until those apps have their own theme.
