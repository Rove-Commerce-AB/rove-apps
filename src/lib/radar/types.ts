export const RADAR_AUDIENCE_STATUSES = ["active", "paused"] as const;
export type RadarAudienceStatus = (typeof RADAR_AUDIENCE_STATUSES)[number];

export const RADAR_FINANCIALS_ORIGINS = [
  "unknown",
  "demo",
  "licensed",
  "scb",
] as const;
export type RadarFinancialsOrigin = (typeof RADAR_FINANCIALS_ORIGINS)[number];

export const RADAR_BUSINESS_MODELS = ["d2c", "b2b", "wholesale", "other"] as const;
export type RadarBusinessModel = (typeof RADAR_BUSINESS_MODELS)[number];

export const RADAR_PROSPECT_STATUSES = ["interesting", "irrelevant"] as const;
export type RadarProspectStatus = (typeof RADAR_PROSPECT_STATUSES)[number];

export const RADAR_JOB_TYPES = [
  "company_import",
  "domain_enrichment",
  "tech_scan",
  "scb_directory_sync",
] as const;
export type RadarJobType = (typeof RADAR_JOB_TYPES)[number];

export const RADAR_JOB_RUN_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "paused",
  "cancelled",
] as const;
export type RadarJobRunStatus = (typeof RADAR_JOB_RUN_STATUSES)[number];

export const RADAR_PRIORITY_TECHNOLOGIES = [
  { key: "litium", name: "Litium", category: "ecommerce" },
  { key: "norce", name: "Norce", category: "ecommerce" },
  { key: "optimizely", name: "Optimizely", category: "ecommerce" },
  { key: "shopify", name: "Shopify", category: "ecommerce" },
  { key: "centra", name: "Centra", category: "ecommerce" },
  { key: "wordpress", name: "WordPress", category: "cms" },
  { key: "woocommerce", name: "WooCommerce", category: "ecommerce" },
] as const;

export const RADAR_JOB_LABELS: Record<RadarJobType, string> = {
  company_import: "Import matching companies",
  domain_enrichment: "Domain enrichment",
  tech_scan: "Technology scan",
  scb_directory_sync: "SCB directory sync",
};

export type RadarAudience = {
  id: string;
  name: string;
  status: RadarAudienceStatus;
  priority: number;
  sni_prefixes: string[];
  counties: string[];
  employee_min: number | null;
  employee_max: number | null;
  /** Selected SCB omsättningsklass codes (0–12). Empty = no revenue filter. */
  oms_kl_codes: number[];
  revenue_min_sek: number | null;
  revenue_max_sek: number | null;
  estimated_company_count: number | null;
  notes: string | null;
  company_count: number;
  created_at: string;
  updated_at: string;
};

export type RadarCompanyListItem = {
  id: string;
  organization_number: string;
  name: string;
  county: string | null;
  sni_code: string | null;
  sni_description: string | null;
  employee_count: number | null;
  revenue_sek: number | null;
  oms_kl: number | null;
  oms_kl_label: string | null;
  anst_kl: number | null;
  anst_kl_label: string | null;
  financials_origin: RadarFinancialsOrigin;
  business_model: RadarBusinessModel | null;
  source: string;
  is_demo: boolean;
  matched_customer_id: string | null;
  matched_customer_name: string | null;
  primary_hostname: string | null;
  technologies: string[];
  prospect_status: RadarProspectStatus | null;
  audience_names: string[];
  /** Staff owner for the prospect row; null when unset or no prospect. */
  owner: { id: string; name: string; initials: string } | null;
  hubspot_company_id: string | null;
  hubspot_exported_at: string | null;
};

export type RadarDomain = {
  id: string;
  company_id: string;
  hostname: string;
  is_primary: boolean;
  source: string;
  content_hash: string | null;
  last_fetched_at: string | null;
  last_scanned_at: string | null;
  scan_status: string;
};

export type RadarTechnology = {
  id: string;
  domain_id: string;
  company_id: string;
  technology_key: string;
  technology_name: string;
  category: string;
  outcome: "identified" | "not_identified";
  confidence: number;
  source: string;
  detected_at: string;
  hostname: string | null;
};

export type RadarCompanyDetail = RadarCompanyListItem & {
  legal_form: string | null;
  municipality: string | null;
  source_ref: string | null;
  source_fetched_at: string | null;
  notes_prospect: string | null;
  domains: RadarDomain[];
  technologies_detail: RadarTechnology[];
  offer_signals: string[];
};

/** Company with no audience, prospect, list, domain, or customer match. */
export type RadarOrphanCompany = {
  id: string;
  organization_number: string;
  name: string;
  county: string | null;
};

export type RadarProspectList = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  created_at: string;
};

export type RadarJobConfig = {
  job_type: RadarJobType;
  schedule_enabled: boolean;
  schedule_cron: string;
  paused: boolean;
  max_items_per_run: number;
  max_parallelism: number;
  request_delay_ms: number;
  skip_unchanged: boolean;
  settings: Record<string, unknown>;
  updated_at: string;
};

export type RadarJobRun = {
  id: string;
  job_type: RadarJobType;
  trigger: string;
  status: RadarJobRunStatus;
  requested_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  processed_count: number;
  error_count: number;
  message: string | null;
  error_detail: string | null;
  created_at: string;
};

export type RadarVerticalRow = {
  key: string;
  label: string;
  company_count: number;
  with_priority_tech: number;
  avg_employees: number | null;
  tech_breakdown: { key: string; name: string; count: number }[];
};

/** Hit from Radar Search (SCB directory / live / already in Radar). */
export type RadarSearchHit = {
  organization_number: string;
  organization_number_formatted: string;
  name: string;
  legal_form: string | null;
  sni_code: string | null;
  sni_description: string | null;
  county: string | null;
  municipality: string | null;
  company_id: string | null;
  prospect_status: string | null;
  in_radar: boolean;
  source: "directory" | "scb_live" | "radar";
};
