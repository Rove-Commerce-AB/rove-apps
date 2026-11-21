export type HubSpotExportResult = {
  exported: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

export type HubSpotExistingMode = "update" | "skip";

export type HubSpotDuplicateMatch = {
  companyId: string;
  name: string;
  domain: string | null;
  matchedBy: "domain" | "name";
  hubspotId: string;
  hubspotName: string | null;
};

export type HubSpotExportPreview = {
  companyIds: string[];
  duplicates: HubSpotDuplicateMatch[];
  newWithDomain: number;
  /** No domain and no HubSpot name match — will be created. */
  newWithoutDomain: number;
};
