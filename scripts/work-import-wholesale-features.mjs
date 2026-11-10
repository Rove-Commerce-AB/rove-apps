/**
 * Import / enrich Wholesale Portal requirement cards in Rove Work.
 * Choices: 1A 2A("Wholesale portal") 3B 4A 5B 6B 7A 8A 9A 10C 11A
 *
 * Run: node scripts/work-import-wholesale-features.mjs
 * Dry: DRY_RUN=1 node scripts/work-import-wholesale-features.mjs
 */
import pg from "pg";

const DRY = process.env.DRY_RUN === "1";
const PROJECT_TITLE = process.env.WORK_PROJECT_TITLE?.trim() || "Wholesale portal";
const ACTOR_EMAIL = (process.env.ACTOR_EMAIL?.trim() || "simon@rove.se").toLowerCase();

const DEMO_URL = "https://rove-portal-1014978089009.europe-west1.run.app/wholesale";
const SPEC_URL =
  "https://github.com/Rove-Commerce-AB/rove-portal/blob/main/docs/requirements/wholesale.md";

/** Filled in main() after DB lookup. */
let PROJECT_ID = process.env.WORK_PROJECT_ID?.trim() || "";
let ACTOR_ID = process.env.ACTOR_ID?.trim() || "";

function stripSslMode(connectionUrl) {
  try {
    const u = new URL(connectionUrl.replace(/^postgresql:/i, "postgres:"));
    u.searchParams.delete("sslmode");
    return u.toString();
  } catch {
    return connectionUrl;
  }
}

async function resolveProjectAndActor(client) {
  if (!PROJECT_ID) {
    const { rows } = await client.query(
      `SELECT id, title FROM work_projects
       WHERE lower(btrim(title)) = lower(btrim($1))
       ORDER BY created_at NULLS LAST
       LIMIT 2`,
      [PROJECT_TITLE],
    );
    if (!rows[0]) {
      const fuzzy = await client.query(
        `SELECT id, title FROM work_projects
         WHERE title ILIKE '%' || $1 || '%'
         ORDER BY title LIMIT 5`,
        [PROJECT_TITLE],
      );
      throw new Error(
        `Work project not found for title "${PROJECT_TITLE}". Candidates: ${JSON.stringify(fuzzy.rows)}`,
      );
    }
    if (rows.length > 1) {
      throw new Error(`Multiple projects titled "${PROJECT_TITLE}"`);
    }
    PROJECT_ID = rows[0].id;
    console.log(`Resolved project "${rows[0].title}" → ${PROJECT_ID}`);
  }
  if (!ACTOR_ID) {
    const { rows } = await client.query(
      `SELECT id, email, name FROM app_users WHERE lower(email) = $1 LIMIT 1`,
      [ACTOR_EMAIL],
    );
    if (!rows[0]) {
      throw new Error(`Actor app_user not found for ${ACTOR_EMAIL}`);
    }
    ACTOR_ID = rows[0].id;
    console.log(`Resolved actor ${rows[0].email} → ${ACTOR_ID}`);
  }
}

/** @typedef {{
 *  key: string,
 *  title: string,
 *  component: string,
 *  origin: "Accelerator" | "Portal",
 *  hours: number | null,
 *  comment?: string,
 *  estimateComment?: string,
 *  questions?: string,
 *  spec?: string,
 *  matchNumbers?: number[],
 *  matchTitleIncludes?: string[],
 * }} Feature */

