/**
 * Add acceptance criteria (work_issue_requirements kind=acceptance)
 * for Wholesale Portal feature cards.
 *
 * Env:
 *   CLOUD_SQL_URL (required)
 *   WORK_PROJECT_TITLE (default: Project - Wholesale Portal)
 *   DRY_RUN=1
 *   REPLACE_AC=1  — delete existing acceptance rows before insert
 */
import pg from "pg";

const DRY = process.env.DRY_RUN === "1";
const REPLACE = process.env.REPLACE_AC === "1";
const PROJECT_TITLE = process.env.WORK_PROJECT_TITLE?.trim() || "Project - Wholesale Portal";

function stripSslMode(connectionUrl) {
  try {
    const u = new URL(connectionUrl.replace(/^postgresql:/i, "postgres:"));
    u.searchParams.delete("sslmode");
    return u.toString();
  } catch {
    return connectionUrl;
  }
}

/** title (exact EN from import) → acceptance criteria bodies */
const AC_BY_TITLE = {
  "Sign in": [
    "Signed-out visitor cannot see stock, prices or cart content.",
    "Visiting a protected wholesale URL redirects to the sign-in page.",
    "After successful sign-in the user lands on the personalised home.",
  ],
  "Forgot password": [
    "From sign-in, the user can start the forgot-password flow.",
    "A valid account email can request a reset according to Litium Accelerator behaviour.",
    "Invalid or unknown emails do not reveal whether the account exists (or follow Accelerator defaults).",
  ],
  "Sign out from header": [
    "Signed-in user can sign out from the account bar.",
    "After sign-out, protected wholesale pages require sign-in again.",
    "Cart and account-specific data are no longer visible after sign-out.",
  ],
  "Switch company from header": [
    "A user linked to several companies sees a company switcher in the account bar.",
    "Switching company updates assortment, prices, cart scope and lists to the selected company.",
    "Users linked to only one company do not need a confusing multi-company UI.",
  ],
  "Mega menu with products": [
    "Header mega menu lists level-1 categories (no All entry).",
    "Opening an L1 shows L2 links and a view-all for the branch.",
    "L3 categories are not listed in the mega menu.",
    "Mega menu works on desktop panels and mobile fullscreen drawer.",
  ],
  "Home after sign-in": [
    "Home shows a greeting with the signed-in person’s name and active company.",
    "Home shows a short recent-orders list with a link to full order history.",
    "Home shows the person’s purchase lists for the active company (or empty state).",
    "If the cart has lines, a continue-to-cart callout is shown.",
    "If the user can approve and orders await approval, an approval callout is shown.",
    "Logo / home control returns to this home (not an All-PLP).",
  ],
  "Search in header": [
    "Header search queries the signed-in customer’s available assortment.",
    "Submitting a query opens a result view / PLP with matching products.",
    "Empty or nonsense queries do not crash; they show an empty or no-hit state.",
  ],
  "Category grid / navigation with subcategories": [
    "Selecting an L1 or L2 from the mega menu opens the assortment for that branch.",
    "When an L2 has L3 children, leaf choices appear as selectable image tiles on the PLP.",
    "Breadcrumb shows the category path and supports navigating back up the tree.",
  ],
  "Filters and facets": [
    "PLP offers filters for finish, option and availability (or configured facets).",
    "Applying a filter narrows the product grid to matching products.",
    "Clearing filters restores the unfiltered category/search result set.",
    "Active filters are reflected in the URL where useful for deep links.",
  ],
  "Product card grid with customer assortment and price": [
    "Only products allowed by the customer’s Litium price list / assortment are shown.",
    "Each card shows product name and customer-specific wholesale price.",
    "Cards represent products (styles), not individual variants.",
  ],
  "First variant image on PLP product card": [
    "Each product card displays the image of the first variant of the style.",
    "Missing images degrade gracefully (placeholder or empty frame without layout break).",
  ],
  "Variant fields on product card": [
    "Configured variant fields (e.g. finish swatches) are visible on the card.",
    "Swatches/values reflect the product’s available variants for that customer.",
  ],
  "Availability on product card": [
    "Card shows available / low / out based on whether at least one variant has stock.",
    "Out-of-stock styles remain identifiable without looking like they can be ordered freely.",
  ],
  "Product name, article number and description (variant-unique info)": [
    "PDP shows product name, article number and description as first-class content.",
    "Variant-unique information updates when the selected variant/finish changes.",
    "Selected variant SKU is reflected in the URL.",
  ],
  "Variant price (customer-specific)": [
    "PDP shows the customer-specific wholesale price for the focused variant.",
    "Price updates when switching finish/option within the matrix.",
  ],
  "Variant matrix grouped by variant fields": [
    "All finishes of a style are orderable on the same PDP.",
    "Options are grouped/presented per finish (GroupedVariantTable behaviour).",
    "Media preview follows the focused finish.",
  ],
  "Volume quantity per variant with stock limit": [
    "Each option has an editable quantity field as the primary control.",
    "Quantity cannot exceed remaining stock (including units already in the cart).",
    "UI warns when stock limits the entered quantity.",
    "Zero quantity is allowed and means the option is not ordered.",
  ],
  "Quick-add chips for quantity (+6 / +12 / +24)": [
    "Quick-add chips increase the focused row quantity by the chip amount.",
    "Chips respect remaining stock (do not push qty above available).",
  ],
  "Summary of quantity, wholesale value and RRP": [
    "Summary totals units across all matrix rows with quantity > 0.",
    "Summary shows wholesale value for those rows.",
    "Summary shows recommended retail (RRP) value for those rows.",
    "Summary updates live as quantities change.",
  ],
  "Add to cart": [
    "Primary CTA adds all matrix rows with quantity > 0 to the cart.",
    "User stays on the PDP after add; confirmation appears near the button.",
    "No forced redirect to the cart.",
  ],
  "Quick order with SKU or EAN per row": [
    "Buyer can enter SKU or EAN with quantity on multiple rows.",
    "Valid lines can be added to the cart in one action.",
    "User stays on quick order with confirmation near the CTA.",
  ],
  "Search-as-you-type in quick order": [
    "Typing in the article field suggests matches from the signed-in assortment.",
    "Selecting a suggestion fills the row with a resolvable SKU/EAN.",
    "Unknown codes are clearly flagged as invalid.",
  ],
  "Product column in quick order (name, variant fields, EAN)": [
    "For a resolved code, the product column shows name, variant field values and EAN.",
    "Unresolved rows do not show misleading product details.",
  ],
  "Paste a ready SKU/EAN list": [
    "Buyer can paste a multi-line list of SKU/EAN (and optional qty) into quick order.",
    "Pasted lines are parsed into editable rows.",
    "Invalid lines are flagged without blocking valid ones from being fixed.",
  ],
  "XLS import": [
    "Buyer can import .xlsx / .xls from the first sheet.",
    "SKU/EAN and Qty columns are recognised (header optional).",
    "Validation errors are reported clearly; valid rows become quick-order lines.",
  ],
  "Cart with accordion grouped by base product": [
    "Cart is a dedicated page (not only a fly-out).",
    "Lines are grouped by base product name in an accordion.",
    "Each line shows SKU, Variant, EAN, Qty, unit price and line total.",
  ],
  "Editable quantity in cart with stock rules": [
    "Quantity on each cart line is editable.",
    "Quantity cannot exceed remaining stock for that SKU.",
    "Changing qty recalculates line total and cart totals.",
  ],
  "Requested delivery date": [
    "Checkout lets the buyer set a requested delivery date.",
    "The date is stored on the order (e.g. additional info) and shown on confirmation/order detail when set.",
  ],
  "Order comment": [
    "Checkout allows an optional free-text order comment.",
    "Comment is stored on the order and visible on confirmation/order detail when provided.",
  ],
  "Select delivery address": [
    "Checkout shows delivery addresses from the account.",
    "Buyer can select among available addresses (card-style selection preferred over a bare default dropdown).",
    "Selected address is applied to the placed order.",
  ],
  "Payment with invoice": [
    "Buyer can choose account invoice as payment method when available.",
    "Placing the order with invoice succeeds for an eligible account and appears on confirmation.",
  ],
  "Business payment via Billie, Svea or similar widget": [
    "Buyer can choose a business pay-later / BNPL payment method when configured.",
    "Selecting it loads the payment app/widget session as configured in Litium.",
    "Failed or cancelled payment sessions do not create a completed paid order.",
  ],
  "Credit check (blocks order over facility)": [
    "When credit facility is configured, placing an order above remaining facility is blocked.",
    "Buyer sees a clear message explaining the credit block.",
    "Orders within facility are not blocked by credit check.",
  ],
  "Approval of orders over threshold for buyers": [
    "When approval is enabled, a Buyer submitting an order at/above the threshold creates an awaiting-approval order.",
    "Orders below the threshold are processed without approval.",
    "Approver/Admin roles are not forced through the same buyer-only wait when policy says they may submit.",
  ],
  "Order confirmation (number, totals, delivery)": [
    "After place/submit, confirmation shows order number, units, subtotal, VAT, total and payment.",
    "Requested delivery date and comment appear when provided.",
  ],
  "Searchable order list with multi-status filter": [
    "Order list is searchable.",
    "Multiple statuses can be filtered at once.",
    "Statuses include awaiting approval, processing, partially shipped, shipped, delivered, rejected (as applicable).",
  ],
  "Orders from Litium": [
    "Orders placed in Litium appear in the portal order list.",
    "List presentation is styled consistently with the wholesale portal.",
  ],
  "Approve / reject pending orders": [
    "Approvers see awaiting-approval orders highlighted.",
    "Approve and Reject actions are visible without hover on those rows.",
    "Approve moves the order forward; Reject sets rejected status with a traceable decision.",
  ],
  "Order detail page": [
    "Detail shows Litium order number, status and date.",
    "Lines are grouped by base product (accordion, collapsed by default).",
    "Address, payment, comment and shipments/tracking appear when available.",
  ],
  "Reorder with confirmation modal and add to cart": [
    "Reorder opens a confirmation listing the order lines.",
    "On confirm, lines are added to the cart clamped to available stock.",
    "An on-page message is shown; user is not forced to the cart.",
    "Delivery address (and suggested delivery date) from the order are applied when present.",
  ],
  "Account with customer details from CRM/ERP": [
    "Account page shows company name, customer number, payment terms and approval setting.",
    "Data reflects Litium / CRM-ERP-sourced customer fields (not free invent in the UI).",
  ],
  "Change own login credentials": [
    "Signed-in user can change their own name, email and password.",
    "Invalid password/email rules are validated before save.",
  ],
  "Admin adds/removes users and roles": [
    "Admin can add and remove people on the account.",
    "Admin can assign Buyer / Approver / Admin roles.",
    "Non-admin users cannot manage other users.",
  ],
  "Approval setting for the account": [
    "Admin can turn approval on or off for the account.",
    "Non-admin users cannot change the approval setting.",
    "When off, buyer orders are not held for attest solely due to threshold.",
  ],
  "Show delivery addresses": [
    "Account shows delivery addresses from CRM/ERP via Litium.",
    "Adding a new address directs the user to contact the supplier (not free edit in portal).",
  ],
};

