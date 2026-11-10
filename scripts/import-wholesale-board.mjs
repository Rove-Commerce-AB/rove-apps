/**
 * One-off: create "Wholesale portal" board under Rove and import feature cards.
 * Run: node scripts/import-wholesale-board.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { parse } from "pg-connection-string";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const raw = fs.readFileSync(path.join(root, ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

function makePool(url) {
  const parsed = parse(url);
  delete parsed.ssl;
  let cleaned = url;
  try {
    const u = new URL(url.replace(/^postgresql:/i, "postgres:"));
    u.searchParams.delete("sslmode");
    cleaned = u.toString();
  } catch {
    /* keep */
  }
  return new Pool({
    ...parsed,
    connectionString: cleaned,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
}

const FEATURES = [
  {
    title: "Sök i sidhuvud",
    epic: "Sök",
    description:
      "Accelerator-liknande produktsök i kundhuvudet mot det inloggade kontots tillgängliga sortiment.",
  },
  {
    title: "Kategorinavigation med underkategori och filter",
    epic: "PLP",
    description:
      "Retail-navigation (t.ex. Alla/Dam/Herr/Skor/Väskor) med underkategori samt filter för färg, storlek och tillgänglighet.",
  },
  {
    title: "Grid med produktkort med kundunikt sortiment och kundunikt pris",
    epic: "PLP",
    description:
      "Produktgrid som bara visar artiklar och priser från Litium-prislistan för det inloggade kontot.",
  },
  {
    title: "Första variantbilden på produktkortet i PLP",
    epic: "PLP",
    description:
      "Produktkort visar basprodukten med bilden från första varianten, inte en vald variant.",
  },
  {
    title: "Visning av variantfält på produktkort",
    epic: "PLP",
    description:
      "Produktkortet visar konfigurerade variantfält (t.ex. färgalternativ) utan hårdkodade fältetiketter.",
  },
  {
    title: "Tillgänglighet på produktkort",
    epic: "PLP",
    description:
      "Produktkortet kommunicerar lagertillgänglighet på stilnivå (tillgänglig / lågt lager / slut).",
  },
  {
    title: "Inloggning",
    epic: "Login",
    description:
      "Användaren måste logga in innan sortiment, priser och varukorg visas; landar i butiken efter inloggning.",
  },
  {
    title: "Glömt lösenord",
    epic: "Login",
    description:
      "Flöde för att återställa lösenord via Litiums inloggning/Accelerator.",
  },
  {
    title: "Logga ut från sidhuvud",
    epic: "Login",
    description:
      "Inloggad användare kan logga ut från kontoraden ovanför funktionsheadern.",
  },
  {
    title: "Byta bolag från sidhuvud",
    epic: "Login",
    description:
      "Person kopplad till flera kunder i Litium kan byta aktivt bolag i kontoraden.",
  },
  {
    title: "Produktnamn, artikelnummer, beskrivning (även variantunik information)",
    epic: "PDP",
    description:
      "Produktsidan visar namn, artikelnummer/SKU, beskrivning och variantspecifik information.",
  },
  {
    title: "Variantpris (kundunikt)",
    epic: "PDP",
    description:
      "Kundunikt grossistpris på variantnivå från prislistan; visas på PDP (eller i matrisen vid prisvariation).",
  },
  {
    title: "Variantmatris grupperad på variantfält",
    epic: "PDP",
    description:
      "Volymbeställningsmatris grupperad på konfigurerat variantfält (t.ex. färg) med storlekar/varianter per grupp.",
  },
  {
    title: "Volymkvantitet per variant med lagerbegränsning",
    epic: "PDP",
    description:
      "Redigerbart antal per variant med lagerregler; noll tillåtet och input begränsas mot återstående saldo.",
  },
  {
    title: "Snabbchips för antal (+6 / +12 / +24)",
    epic: "PDP",
    description:
      "Valfria snabbknappar för att öka antal i matrisen snabbare vid volymorder.",
  },
  {
    title: "Summering av antal, grossistvärde och rekommenderat butiksvärde",
    epic: "PDP",
    description:
      "Summering på PDP av totalt antal, grossistvärde och rekommenderat butiksvärde för raderna som läggs till.",
  },
  {
    title: "Lägg i varukorg",
    epic: "PDP",
    description:
      "Primär CTA för att lägga matrisen i varukorgen med bekräftelse nära knappen utan tvingande redirect.",
  },
  {
    title: "Snabborder med SKU eller EAN per rad",
    epic: "Snabborder",
    description:
      "Dedikerad sida där inköpare anger SKU eller EAN med antal per rad för snabb orderläggning.",
  },
  {
    title: "Sök as-you-type i snabborder mot inloggat sortiment",
    epic: "Snabborder",
    description:
      "Litiums sök med search-as-you-type matchar koder mot det inloggade sortimentet; okända koder markeras.",
  },
  {
    title: "Produktkolumn i snabborder (namn, variantfält, EAN)",
    epic: "Snabborder",
    description:
      "Visar produktnamn, konfigurerade variantfält med värden och EAN per rad enligt produkttyp.",
  },
  {
    title: "Klistra in flerradig SKU/EAN-lista i snabborder",
    epic: "Snabborder",
    description:
      "Stöd för att klistra in flera rader (SKU/EAN + antal) och fylla snabborderlistan på en gång.",
  },
  {
    title: "Varukorg med accordion grupperad på basprodukt",
    epic: "Cart",
    description:
      "Varukorgsrader grupperas på basproduktnamn i accordion med gemensamma kolumner (SKU, variant, EAN, antal, pris).",
  },
  {
    title: "Redigerbart antal i varukorg med lagerregler",
    epic: "Cart",
    description:
      "Antal i varukorgen kan ändras med samma lagerbegränsningar som på produktsidan.",
  },
  {
    title: "Önskat leveransdatum",
    epic: "Checkout",
    description:
      "Utcheckningen fångar önskat leveransdatum som sparas på ordern; lagret bekräftar slutlig leverans.",
  },
  {
    title: "Orderkommentar",
    epic: "Checkout",
    description:
      "Valfri fritextkommentar på checkout som sparas på Litium-ordern till lager eller kundservice.",
  },
  {
    title: "Välj leveransadress",
    epic: "Checkout",
    description:
      "Välj bland kontots leveransadresser (hämtade från CRM/ERP via Litium) vid utcheckning.",
  },
  {
    title: "Betalning med faktura mot konto",
    epic: "Checkout",
    description:
      "Betalningsalternativ faktura mot wholesale-kontot enligt kontots betalningsvillkor.",
  },
  {
    title: "Business payment via Billie (eller likn) widget",
    epic: "Checkout",
    description:
      "Business pay-later via Billie-liknande widget som betalningsmetod i Litium-checkout.",
  },
  {
    title: "Kreditkontroll som blockerar order över facilitet",
    epic: "Checkout",
    description:
      "Kreditlimit och öppet saldo från ERP via Litium; orderläggning blockeras om faciliteten skulle överskridas.",
  },
  {
    title: "Attest av ordrar över tröskel för inköpare",
    epic: "Checkout",
    description:
      "När attest är på och användaren är inköpare kräver ordrar över kontots tröskel godkännande innan process.",
  },
  {
    title: "Orderbekräftelse med ordernummer, totaler och leverans",
    epic: "Checkout",
    description:
      "Bekräftelsesida med ordernummer, antal, delsumma, moms, total, betalning, leverans och kommentar vid behov.",
  },
  {
    title: "Sökbar orderlista med multi-statusfilter",
    epic: "Orders",
    description:
      "Tät, sökbar orderhistorik där flera statusar kan filtreras samtidigt.",
  },
  {
    title: "Ordrar från Litium",
    epic: "Orders",
    description:
      "Orderlistan visar ordrar lagda i Litium som standard (kan även utökas med ERP-import).",
  },
  {
    title: "Godkänn / avvisa väntande ordrar",
    epic: "Orders",
    description:
      "Attestanter kan godkänna eller avvisa väntande ordrar med synliga åtgärder utan hover.",
  },
  {
    title: "Orderdetaljsida",
    epic: "Orders",
    description:
      "Orderdetalj med orderhuvud, grupperade rader, leverans, betalning, kommentar och tracking när det finns.",
  },
  {
    title: "Reorder med bekräftelsemodal och lägg i varukorg",
    epic: "Orders",
    description:
      "Reorder öppnar bekräftelse med rader och lägger dem i varukorgen (lagerbegränsat) utan redirect.",
  },
  {
    title: "Konto med kunduppgifter från CRM/ERP via Litium",
    epic: "Account",
    description:
      "Kontosidan visar kunduppgifter (företag, kundnummer, villkor, kredit, attest) hämtade via Litium.",
  },
  {
    title: "Ändra egna inloggningsuppgifter",
    epic: "Account",
    description:
      "Inloggad användare kan uppdatera egna uppgifter (namn, e-post, lösenord).",
  },
  {
    title: "Admin lägger till och tar bort användare och roller",
    epic: "Account",
    description:
      "Admin hanterar personer på kontot i Litium: lägga till, ta bort och ändra roller.",
  },
  {
    title: "Attestinställning för kontot",
    epic: "Account",
    description:
      "Admin kan slå på/av attest och styra attesttröskel för kontot.",
  },
  {
    title: "Visa leveransadresser (ny adress via kontakta oss)",
    epic: "Account",
    description:
      "Visar leveransadresser från CRM/ERP via Litium; ny adress hänvisas till leverantören, inte fri redigering.",
  },
];

const DEFAULT_STATUSES = [
  { name: "Todo", isDone: false },
  { name: "In progress", isDone: false },
  { name: "To be tested", isDone: false },
  { name: "In review", isDone: false },
  { name: "Done", isDone: true },
];

async function main() {
  loadEnvLocal();
  const url = process.env.CLOUD_SQL_URL;
  if (!url) throw new Error("CLOUD_SQL_URL missing");

  const pool = makePool(url);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: customers } = await client.query(
      `SELECT id, name, is_internal
       FROM customers
       WHERE is_active = true AND lower(name) = lower($1)`,
      ["Rove"]
    );
    let customer = customers[0];
    if (!customer) {
      const { rows } = await client.query(
        `SELECT id, name, is_internal
         FROM customers
         WHERE is_active = true
           AND (lower(name) LIKE '%rove%' OR is_internal = true)
         ORDER BY is_internal DESC, name`
      );
      console.log("Candidates:", rows);
      customer = rows.find((r) => r.name.trim().toLowerCase() === "rove") ?? rows[0];
    }
    if (!customer) throw new Error("No Rove customer found");
    console.log("Customer:", customer.id, customer.name);

    const { rows: admins } = await client.query(
      `SELECT id, name, email FROM app_users WHERE role = 'admin' ORDER BY created_at LIMIT 1`
    );
    const actor = admins[0];
    if (!actor) throw new Error("No admin app_user found");
    console.log("Actor:", actor.email);

    const { rows: existingBoards } = await client.query(
      `SELECT id, title, prefix FROM work_boards
       WHERE customer_id = $1 AND archived_at IS NULL AND lower(title) = lower($2)`,
      [customer.id, "Wholesale portal"]
    );
    if (existingBoards[0]) {
      throw new Error(
        `Board already exists: ${existingBoards[0].id} (${existingBoards[0].prefix})`
      );
    }

    const prefix = "WS";
    const { rows: boardRows } = await client.query(
      `INSERT INTO work_boards (customer_id, title, prefix, created_by_app_user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, prefix`,
      [customer.id, "Wholesale portal", prefix, actor.id]
    );
    const board = boardRows[0];
    console.log("Board:", board.id, board.title, board.prefix);

    await client.query(
      `INSERT INTO work_board_members (board_id, app_user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [board.id, actor.id]
    );

    // Add customer people as members when present
    const { rows: people } = await client.query(
      `SELECT u.id
       FROM app_users u
       WHERE u.id IN (
         SELECT c.app_user_id FROM customer_consultants cc
         JOIN consultants c ON c.id = cc.consultant_id
         WHERE cc.customer_id = $1 AND c.app_user_id IS NOT NULL
         UNION
         SELECT cau.app_user_id FROM customer_app_users cau WHERE cau.customer_id = $1
       )`,
      [customer.id]
    );
    for (const person of people) {
      await client.query(
        `INSERT INTO work_board_members (board_id, app_user_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [board.id, person.id]
      );
    }

    for (const [index, status] of DEFAULT_STATUSES.entries()) {
      await client.query(
        `INSERT INTO work_board_statuses (board_id, name, sort_order, is_done)
         VALUES ($1, $2, $3, $4)`,
        [board.id, status.name, index, status.isDone]
      );
    }

    const { rows: todoRows } = await client.query(
      `SELECT id FROM work_board_statuses
       WHERE board_id = $1 AND lower(name) = lower('Todo')
       LIMIT 1`,
      [board.id]
    );
    const todoStatusId = todoRows[0]?.id;
    if (!todoStatusId) throw new Error("Todo status missing after board create");

    const labelCache = new Map();
    async function labelId(name) {
      if (labelCache.has(name)) return labelCache.get(name);
      const { rows: existing } = await client.query(
        `SELECT id, name FROM work_issue_labels
         WHERE board_id = $1 AND lower(name) = lower($2)`,
        [board.id, name]
      );
      if (existing[0]) {
        labelCache.set(name, existing[0].id);
        return existing[0].id;
      }
      const { rows } = await client.query(
        `INSERT INTO work_issue_labels (board_id, name)
         VALUES ($1, $2)
         RETURNING id`,
        [board.id, name]
      );
      labelCache.set(name, rows[0].id);
      return rows[0].id;
    }

    let number = 0;
    for (const feature of FEATURES) {
      number += 1;
      const { rows: issueRows } = await client.query(
        `INSERT INTO work_issues (
           board_id, number, title, status, sort_order,
           description, owner_app_user_id, created_by_app_user_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
         RETURNING id`,
        [
          board.id,
          number,
          feature.title,
          todoStatusId,
          number - 1,
          feature.description,
          actor.id,
        ]
      );
      const issueId = issueRows[0].id;
      const lid = await labelId(feature.epic);
      await client.query(
        `INSERT INTO work_issue_label_links (issue_id, label_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [issueId, lid]
      );
      await client.query(
        `INSERT INTO work_issue_events (issue_id, actor_app_user_id, kind, summary)
         VALUES ($1, $2, 'created', 'created the issue')`,
        [issueId, actor.id]
      );
    }

    await client.query("COMMIT");
    console.log(`Created ${FEATURES.length} issues on board ${board.id}`);
    console.log(`Prefix ${board.prefix} — keys WS-1 … WS-${FEATURES.length}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