/** @type {Feature[]} */
const FEATURES = [
  {
    key: "sign-in",
    title: "Sign in",
    component: "Framework",
    origin: "Accelerator",
    hours: 4,
    estimateComment: "Styling plus redirect logic so signed-out users land on the sign-in page.",
    spec: "Users must sign in before stock, prices or cart are shown. After sign-in, land on the personalised home.",
    matchNumbers: [7],
    matchTitleIncludes: ["Inloggning"],
  },
  {
    key: "forgot-password",
    title: "Forgot password",
    component: "Framework",
    origin: "Accelerator",
    hours: 4,
    spec: "Standard Litium Accelerator forgot-password flow for wholesale accounts.",
    matchNumbers: [8],
    matchTitleIncludes: ["Glömt lösenord"],
  },
  {
    key: "sign-out",
    title: "Sign out from header",
    component: "Framework",
    origin: "Accelerator",
    hours: 4,
    spec: "Signed-in users can sign out from the account bar above the customer header.",
    matchNumbers: [9],
    matchTitleIncludes: ["Logga ut"],
  },
  {
    key: "switch-company",
    title: "Switch company from header",
    component: "Framework",
    origin: "Accelerator",
    hours: 8,
    comment: "For users linked to several companies (e.g. sales reps).",
    spec: "A person may be linked to several companies and switch which one they order for from the account bar.",
    matchNumbers: [10],
    matchTitleIncludes: ["Byta bolag"],
  },
  {
    key: "mega-menu",
    title: "Mega menu with products",
    component: "Framework",
    origin: "Accelerator",
    hours: null,
    spec: "Category levels 1–2 live in a header mega menu (desktop click panels; mobile fullscreen drawer). No “All” entry — shoppers pick a level-1 category directly. L1 opens the full branch; L2 opens the subcategory. Deeper levels are not listed in the mega menu.",
    matchTitleIncludes: ["Megameny"],
  },
  {
    key: "home",
    title: "Home after sign-in",
    component: "Framework",
    origin: "Accelerator",
    hours: null,
    spec: "Personalised home with greeting (person + company), recent orders, purchase lists, and optional cart / approval callouts. Logo / home control returns here. Assortment is reached via the mega menu.",
    matchTitleIncludes: ["Startsida"],
  },
  {
    key: "header-search",
    title: "Search in header",
    component: "Search",
    origin: "Accelerator",
    hours: 16,
    estimateComment: "Customise Accelerator quick search and configure search.",
    spec: "Search available stock from the customer header (Accelerator-style search).",
    matchNumbers: [1],
    matchTitleIncludes: ["Sök i sidhuvud"],
  },
  {
    key: "category-nav",
    title: "Category grid / navigation with subcategories",
    component: "PLP",
    origin: "Accelerator",
    hours: 24,
    estimateComment:
      "New category/subcategory component if mega menu is not used. When a branch has a third level, leaf navigation appears on the assortment page as selectable miniature product images.",
    spec: "PLP category path via mega menu + breadcrumb. Leaf image tiles under the heading when L3 exists (demo: Hammers, Drills).",
    matchNumbers: [2],
    matchTitleIncludes: ["Kategorinavigation", "Kategorigrid"],
  },
  {
    key: "filters-facets",
    title: "Filters and facets",
    component: "PLP",
    origin: "Accelerator",
    hours: null,
    spec: "Filters for finish, option and availability sit with the product grid (Accelerator standard filters / facets).",
    matchTitleIncludes: ["Filter och facetter"],
  },
  {
    key: "product-grid",
    title: "Product card grid with customer assortment and price",
    component: "PLP",
    origin: "Accelerator",
    hours: 12,
    estimateComment:
      "Style product grid; price list decides which products the signed-in customer sees.",
    spec: "Show the assortment and prices from the Litium price list for the signed-in account, limited to articles available for wholesale ordering. Cards show products (not variants).",
    matchNumbers: [3],
    matchTitleIncludes: ["Grid med produktkort"],
  },
  {
    key: "plp-first-image",
    title: "First variant image on PLP product card",
    component: "PLP",
    origin: "Accelerator",
    hours: 8,
    spec: "The product card image is the first variant’s image.",
    matchNumbers: [4],
    matchTitleIncludes: ["Första variantbilden"],
  },
  {
    key: "plp-variant-fields",
    title: "Variant fields on product card",
    component: "PLP",
    origin: "Accelerator",
    hours: 8,
    spec: "Product cards communicate finish swatches (and other configured variant fields) at a glance.",
    matchNumbers: [5],
    matchTitleIncludes: ["Visning av variantfält"],
  },
  {
    key: "plp-availability",
    title: "Availability on product card",
    component: "PLP",
    origin: "Accelerator",
    hours: 4,
    comment: "If at least one variant is in stock.",
    spec: "Availability badge: available / low / out based on variant stock.",
    matchNumbers: [6],
    matchTitleIncludes: ["Tillgänglighet på produktkort"],
  },
  {
    key: "pdp-identity",
    title: "Product name, article number and description (variant-unique info)",
    component: "PDP",
    origin: "Accelerator",
    hours: 12,
    spec: "Name, article number, price, descriptions and the variant matrix are first-class on the product page. Selected variant SKU is in the URL.",
    matchNumbers: [11],
    matchTitleIncludes: ["Produktnamn, artikelnummer"],
  },
  {
    key: "pdp-price",
    title: "Variant price (customer-specific)",
    component: "PDP",
    origin: "Accelerator",
    hours: 2,
    spec: "Customer-specific wholesale price from the account price list.",
    matchNumbers: [12],
    matchTitleIncludes: ["Variantpris"],
  },
  {
    key: "pdp-matrix",
    title: "Variant matrix grouped by variant fields",
    component: "PDP",
    origin: "Portal",
    hours: 16,
    estimateComment: "New component — GroupedVariantTable. All finishes on a style are orderable on the same page.",
    spec: "Professional bulk-ordering matrix (per-finish option sheets); media preview follows the focused finish.",
    matchNumbers: [13],
    matchTitleIncludes: ["Variantmatris"],
  },
  {
    key: "pdp-qty",
    title: "Volume quantity per variant with stock limit",
    component: "PDP",
    origin: "Accelerator",
    hours: 8,
    estimateComment:
      "Per-variant stock used when adding to cart and for validation. Quantity counts down against remaining stock including units already in the cart.",
    spec: "Editable quantity field is primary; +/- secondary. Zero is allowed (option not ordered).",
    matchNumbers: [14],
    matchTitleIncludes: ["Volymkvantitet"],
  },
  {
    key: "pdp-chips",
    title: "Quick-add chips for quantity (+6 / +12 / +24)",
    component: "PDP",
    origin: "Accelerator",
    hours: 8,
    estimateComment: "Can be a multifield in website settings to make chips configurable.",
    matchNumbers: [15],
    matchTitleIncludes: ["Snabbchips"],
  },
  {
    key: "pdp-summary",
    title: "Summary of quantity, wholesale value and RRP",
    component: "PDP",
    origin: "Portal",
    hours: 8,
    estimateComment: "Custom component summing price and RRP for all rows with qty > 0.",
    spec: "Summary shows total units, wholesale value and recommended retail value across finishes being added.",
    matchNumbers: [16],
    matchTitleIncludes: ["Summering av antal"],
  },
  {
    key: "pdp-add-to-cart",
    title: "Add to cart",
    component: "PDP",
    origin: "Accelerator",
    hours: 8,
    estimateComment: "Same matrix component with AddVariantToCart for an array of inputs.",
    spec: "Primary CTA adds the matrix to the cart. User stays on the page with confirmation near the button (no forced redirect).",
    matchNumbers: [17],
    matchTitleIncludes: ["Lägg i varukorg"],
  },
  {
    key: "qo-rows",
    title: "Quick order with SKU or EAN per row",
    component: "Quick order",
    origin: "Portal",
    hours: 16,
    estimateComment: "New page template. Logic to add an array of article numbers + quantities.",
    spec: "Dedicated page for buyers who know article numbers: enter SKU or EAN with quantity per row.",
    matchNumbers: [18],
    matchTitleIncludes: ["Snabborder med SKU"],
  },
  {
    key: "qo-typeahead",
    title: "Search-as-you-type in quick order",
    component: "Quick order",
    origin: "Portal",
    hours: 16,
    estimateComment: "Search against Litium Search on the article-number field for the signed-in assortment.",
    spec: "Unknown codes are flagged. Resolves against the signed-in assortment.",
    matchNumbers: [19],
    matchTitleIncludes: ["Sök as-you-type", "Sök-as-you-type"],
  },
  {
    key: "qo-product-column",
    title: "Product column in quick order (name, variant fields, EAN)",
    component: "Quick order",
    origin: "Portal",
    hours: 4,
    spec: "Product column shows name, configured variant field values, and EAN.",
    matchNumbers: [20],
    matchTitleIncludes: ["Produktkolumn i snabborder"],
  },
  {
    key: "qo-paste",
    title: "Paste a ready SKU/EAN list",
    component: "Quick order",
    origin: "Portal",
    hours: null,
    spec: "Allow pasting a multi-line SKU/EAN (+ qty) list into quick order.",
    matchNumbers: [21],
    matchTitleIncludes: ["Klistra in"],
  },
  {
    key: "qo-xls",
    title: "XLS import",
    component: "Quick order",
    origin: "Portal",
    hours: 16,
    estimateComment: "Excel parsing, validation and error handling.",
    spec: "Import .xlsx / .xls from the first sheet with SKU/EAN and Qty columns (header optional).",
    matchTitleIncludes: ["XLS"],
  },
  {
    key: "cart-accordion",
    title: "Cart with accordion grouped by base product",
    component: "Cart",
    origin: "Accelerator",
    hours: 16,
    estimateComment: "New Cart component as its own page (not a fly-out).",
    spec: "Cart lines grouped by base product name with SKU, Variant, EAN, Qty, unit price and line total.",
    matchNumbers: [22],
    matchTitleIncludes: ["Varukorg med accordion"],
  },
  {
    key: "cart-qty",
    title: "Editable quantity in cart with stock rules",
    component: "Cart",
    origin: "Accelerator",
    hours: 8,
    estimateComment: "Reuse row logic from the variant table.",
    matchNumbers: [23],
    matchTitleIncludes: ["Redigerbart antal i varukorg"],
  },
  {
    key: "checkout-delivery-date",
    title: "Requested delivery date",
    component: "Checkout",
    origin: "Portal",
    hours: 4,
    estimateComment: "Store as additional info on the order.",
    matchNumbers: [24],
    matchTitleIncludes: ["Önskat leveransdatum"],
  },
  {
    key: "checkout-comment",
    title: "Order comment",
    component: "Checkout",
    origin: "Accelerator",
    hours: 4,
    estimateComment: "Can be stored on the order note.",
    spec: "Optional free-text comment for warehouse / customer service.",
    matchNumbers: [25],
    matchTitleIncludes: ["Orderkommentar"],
  },
  {
    key: "checkout-address",
    title: "Select delivery address",
    component: "Checkout",
    origin: "Accelerator",
    hours: 8,
    estimateComment: "Change default dropdown to selectable cards.",
    matchNumbers: [26],
    matchTitleIncludes: ["Välj leveransadress"],
  },
  {
    key: "checkout-invoice",
    title: "Payment with invoice",
    component: "Checkout",
    origin: "Accelerator",
    hours: 4,
    estimateComment: "Styling + installation of payment app.",
    matchNumbers: [27],
    matchTitleIncludes: ["Betalning med faktura"],
  },
  {
    key: "checkout-billie",
    title: "Business payment via Billie, Svea or similar widget",
    component: "Checkout",
    origin: "Accelerator",
    hours: 8,
    estimateComment: "Install payment app (keys, login, tests).",
    spec: "Business “pay later” checkout session when that payment method is selected (prototype demos a Billie-style widget).",
    matchNumbers: [28],
    matchTitleIncludes: ["Billie"],
  },
  {
    key: "checkout-credit",
    title: "Credit check (blocks order over facility)",
    component: "Checkout",
    origin: "Portal",
    hours: null,
    comment: "Included from the feature list; not demonstrated in the current prototype (credit handling was removed from the demo).",
    matchNumbers: [29],
    matchTitleIncludes: ["Kreditkontroll"],
  },
  {
    key: "checkout-approval",
    title: "Approval of orders over threshold for buyers",
    component: "Checkout",
    origin: "Accelerator",
    hours: 16,
    estimateComment: "Adapt the approval flow to listen to order total, not only role.",
    spec: "Orders at or above the account threshold (prototype: SEK 5,000) require approval when approval is enabled and the user is a Buyer.",
    matchNumbers: [30],
    matchTitleIncludes: ["Attest av ordrar"],
  },
  {
    key: "checkout-confirmation",
    title: "Order confirmation (number, totals, delivery)",
    component: "Checkout",
    origin: "Accelerator",
    hours: 8,
    spec: "Confirmation shows order number, units, subtotal, VAT, total, payment, requested delivery and comment when provided.",
    matchNumbers: [31],
    matchTitleIncludes: ["Orderbekräftelse"],
  },
  {
    key: "orders-list",
    title: "Searchable order list with multi-status filter",
    component: "Orders",
    origin: "Accelerator",
    hours: 24,
    estimateComment: "Can be complex search if content such as tracking numbers is included.",
    spec: "Dense, searchable list; filters allow several statuses at once (awaiting approval, processing, partially shipped, shipped, delivered, rejected).",
    matchNumbers: [32],
    matchTitleIncludes: ["Sökbar orderlista"],
  },
  {
    key: "orders-litium",
    title: "Orders from Litium",
    component: "Orders",
    origin: "Accelerator",
    hours: 8,
    estimateComment: "Styling.",
    spec: "Orders placed in Litium are shown as standard; the list can also include orders imported from ERP.",
    matchNumbers: [33],
    matchTitleIncludes: ["Ordrar från Litium"],
  },
  {
    key: "orders-approve-reject",
    title: "Approve / reject pending orders",
    component: "Orders",
    origin: "Accelerator",
    hours: 32,
    estimateComment: "Approve exists, but reject needs to be built. Component for orders that require handling.",
    spec: "Approvers see awaiting orders highlighted; Approve / Reject stay visible without hover.",
    matchNumbers: [34],
    matchTitleIncludes: ["Godkänn / avvisa"],
  },
  {
    key: "orders-detail",
    title: "Order detail page",
    component: "Orders",
    origin: "Accelerator",
    hours: 16,
    estimateComment: "Standard, but with base-product grouping, summary and reject action.",
    spec: "Litium order number, status, date; lines grouped by base product; address, payment, comment; shipments / tracking when available.",
    matchNumbers: [35],
    matchTitleIncludes: ["Orderdetaljsida"],
  },
  {
    key: "orders-reorder",
    title: "Reorder with confirmation modal and add to cart",
    component: "Orders",
    origin: "Portal",
    hours: 32,
    estimateComment: "Modal + tailored result messaging.",
    spec: "Reorder lists lines in a confirmation; on confirm, add to cart clamped to stock with on-page message — no redirect. Apply delivery address / suggested date when present.",
    matchNumbers: [36],
    matchTitleIncludes: ["Reorder"],
  },
  {
    key: "account-details",
    title: "Account with customer details from CRM/ERP",
    component: "Account",
    origin: "Accelerator",
    hours: 8,
    spec: "Company name, customer number, payment terms and approval setting; usually fetched from CRM/ERP via Litium.",
    matchNumbers: [37],
    matchTitleIncludes: ["Konto med kunduppgifter"],
  },
  {
    key: "account-credentials",
    title: "Change own login credentials",
    component: "Account",
    origin: "Accelerator",
    hours: 4,
    spec: "Signed-in user can change name, email and password.",
    matchNumbers: [38],
    matchTitleIncludes: ["inloggningsuppgifter"],
  },
  {
    key: "account-admin-users",
    title: "Admin adds/removes users and roles",
    component: "Account",
    origin: "Accelerator",
    hours: 32,
    estimateComment: "Manage people in the organisation including roles.",
    spec: "Admin can add and remove people and change roles (Buyer / Approver / Admin).",
    matchNumbers: [39],
    matchTitleIncludes: ["Admin lägger till"],
  },
  {
    key: "account-approval-setting",
    title: "Approval setting for the account",
    component: "Account",
    origin: "Accelerator",
    hours: 16,
    estimateComment: "UI, permission check and new organisation fields.",
    spec: "Admin can turn approval on or off for the account.",
    matchNumbers: [40],
    matchTitleIncludes: ["Attestinställning"],
  },
  {
    key: "account-addresses",
    title: "Show delivery addresses",
    component: "Account",
    origin: "Accelerator",
    hours: 8,
    spec: "Delivery addresses from CRM/ERP via Litium. Adding a new address is directed to contact the supplier, not free edit in the portal.",
    matchNumbers: [41],
    matchTitleIncludes: ["Visa leveransadresser"],
  },
];

