# Rove Apps – Design System (Contract)

This document is the highest-priority binding contract for all UI development.

Source of truth for visual tokens: the Rove portal design export (colors, text styles, shadows, border radius). Hex values below are resolved from that export. Do not invent extra colors, type styles, radii, or shadows.

> Priority order:
> 1. DESIGN_SYSTEM.md (this file – always wins)
> 2. UI_PATTERNS.md (binding patterns and composition rules)
> 3. Components in `src/components/ui/` (source of truth for implementation)

---

## Language

- All user-facing UI text must be **English** (titles, buttons, placeholders, labels).
- The product name in the UI is **Rove Apps**.
- Swedish is allowed only in internal comments or commit messages.
- Do not force uppercase via CSS. Text case is original (as written).

---

## Token implementation

- All color, radius, and shadow values are CSS custom properties.
- Target file: `styles/tokens.css` (only this file may define or change those values).
- Tailwind must read tokens – never hardcode hex, rgba, or raw pixel radii/shadows in components.
- Dark mode is applied by adding the class `dark` to the `<html>` element. Light mode is the default.
- `prefers-color-scheme` may set the initial theme; the `dark` class always wins.
- Primitives are the only raw palettes. Semantic tokens must reference primitives (or `white` / `black`), never a one-off hex.

Token blocks:

```css
:root {
  /* primitives + light semantic + default accent */
}

.dark {
  /* dark semantic + dark accent overrides – same variable names */
}

[data-app="planner"] { /* Planner accent */ }
[data-app="work"] { /* Rove Work accent */ }
[data-app="future"] { /* Future App accent */ }
```

---

## Color primitives

Use these ramps only. Shade names are `family/shade` (for example `zinc/50`).

| Family | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|--------|----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| zinc | `#fafafb` | `#f3f3f5` | `#e4e5e8` | `#cfd0d5` | `#a1a3aa` | `#71737a` | `#54565c` | `#3f4146` | `#292b2f` | `#18191c` | `#0d0e10` |
| blue | `#f4f6fe` | `#e7ebfc` | `#ccd4f7` | `#aab8f0` | `#8499e5` | `#657dd4` | `#5067bc` | `#43549a` | `#38457d` | `#303a67` | `#1d233d` |
| orange | `#fff4ed` | `#ffe4d3` | `#ffc6a5` | `#ff9f6b` | `#f97835` | `#ef6518` | `#e9560c` | `#c94208` | `#a3360b` | `#7f2b0d` | `#451205` |
| green | `#f2f8f3` | `#ddeee0` | `#b9d9bf` | `#91bf9b` | `#6aa678` | `#4f8e60` | `#3d764d` | `#315f3e` | `#294f35` | `#203f2b` | `#10261a` |
| amber | `#fffbea` | `#fff5ce` | `#ffe99f` | `#ffd96e` | `#fdc545` | `#f5aa28` | `#d98715` | `#b46610` | `#935115` | `#794417` | `#482409` |
| red | `#fff1f1` | `#ffe2e2` | `#ffcaca` | `#ffa8a8` | `#f97c7c` | `#ea5656` | `#d43535` | `#b32929` | `#942525` | `#7c2626` | `#440f0f` |
| purple | `#f5f1ff` | `#ece5ff` | `#dbceff` | `#c4afff` | `#a989ff` | `#9067f4` | `#7b4ce1` | `#6739c5` | `#5631a4` | `#482a87` | `#291554` |
| teal | `#edfdfb` | `#dbf9f6` | `#bbf1ed` | `#94e5e0` | `#6ad1cc` | `#4ab8b3` | `#359996` | `#2e7c7b` | `#2a6363` | `#275152` | `#132f31` |
| cyan | `#edfaff` | `#dbf3ff` | `#bce8ff` | `#93d9ff` | `#68c5f9` | `#49ade9` | `#3390d0` | `#2b75aa` | `#275e89` | `#254e70` | `#142d45` |
| pink | `#fff1f6` | `#ffe3ed` | `#ffcadd` | `#ffa6c6` | `#fb7ca8` | `#ef568a` | `#db326a` | `#ba2455` | `#9a214a` | `#802042` | `#4a0c20` |

