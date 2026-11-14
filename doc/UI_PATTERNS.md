# UI patterns — forms & drawers

Keep forms **tight, subtle, homogeneous**.

## Plain language

| What the user is doing | What you open | What fields look like |
|---|---|---|
| **Create or edit** something (Add customer, Add monitor, …) | A **modal** (center dialog) | Label above the field, always a light border |
| **View / tweak** an existing entity (person, customer, project) | A **drawer** (side panel) | Label on the left, quiet value (border only when editing) |
| **Work on an issue / support case** | A **drawer** | Small chips at the top (status, people, …) |

Do not put create/edit forms in drawers. Do not put quiet drawer rows in modals.

## Modals (create / edit)

Use these only:

- `ModalTextInput` — text/number/email/url
- `ModalNativeSelect` — simple native dropdown
- `ModalField` — wrap `Select` or other custom controls
- `CheckboxList` — multi-select as **lit/dim names**, one name per row (click to turn on/off). Selected rows use `bg-bg-muted`. No checkbox column. Optional `groups` with quiet labels; “Select all” is a text link. Bordered scroll (`max-h-52` default).
- Labels are always small (`modalFieldLabelClass` → `text-text-secondary` for contrast)

Do **not** use the `Input` component inside Dialogs.

Short forms (a few fields): flat stack, no section titles.  
Longer forms: a thin line before a secondary group is enough; title only if it names a real second concern (e.g. Brand).

Actions: `size="sm"`.

## Drawers (entity settings)

- `DrawerFieldRow` — label left, value right
- Quiet chrome: no permanent border; wash on hover; border on edit
- `DrawerSection` — group form fields by importance; skip titles that only restate the tab
- `DrawerListGroupHeader` — same quiet label language for list groups (Confirmed, Consultants, Rates…): sentence case, `text-secondary`, no filled bar / uppercase
- `ListAddAction` — append to a list from a group / panel header: Lucide `Plus` + specific label (`Add project`, `Add consultant`…). Put it in the header `action` slot. Do **not** invent ad-hoc `+ Add` text buttons or icon-only Plus for this job. Page-level create stays a solid `Button` + Plus.
- Tab body top padding: `drawerTabBodyClass` / `DrawerSection first` → `pt-4` (same air under the tab bar on every tab)

## Issue / case drawers

- Chip strip near the top (`propertyChipClass`)
- Title in the header; body leads with what you change often

## Checklist

1. Same job → same shell + same field look
2. Order fields by importance for the job
3. Reuse `ModalTextInput` / `CheckboxList` / `DrawerFieldRow` / `ListAddAction` before inventing new markup