function buildDescription(f) {
  const parts = [
    `## Origin`,
    f.origin === "Accelerator"
      ? "Litium Accelerator (configure / style / extend)."
      : "Custom Portal work on top of Litium.",
    ``,
    `## Requirement`,
    f.spec ?? f.title,
  ];
  if (f.comment) {
    parts.push(``, `## Comment`, f.comment);
  }
  if (f.estimateComment) {
    parts.push(``, `## Estimate notes`, f.estimateComment);
  }
  if (f.questions) {
    parts.push(``, `## Open questions`, f.questions);
  }
  if (f.hours != null) {
    parts.push(``, `## Estimate`, `${f.hours} h`);
  } else {
    parts.push(``, `## Estimate`, `Not estimated in the feature list.`);
  }
  parts.push(
    ``,
    `## Prototype`,
    `Interactive wholesale demo in Rove Portal Studio (not production Litium data).`,
  );
  return parts.join("\n");
}

async function ensureBacklog(client) {
  const { rows } = await client.query(
    `SELECT id, name, sort_order FROM work_project_statuses
     WHERE project_id = $1 ORDER BY sort_order, name`,
    [PROJECT_ID],
  );
  const existing = rows.find((r) => r.name.toLowerCase() === "backlog");
  if (existing) return existing.id;

  if (DRY) {
    console.log("[dry] would create Backlog status");
    return "dry-backlog";
  }

  // Shift existing statuses up so Backlog can sit first.
  await client.query(
    `UPDATE work_project_statuses
     SET sort_order = sort_order + 1
     WHERE project_id = $1`,
    [PROJECT_ID],
  );
  const inserted = await client.query(
    `INSERT INTO work_project_statuses (project_id, name, sort_order, is_done)
     VALUES ($1, 'Backlog', 0, false)
     RETURNING id`,
    [PROJECT_ID],
  );
  console.log("Created status Backlog");
  return inserted.rows[0].id;
}