Also: `white` `#ffffff`, `black` `#000000`.

CSS names: `--color-zinc-50`, `--color-blue-600`, `--color-white`, `--color-black`.

---

## Semantic colors

Always use semantic tokens in UI, not primitive ramps.

Suggested CSS names: `--color-surface-page`, `--color-text-primary`, `--color-border-default`, `--color-icon-secondary`, `--color-interactive-primary`, `--color-status-success`, `--color-focus-default`, `--color-table-header`.

### Surface

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `surface/page` | zinc/50 `#fafafb` | zinc/950 `#0d0e10` | App canvas / main content background |
| `surface/default` | white `#ffffff` | zinc/900 `#18191c` | Sidebar, default panels |
| `surface/subtle` | zinc/100 `#f3f3f5` | zinc/800 `#292b2f` | Muted bands, sunken chips, meter tracks |
| `surface/raised` | white `#ffffff` | zinc/800 `#292b2f` | Elevated panels, popovers, modals |
| `surface/sunken` | zinc/100 `#f3f3f5` | zinc/950 `#0d0e10` | Well / inset areas |
| `surface/inverse` | zinc/900 `#18191c` | zinc/50 `#fafafb` | Inverse blocks |

### Text

| Token | Light | Dark |
|-------|-------|------|
| `text/primary` | zinc/900 `#18191c` | zinc/50 `#fafafb` |
| `text/secondary` | zinc/600 `#54565c` | zinc/400 `#a1a3aa` |
| `text/tertiary` | zinc/400 `#a1a3aa` | zinc/500 `#71737a` |
| `text/disabled` | zinc/300 `#cfd0d5` | zinc/600 `#54565c` |
| `text/inverse` | white `#ffffff` | zinc/900 `#18191c` |
| `text/link` | blue/600 `#5067bc` | blue/400 `#8499e5` |

### Border

| Token | Light | Dark |
|-------|-------|------|
| `border/subtle` | zinc/100 `#f3f3f5` | zinc/800 `#292b2f` |
| `border/default` | zinc/200 `#e4e5e8` | zinc/700 `#3f4146` |
| `border/strong` | zinc/400 `#a1a3aa` | zinc/500 `#71737a` |
| `border/inverse` | zinc/800 `#292b2f` | zinc/200 `#e4e5e8` |
| `border/focus` | blue/600 `#5067bc` | blue/400 `#8499e5` |

Form controls use `border/subtle` via the `--color-border-form` alias. Do not invent a harsher form border. Prefer **quiet fields** (below) in drawers and detail surfaces: no permanent border at rest.

### Icon

Same mapping as text: `icon/primary`, `icon/secondary`, `icon/tertiary`, `icon/disabled`, `icon/inverse`.

### Interactive (shared chrome, default buttons)

Used for the Rove Apps shell and any app that has no accent theme yet (including **Time report** until a dedicated theme exists).

| Token | Light | Dark |
|-------|-------|------|
| `interactive/primary` | blue/500 `#657dd4` | blue/500 `#657dd4` |
| `interactive/primary-hover` | blue/600 `#5067bc` | blue/600 `#5067bc` |
| `interactive/primary-active` | blue/700 `#43549a` | blue/700 `#43549a` |
| `interactive/primary-subtle` | blue/50 `#f4f6fe` | blue/950 `#1d233d` |
| `interactive/secondary` | zinc/100 `#f3f3f5` | zinc/800 `#292b2f` |
| `interactive/secondary-hover` | zinc/200 `#e4e5e8` | zinc/700 `#3f4146` |
| `interactive/disabled` | zinc/100 `#f3f3f5` | zinc/800 `#292b2f` |
| `interactive/disabled-text` | zinc/300 `#cfd0d5` | zinc/600 `#54565c` |