async function main() {
  const url = process.env.CLOUD_SQL_URL;
  if (!url) throw new Error("CLOUD_SQL_URL missing");

  const client = new pg.Client({
    connectionString: stripSslMode(url),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120000,
  });
  await client.connect();

  try {
    const { rows: projects } = await client.query(
      `SELECT id, title, prefix FROM work_projects
       WHERE lower(btrim(title)) = lower(btrim($1))`,
      [PROJECT_TITLE],
    );
    if (!projects[0]) throw new Error(`Project not found: ${PROJECT_TITLE}`);
    const project = projects[0];
    console.log(`Project ${project.title} (${project.prefix}) ${project.id}`);

    const { rows: issues } = await client.query(
      `SELECT id, number, title FROM work_issues WHERE project_id = $1 ORDER BY number`,
      [project.id],
    );

    if (!DRY) await client.query("BEGIN");

    let issuesUpdated = 0;
    let criteriaInserted = 0;
    let skipped = 0;
    let missingMap = [];

    for (const issue of issues) {
      const criteria = AC_BY_TITLE[issue.title];
      if (!criteria?.length) {
        missingMap.push(`${project.prefix}-${issue.number} ${issue.title}`);
        continue;
      }

      const { rows: existing } = await client.query(
        `SELECT count(*)::int AS n FROM work_issue_requirements
         WHERE issue_id = $1 AND kind = 'acceptance'`,
        [issue.id],
      );
      const hasAc = (existing[0]?.n ?? 0) > 0;

      if (hasAc && !REPLACE) {
        skipped += 1;
        continue;
      }

      if (DRY) {
        console.log(
          `[dry] ${project.prefix}-${issue.number}: ${hasAc && REPLACE ? "replace" : "add"} ${criteria.length} AC`,
        );
        issuesUpdated += 1;
        criteriaInserted += criteria.length;
        continue;
      }

      if (hasAc && REPLACE) {
        await client.query(
          `DELETE FROM work_issue_requirements WHERE issue_id = $1 AND kind = 'acceptance'`,
          [issue.id],
        );
      }

      for (let i = 0; i < criteria.length; i++) {
        await client.query(
          `INSERT INTO work_issue_requirements (issue_id, body, is_done, kind, sort_order)
           VALUES ($1, $2, false, 'acceptance', $3)`,
          [issue.id, criteria[i], i],
        );
        criteriaInserted += 1;
      }
      issuesUpdated += 1;
    }

    if (!DRY) await client.query("COMMIT");

    console.log(
      JSON.stringify(
        {
          dry: DRY,
          replace: REPLACE,
          project: project.title,
          prefix: project.prefix,
          issuesSeen: issues.length,
          issuesUpdated,
          criteriaInserted,
          skippedExisting: skipped,
          missingMap,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (!DRY) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw error;
  } finally {
    await client.end();
  }
}

await main();