async function ensureComponent(client, name, cache) {
  if (cache.has(name)) return cache.get(name);
  const { rows } = await client.query(
    `SELECT id, name FROM work_components
     WHERE project_id = $1 AND lower(btrim(name)) = lower($2)`,
    [PROJECT_ID, name],
  );
  if (rows[0]) {
    cache.set(name, rows[0].id);
    return rows[0].id;
  }
  if (DRY) {
    const id = `dry-comp-${name}`;
    cache.set(name, id);
    console.log(`[dry] would create component ${name}`);
    return id;
  }
  const inserted = await client.query(
    `INSERT INTO work_components (project_id, name)
     VALUES ($1, $2) RETURNING id`,
    [PROJECT_ID, name],
  );
  console.log(`Created component ${name}`);
  cache.set(name, inserted.rows[0].id);
  return inserted.rows[0].id;
}

async function ensureLabel(client, name, cache) {
  if (cache.has(name)) return cache.get(name);
  const { rows } = await client.query(
    `SELECT id, name FROM work_issue_labels
     WHERE project_id = $1 AND lower(name) = lower($2)`,
    [PROJECT_ID, name],
  );
  if (rows[0]) {
    cache.set(name, rows[0].id);
    return rows[0].id;
  }
  if (DRY) {
    const id = `dry-label-${name}`;
    cache.set(name, id);
    console.log(`[dry] would create label ${name}`);
    return id;
  }
  const inserted = await client.query(
    `INSERT INTO work_issue_labels (project_id, name)
     VALUES ($1, $2) RETURNING id`,
    [PROJECT_ID, name],
  );
  console.log(`Created label ${name}`);
  cache.set(name, inserted.rows[0].id);
  return inserted.rows[0].id;
}