Primary CTA in the shell: `interactive/primary` with `text/inverse`.

### Status

| Token | Light | Dark |
|-------|-------|------|
| `status/info` | blue/600 `#5067bc` | blue/400 `#8499e5` |
| `status/info-subtle` | blue/50 `#f4f6fe` | blue/950 `#1d233d` |
| `status/success` | green/600 `#3d764d` | green/400 `#6aa678` |
| `status/success-subtle` | green/50 `#f2f8f3` | green/950 `#10261a` |
| `status/warning` | amber/600 `#d98715` | amber/400 `#fdc545` |
| `status/warning-subtle` | amber/50 `#fffbea` | amber/950 `#482409` |
| `status/danger` | red/600 `#d43535` | red/400 `#f97c7c` |
| `status/danger-subtle` | red/50 `#fff1f1` | red/950 `#440f0f` |

Foreground status color on the matching `*-subtle` background.

### Status badges

`Badge` uses one color mapping for status, health, and probability labels.

| Meaning | Variants | Surface | Text |
|---------|----------|---------|------|
| Active / success / high | `active`, `success`, `high` | `status/success-subtle` | `status/success` |
| Medium / warning / inactive | `medium`, `warning`, `inactive` | `status/warning-subtle` | `status/warning` |
| Low / error | `low`, `error` | `status/danger-subtle` | `status/danger` |

Non-status chips (Internal / Standard) use `muted` (`surface/subtle` + `text/secondary`). Radius: `full`. Type: Label/M.

### Table

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| Table header fill | `table/header` `blue/100` | `table/header` (`blue/900`) | DataTable sticky header |
| Table header text | `text/primary`, semibold | `text/primary`, semibold | Heading/XS (13px) |
| Table body | `surface/default` (white) on `surface/page` | `surface/default` | Overview lists — not a bordered Panel |
| Table body col 1 | `text/primary`, Label/L | `text/primary`, Label/L | Name / identity |
| Table body other | `text/primary` or `text/secondary`, Body/L | same | Metadata, numbers |
| Table header radius | `radius/lg` on top corners | `radius/lg` on top corners | Comfortable overview lists only |
| Row divider | `border/default` | `border/default` | Hairline between rows on white, none under the last row, no vertical rules |
| Row hover | `interactive/secondary` (`zinc/100`) | `interactive/secondary` | |
| Selected row | `nav/active` | `nav/active` | Overlay detail is open for that row |

### Segmented control

Exclusive pills on list toolbars (`SegmentedControl`). Not the same as `OptionSegments`.

| State | Surface | Text | Type |
|-------|---------|------|------|
| Selected | `interactive/primary` | `text/inverse` | Label/M |
| Hover (selected) | `interactive/primary-hover` | `text/inverse` | Label/M |
| Default | `interactive/secondary-hover` | `text/secondary` | Body/M |
| Hover (default) | `interactive/secondary-hover` | `text/primary` | Body/M |

Radius: `full`. Padding: 14px 8px. Gap: 8px (`space/8`). Optional count in the label: `All (18)`.

### Avatars (initials)

Hashed per name. Use `InitialsAvatar`; do not pick a color ad hoc.

| Token | Light bg / fg | Dark bg / fg |
|-------|----------------|--------------|
| `avatar/1` | blue/500 / white | blue/500 / white |
| `avatar/2` | orange/500 / white | orange/500 / white |
| `avatar/3` | purple/500 / white | purple/500 / white |
| `avatar/4` | teal/500 / white | teal/500 / white |
| `avatar/5` | pink/500 / white | pink/500 / white |
| `avatar/6` | red/500 / white | red/500 / white |

Sizes: 32px (table), 40px (drawer header). Radius: `full`. Type: Label/S, inverse.

### Focus

| Token | Light | Dark |
|-------|-------|------|
| `focus/default` | blue/600 `#5067bc` | blue/400 `#8499e5` |
| `focus/subtle` | blue/100 `#e7ebfc` | blue/900 `#303a67` |

