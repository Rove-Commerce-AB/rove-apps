import "server-only";

import { createHash } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { RADAR_PRIORITY_TECHNOLOGIES } from "@/lib/radar/types";

const execFileAsync = promisify(execFile);

export type TechDetection = {
  technology_key: string;
  technology_name: string;
  category: string;
  outcome: "identified" | "not_identified";
  confidence: number;
  source: string;
  raw?: Record<string, unknown>;
};

const FINGERPRINTS: {
  key: string;
  name: string;
  category: string;
  patterns: RegExp[];
}[] = [
  {
    key: "litium",
    name: "Litium",
    category: "ecommerce",
    patterns: [/litium/i, /_litium/i, /litium\.accelerator/i],
  },
  {
    key: "norce",
    name: "Norce",
    category: "ecommerce",
    patterns: [/norce/i, /labra\.io/i, /norce\.commerce/i],
  },
  {
    key: "optimizely",
    name: "Optimizely",
    category: "ecommerce",
    patterns: [/optimizely/i, /episerver/i],
  },
  {
    key: "shopify",
    name: "Shopify",
    category: "ecommerce",
    patterns: [/cdn\.shopify\.com/i, /Shopify\.theme/i, /myshopify\.com/i],
  },
  {
    key: "centra",
    name: "Centra",
    category: "ecommerce",
    patterns: [/centra\./i, /centrausercontent/i],
  },
  {
    key: "wordpress",
    name: "WordPress",
    category: "cms",
    patterns: [
      /wp-content\//i,
      /wp-includes\//i,
      /wp-json\//i,
      /name=["']generator["'][^>]*wordpress/i,
    ],
  },
  {
    key: "woocommerce",
    name: "WooCommerce",
    category: "ecommerce",
    patterns: [
      /woocommerce/i,
      /wc-ajax/i,
      /wp-content\/plugins\/woocommerce/i,
    ],
  },
];

function detectionsFromHtml(html: string, source: string): TechDetection[] {
  const found: TechDetection[] = [];
  for (const fp of FINGERPRINTS) {
    if (fp.patterns.some((p) => p.test(html))) {
      found.push({
        technology_key: fp.key,
        technology_name: fp.name,
        category: fp.category,
        outcome: "identified",
        confidence: source === "webanalyze" ? 0.9 : 0.75,
        source,
      });
    }
  }
  return found;
}

async function tryWebanalyze(hostname: string): Promise<TechDetection[] | null> {
  const bin = process.env.RADAR_WEBANALYZE_BIN?.trim();
  if (!bin) return null;
  const apps =
    process.env.RADAR_WEBANALYZE_APPS?.trim() || "technologies.json";
  try {
    const { stdout } = await execFileAsync(
      bin,
      ["-host", hostname, "-apps", apps, "-output", "json", "-silent"],
      { timeout: 45000, maxBuffer: 4 * 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout) as {
      matches?: { app_name?: string; app_npm?: string }[];
    };
    const detections: TechDetection[] = [];
    const seen = new Set<string>();
    for (const match of parsed.matches ?? []) {
      const name = (match.app_name || match.app_npm || "").trim();
      if (!name) continue;
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const priority = RADAR_PRIORITY_TECHNOLOGIES.find(
        (t) =>
          t.name.toLowerCase() === name.toLowerCase() ||
          t.key === key
      );
      const technology_key = priority?.key ?? key;
      if (!technology_key || seen.has(technology_key)) continue;
      seen.add(technology_key);
      const categoryNames = (
        match as { app?: { category_names?: string[] } }
      ).app?.category_names;
      detections.push({
        technology_key,
        technology_name: priority?.name ?? name,
        category:
          priority?.category ??
          categoryNames?.[0]?.toLowerCase().replace(/\s+/g, "_") ??
          "other",
        outcome: "identified",
        confidence: 0.9,
        source: "webanalyze",
        raw: {
          app_name: name,
          ...(categoryNames ? { category_names: categoryNames } : {}),
        },
      });
    }
    return detections;
  } catch {
    return null;
  }
}

async function fetchHomepage(hostname: string): Promise<{
  html: string;
  hash: string;
} | null> {
  if (hostname.endsWith(".example")) {
    // Demo hosts are not fetched; worker leaves them or uses seed data.
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`https://${hostname}`, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "RoveRadarBot/0.1 (+https://rove.se; market-research)",
        Accept: "text/html",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const hash = createHash("sha256").update(html).digest("hex");
    return { html, hash };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function scanRadarDomain(
  domainId: string,
  options?: { force?: boolean }
): Promise<{
  detections: number;
  skipped: boolean;
  scan_status: string;
}> {
  const { rows } = await cloudSqlPool.query<{
    id: string;
    company_id: string;
    hostname: string;
    content_hash: string | null;
  }>(
    `SELECT id, company_id, hostname, content_hash
     FROM radar_domains WHERE id = $1`,
    [domainId]
  );
  const domain = rows[0];
  if (!domain) return { detections: 0, skipped: true, scan_status: "skipped" };

  if (domain.hostname.endsWith(".example")) {
    await cloudSqlPool.query(
      `UPDATE radar_domains
       SET scan_status = 'skipped', last_scanned_at = now()
       WHERE id = $1`,
      [domainId]
    );
    return { detections: 0, skipped: true, scan_status: "skipped" };
  }

  const page = await fetchHomepage(domain.hostname);
  if (!page) {
    await cloudSqlPool.query(
      `UPDATE radar_domains
       SET scan_status = 'failed', last_scanned_at = now()
       WHERE id = $1`,
      [domainId]
    );
    await cloudSqlPool.query(
      `INSERT INTO radar_technologies (
         domain_id, company_id, technology_key, technology_name, category,
         outcome, confidence, source, detected_at
       ) VALUES ($1, $2, 'scan_failed', 'Scan failed', 'other', 'not_identified', 0.2, 'fingerprint', now())
       ON CONFLICT (domain_id, technology_key, outcome) DO UPDATE SET
         detected_at = now(), confidence = EXCLUDED.confidence`,
      [domainId, domain.company_id]
    );
    return { detections: 0, skipped: false, scan_status: "failed" };
  }

  const configRows = await cloudSqlPool.query<{ skip_unchanged: boolean }>(
    `SELECT skip_unchanged FROM radar_job_configs WHERE job_type = 'tech_scan'`
  );
  if (
    !options?.force &&
    configRows.rows[0]?.skip_unchanged &&
    domain.content_hash &&
    domain.content_hash === page.hash
  ) {
    await cloudSqlPool.query(
      `UPDATE radar_domains
       SET scan_status = 'skipped', last_scanned_at = now()
       WHERE id = $1`,
      [domainId]
    );
    return { detections: 0, skipped: true, scan_status: "skipped" };
  }

  const fromWebanalyze = await tryWebanalyze(domain.hostname);
  let detections =
    fromWebanalyze && fromWebanalyze.length > 0
      ? fromWebanalyze
      : detectionsFromHtml(page.html, "fingerprint");

  if (detections.length === 0) {
    detections = [
      {
        technology_key: "unknown_stack",
        technology_name: "Unknown stack",
        category: "other",
        outcome: "not_identified",
        confidence: 0.4,
        source:
          fromWebanalyze != null ? "webanalyze" : "fingerprint",
      },
    ];
  }

  for (const d of detections) {
    await cloudSqlPool.query(
      `INSERT INTO radar_technologies (
         domain_id, company_id, technology_key, technology_name, category,
         outcome, confidence, source, detected_at, raw
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9::jsonb)
       ON CONFLICT (domain_id, technology_key, outcome) DO UPDATE SET
         technology_name = EXCLUDED.technology_name,
         category = EXCLUDED.category,
         confidence = EXCLUDED.confidence,
         source = EXCLUDED.source,
         detected_at = now(),
         raw = EXCLUDED.raw`,
      [
        domainId,
        domain.company_id,
        d.technology_key,
        d.technology_name,
        d.category,
        d.outcome,
        d.confidence,
        d.source,
        JSON.stringify(d.raw ?? {}),
      ]
    );
  }

  await cloudSqlPool.query(
    `UPDATE radar_domains
     SET content_hash = $2,
         last_fetched_at = now(),
         last_scanned_at = now(),
         scan_status = 'scanned'
     WHERE id = $1`,
    [domainId, page.hash]
  );

  return {
    detections: detections.length,
    skipped: false,
    scan_status: "scanned",
  };
}

/** Scan every domain for a company (manual UI). Force bypasses skip_unchanged. */
export async function scanRadarCompanyDomains(companyId: string): Promise<{
  technologies: string[];
  scan_status: string;
  scanned: number;
}> {
  const { rows } = await cloudSqlPool.query<{ id: string }>(
    `SELECT id FROM radar_domains
     WHERE company_id = $1
     ORDER BY is_primary DESC, hostname`,
    [companyId]
  );
  if (rows.length === 0) {
    throw new Error("Add a domain before scanning");
  }

  let lastStatus = "scanned";
  let scanned = 0;
  for (const row of rows) {
    const result = await scanRadarDomain(row.id, { force: true });
    if (!result.skipped) scanned += 1;
    lastStatus = result.scan_status;
  }

  const tech = await cloudSqlPool.query<{ technology_name: string }>(
    `SELECT DISTINCT technology_name
     FROM radar_technologies
     WHERE company_id = $1 AND outcome = 'identified'
     ORDER BY technology_name`,
    [companyId]
  );

  return {
    technologies: tech.rows.map((r) => r.technology_name),
    scan_status: lastStatus,
    scanned,
  };
}