async function setOriginLabel(client, issueId, originLabelId, otherLabelId) {
  if (DRY) return;
  await client.query(
    `DELETE FROM work_issue_label_links
     WHERE issue_id = $1 AND label_id = $2`,
    [issueId, otherLabelId],
  );
  await client.query(
    `INSERT INTO work_issue_label_links (issue_id, label_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [issueId, originLabelId],
  );
}

async function ensureReferences(client, issueId) {
  if (DRY) return;
  const { rows } = await client.query(
    `SELECT id, url FROM work_issue_references WHERE issue_id = $1`,
    [issueId],
  );
  const hasDemo = rows.some((r) => r.url.includes("/wholesale"));
  const hasSpec = rows.some((r) => r.url.includes("wholesale.md"));
  if (!hasDemo) {
    await client.query(
      `INSERT INTO work_issue_references (issue_id, url, label, sort_order)
       VALUES ($1, $2, $3, 0)`,
      [issueId, DEMO_URL, "Prototype · /wholesale"],
    );
  }
  if (!hasSpec) {
    await client.query(
      `INSERT INTO work_issue_references (issue_id, url, label, sort_order)
       VALUES ($1, $2, $3, 1)`,
      [issueId, SPEC_URL, "Requirement spec (EN)"],
    );
  }
}

function findExisting(feature, issues, usedIssueIds) {
  const available = issues.filter((i) => !usedIssueIds.has(i.id));
  if (feature.matchNumbers?.length) {
    for (const n of feature.matchNumbers) {
      const hit = available.find((i) => i.number === n);
      if (hit) return hit;
    }
  }
  if (feature.matchTitleIncludes?.length) {
    for (const needle of feature.matchTitleIncludes) {
      const hit = available.find((i) =>
        i.title.toLowerCase().includes(needle.toLowerCase()),
      );
      if (hit) return hit;
    }
  }
  const exact = available.find(
    (i) => i.title.toLowerCase() === feature.title.toLowerCase(),
  );
  return exact ?? null;
}

async function main() {
  const url = process.env.CLOUD_SQL_URL;
  if (!url) throw new Error("CLOUD_SQL_URL missing");

  const client = new pg.Client({
    connectionString: stripSslMode(url),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 60000,
  });
  await client.connect();

  try {
    await resolveProjectAndActor(client);
    if (!DRY) await client.query("BEGIN");

    const backlogId = await ensureBacklog(client);
    const componentCache = new Map();
    const labelCache = new Map();

    for (const name of [
      "Framework",
      "Search",
      "PLP",
      "PDP",
      "Quick order",
      "Cart",
      "Checkout",
      "Orders",
      "Account",
    ]) {
      await ensureComponent(client, name, componentCache);
    }
    const acceleratorLabelId = await ensureLabel(client, "Accelerator", labelCache);
    const portalLabelId = await ensureLabel(client, "Portal", labelCache);

    const { rows: issues } = await client.query(
      `SELECT id, number, title FROM work_issues WHERE project_id = $1 ORDER BY number`,
      [PROJECT_ID],
    );

    let updated = 0;
    let created = 0;
    const usedIssueIds = new Set();

    for (const feature of FEATURES) {
      const componentId = await ensureComponent(
        client,
        feature.component,
        componentCache,
      );
      const description = buildDescription(feature);
      const originLabelId =
        feature.origin === "Accelerator" ? acceleratorLabelId : portalLabelId;
      const otherLabelId =
        feature.origin === "Accelerator" ? portalLabelId : acceleratorLabelId;

      const existing = findExisting(feature, issues, usedIssueIds);
      if (existing) {
        usedIssueIds.add(existing.id);
        if (DRY) {
          console.log(
            `[dry] update WS-${existing.number} → ${feature.title} (${feature.hours ?? "—"}h, ${feature.component}, ${feature.origin})`,
          );
        } else {
          await client.query(
            `UPDATE work_issues
             SET title = $3,
                 description = $4,
                 estimate_hours = $5,
                 component_id = $6,
                 status = $7,
                 owner_app_user_id = NULL
             WHERE id = $2 AND project_id = $1`,
            [
              PROJECT_ID,
              existing.id,
              feature.title,
              description,
              feature.hours,
              componentId,
              backlogId,
            ],
          );
          await setOriginLabel(client, existing.id, originLabelId, otherLabelId);
          await ensureReferences(client, existing.id);
        }
        updated += 1;
      } else {
        if (DRY) {
          console.log(
            `[dry] create → ${feature.title} (${feature.hours ?? "—"}h, ${feature.component}, ${feature.origin})`,
          );
        } else {
          const { rows: numberRows } = await client.query(
            `SELECT COALESCE(MAX(number), 0) + 1 AS next
             FROM work_issues WHERE project_id = $1`,
            [PROJECT_ID],
          );
          const { rows: orderRows } = await client.query(
            `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
             FROM work_issues WHERE project_id = $1 AND status = $2`,
            [PROJECT_ID, backlogId],
          );
          const inserted = await client.query(
            `INSERT INTO work_issues (
               project_id, number, title, status, sort_order,
               owner_app_user_id, created_by_app_user_id, description,
               issue_type, component_id, estimate_hours
             ) VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,'issue',$8,$9)
             RETURNING id, number`,
            [
              PROJECT_ID,
              numberRows[0].next,
              feature.title,
              backlogId,
              orderRows[0].next,
              ACTOR_ID,
              description,
              componentId,
              feature.hours,
            ],
          );
          const issue = inserted.rows[0];
          await client.query(
            `INSERT INTO work_issue_events (issue_id, actor_app_user_id, kind, summary)
             VALUES ($1, $2, 'created', 'created the issue')`,
            [issue.id, ACTOR_ID],
          );
          await setOriginLabel(client, issue.id, originLabelId, otherLabelId);
          await ensureReferences(client, issue.id);
          console.log(`Created WS-${issue.number} ${feature.title}`);
        }
        created += 1;
      }
    }

    if (!DRY) await client.query("COMMIT");
    console.log(
      JSON.stringify(
        {
          dry: DRY,
          project: PROJECT_TITLE,
          projectId: PROJECT_ID,
          features: FEATURES.length,
          updated,
          created,
          backlogStatusId: backlogId,
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