Inside an app with an accent theme, focus uses `accent/focus` instead of `focus/default`.

---

## App accent themes

Shared semantic tokens stay the same across Rove Apps. Each app sets **accent** tokens. Set `data-app` on the shell for the active app.

| `data-app` | Theme | Typical use |
|------------|-------|-------------|
| *(none)* | shared `interactive/*` | Home, Customers, Consultants, Settings, Notifications, Time report (until specified) |
| `planner` | Rove Planner (orange) | Planner / Allocation |
| `work` | Rove Work (blue) | Rove Work placeholder / future |
| `future` | Future App (purple) | Reserved |

Accent tokens (CSS: `--color-accent-primary`, `--color-accent-primary-hover`, `--color-accent-primary-active`, `--color-accent-primary-subtle`, `--color-accent-primary-text`, `--color-accent-focus`):

### Rove Planner (`planner`)

| Token | Light | Dark |
|-------|-------|------|
| `accent/primary` | orange/600 `#e9560c` | orange/500 `#ef6518` |
| `accent/primary-hover` | orange/700 `#c94208` | orange/400 `#f97835` |
| `accent/primary-active` | orange/800 `#a3360b` | orange/300 `#ff9f6b` |
| `accent/primary-subtle` | orange/50 `#fff4ed` | orange/950 `#451205` |
| `accent/primary-text` | orange/700 `#c94208` | orange/400 `#f97835` |
| `accent/focus` | orange/600 `#e9560c` | orange/400 `#f97835` |

Planner primary CTA and selected allocation states use `accent/*`, not `interactive/*`.

### Rove Work (`work`)

| Token | Light | Dark |
|-------|-------|------|
| `accent/primary` | blue/500 `#657dd4` | blue/500 `#657dd4` |
| `accent/primary-hover` | blue/600 `#5067bc` | blue/600 `#5067bc` |
| `accent/primary-active` | blue/700 `#43549a` | blue/700 `#43549a` |
| `accent/primary-subtle` | blue/50 `#f4f6fe` | blue/950 `#1d233d` |
| `accent/primary-text` | blue/700 `#43549a` | blue/400 `#8499e5` |
| `accent/focus` | blue/500 `#657dd4` | blue/500 `#657dd4` |

### Future App (`future`)

| Token | Light | Dark |
|-------|-------|------|
| `accent/primary` | purple/600 `#7b4ce1` | purple/500 `#9067f4` |
| `accent/primary-hover` | purple/700 `#6739c5` | purple/400 `#a989ff` |
| `accent/primary-active` | purple/800 `#5631a4` | purple/300 `#c4afff` |
| `accent/primary-subtle` | purple/50 `#f5f1ff` | purple/950 `#291554` |
| `accent/primary-text` | purple/700 `#6739c5` | purple/400 `#a989ff` |
| `accent/focus` | purple/600 `#7b4ce1` | purple/400 `#a989ff` |

Customer/project colors from the database may still be applied inline. They are the only allowed hex outside `tokens.css`.

---

## Typography

**Font: Instrument Sans only.** Imported via `next/font/google` in `src/app/layout.tsx`. Do not add `@font-face` unless files are committed under `public/fonts`. Fallback: `system-ui`. Do not substitute another web font. Do not use DM Mono or a second family.

Letter-spacing is **0** on all styles. `textCase` is original (no `uppercase` utility for these styles).

| Style | Weight | Size | Typical use |
|-------|--------|------|-------------|
| Heading/XL | SemiBold 600 | 22px | List page title (`PageHeader`) |
| Heading/L | SemiBold 600 | 20px | Drawer / detail titles |
| Heading/M | SemiBold 600 | 15px | Panel titles |
| Heading/S | SemiBold 600 | 14px | Subsection titles |
| Heading/XS | SemiBold 600 | 13px | Compact section titles, overview table headers |
| Label/L | Medium 500 | 13px | Emphasized UI labels, primary nav, table column 1 |
| Label/M | Medium 500 | 12px | Controls, buttons |
| Label/S | SemiBold 600 | 11px | Compact labels, badges |
| Label/XS | SemiBold 600 | 10px | Tiny labels |
| Body/L | Regular 400 | 13px | Default readable body / table body (columns 2+) |
| Body/M | Regular 400 | 12px | Default UI |
| Body/S | Regular 400 | 11px | Helper text |
| Body/XS | Regular 400 | 10px | Fine print |
| Caption | Regular 400 | 10px | Captions |
| Overline | SemiBold 600 | 9px | Overline / eyebrow (not uppercase) |

Map to Tailwind as tokenized text styles (preferred) or equivalent `text-[Npx] font-*`. Do not pick sizes outside this scale.

Numeric data uses the same family with `tabular-nums`. Secondary copy uses `text/secondary` or `text/tertiary`.

---

## Border radius

Use these tokens only:

| Token | px | CSS | Typical use |
|-------|----|-----|-------------|
| `sm` | 4 | `--radius-sm` | Badges, chips, tiny controls |
| `md` | 6 | `--radius-md` | Inputs, nav items, dropdown items |
| `lg` | 8 | `--radius-lg` | Buttons, panels, cards, modals |
| `xl` | 12 | `--radius-xl` | Large cards |
| `2xl` | 16 | `--radius-2xl` | Rare oversized frames |
| `full` | 9999 | `--radius-full` | Avatars, pills |

Panels use `lg` (8px). Overview list tables use `lg` on the **header top corners** only. Compact grids stay square. Tables inside a panel stay square; the panel provides radius.

---

## Shadows

Use named shadow tokens only. CSS examples:

| Token | Value |
|-------|--------|
| `xs` | `0 1px 2px rgba(0, 0, 0, 0.05)` |
| `sm` | `0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.10)` |
| `md` | `0 4px 6px -1px rgba(0, 0, 0, 0.10), 0 2px 4px -2px rgba(0, 0, 0, 0.06)` |
| `lg` | `0 10px 15px -3px rgba(0, 0, 0, 0.10), 0 4px 6px -4px rgba(0, 0, 0, 0.05)` |
| `xl` | `0 20px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.06)` |
| `primary` | `0 4px 16px -2px rgba(0, 0, 0, 0.06), 0 2px 6px -1px rgba(0, 0, 0, 0.03)` |

- `xs` / `sm`: resting cards, inputs if needed
- `md` / `primary`: raised panels, popovers
- `lg` / `xl`: modals, large overlays

Do not invent extra shadows (including one-off panel header drop shadows).

---

## Density (mandatory)

Overview **list pages** use **comfortable** table density (Figma). Compact remains for operational grids (allocation).

| Element | Value |
|---------|--------|
| Panel content padding | 8px |
| PanelHeader padding | 6px 12px |
| PanelToolbar / SectionTitle | 4px 12px |
| PanelSection padding | 6px 12px |
| Gap between major sections | 24px (`gap-6`) |
| Gap between fields in a section | 4–8px |
| Label-to-value spacing | 8–12px (`gap-3`) |
| Overview list table row | comfortable (`px-4 py-3.5`) |
| Overview list table header | 50px tall (`px-4`), `radius/lg` on top corners |
| Operational grid row | compact |
| Drawer padding | 24px (`px-6`) |
| Drawer identity row | label left (`w-36`), value `flex-1` (`py-1.5`); quiet chrome |
| Drawer summary row | semibold label (`w-36`), unboxed value (`py-2`) |
| Drawer grouped-list header | Label/S uppercase `text/tertiary` on `surface/subtle` wash — not the same type as row titles |

Do not wrap overview list tables in a bordered `Panel`. The table body is `surface/default` on `surface/page`. Comfortable headers use `table/header` (`blue/100`) and `radius/lg` on the top corners only; compact operational grids stay square.

---

## Layout surfaces

- **Main content:** `surface/page`
- **Sidebar:** `surface/default`
- **Panel:** `surface/raised` (must differ from the page canvas in light mode via border/shadow, not a new fill)
- **Dividers:** `border/subtle` or `border/default`
- **Nav hover:** `interactive/secondary-hover`
- **Nav active:** `interactive/primary-subtle` with `interactive/primary` (same in every app; do not use accent tokens in the shared sidebar)

Hierarchy comes from spacing, type, and tokens – not heavy borders.

---

## Interaction & cursor

- Interactive controls use a hand cursor on hover: links, `button:not(:disabled)`, `[role="button"]`, `[aria-pressed]`, `[role="tab"]`.
- Enforced globally in `src/app/globals.css`. Do not override unless required for accessibility.

### Quiet fields (mandatory for drawers & issue detail)

Default interaction pattern for settings drawers, Work issue drawers, and similar side panels. Inspired by property chips: **value first, chrome on interaction**.

| State | Treatment |
|-------|-----------|
| Rest | No border (or `border-transparent`). Transparent / flush background. |
| Hover | Soft wash: `hover:bg-text-primary/[0.06]` (`quietFieldWashClass`). |
| Edit / focus | Light `border-form` (= `border/subtle`) + soft accent focus ring (`ring-brand-signal/20–30`, inset). |
| Segmented (`OptionSegments`) | Track: muted wash, no outer border. Selected: raised surface + light shadow, no heavy ring. |

**Do**
- Use `DrawerFieldRow` + `drawerEditTriggerClass` / `drawerSelectTriggerClass` from `inlineEditStyles`.
- Use `DrawerItemList` for collection CRUD in drawers (checklists, components, similar named-item lists): flat `divide-y`, click-to-edit, hover remove — not boxed lists or always-on bordered inputs.
- Use `quietComposeInputClass` (or equivalent) for “add item” rows.

**Don't**
- Don't use always-on `border-form` boxes for drawer display values.
- Don't use `justify-between` + fixed `14.5rem` value columns (creates empty mid-gap in wide drawers).
- Don't invent heavier borders than `border/subtle` for resting form chrome.

Standalone page forms and modals may keep a resting `border-form` for scanability; still use the quiet token (subtle), not `border/default`.

### Form recognition

- **Input / Select:** `label`, `id`, and `error` when in a form; wire `aria-invalid` and `aria-describedby`.
- **Switch:** associate `label` and `id`.
- Always provide a visible label or `aria-label`.
- **Modal / form field labels** (including `legend` for grouped fields): match `Input` / `Select` — `text-sm font-medium text-text-primary` with `mb-1` (or `mb-2` before a control group). Do not use `text-label-s text-text-secondary` for form field labels; that style is for compact UI chrome (badges, metadata), not forms. Detail-page `FieldLabel` (uppercase muted) is drawer/detail only.

---

## Component policy

- Reusable UI lives in `src/components/ui/`.
- Reuse existing components before creating new ones.
- New components: tokens only, no inline styles (exception: DB user colors and percentage widths on meters), generic not feature-specific.

---

## Forbidden (hard rules)

- ❌ Inline styles (exception: user-defined colors from DB, percentage widths on meters)
- ❌ Hardcoded hex / rgba outside `styles/tokens.css`
- ❌ Colors, type sizes, radii, or shadows not listed in this document
- ❌ Ad hoc CSS in pages or feature files
- ❌ Raw `<table>` markup in pages or features (use DataTable)
- ❌ Copying layout directly into JSX without components
- ❌ Changing font imports or substituting fonts
- ❌ Using the retired `brand.signal` / `#FF6136` / lilac / old gray ramps

---

## Allowed

- Tailwind utilities that reference these tokens
- Small token adjustments in `tokens.css` only, with a comment
- Overview `table/header` is `blue/100` in `tokens.css`
- Inline styles **only** for user-defined database colors, and for **percentage widths** on meters (`CapacityBar`)
