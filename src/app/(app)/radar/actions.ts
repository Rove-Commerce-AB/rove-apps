"use server";

import { revalidatePath } from "next/cache";
import {
  createRadarAudience,
  deleteRadarAudience,
  setRadarAudienceStatus,
  updateRadarAudience,
  type CreateRadarAudienceInput,
  type UpdateRadarAudienceInput,
} from "@/lib/radar/audiences";
import {
  addRadarDomain,
  deleteRadarCompany,
  deleteRadarDomain,
  deleteRadarOrphanCompanies,
  upsertRadarCompany,
  updateRadarCompanyBusinessModel,
} from "@/lib/radar/companies";
import { resolveDomainFromName } from "@/lib/radar/domainGuess";
import { resolveSniDescription } from "@/lib/radar/sniSections";
import { normalizeOrganizationNumber } from "@/lib/radar/orgNumber";
import {
  isRadarJobType,
  queueRadarJobRun,
  resumeRadarJob,
  stopRadarJob,
  updateRadarJobConfig,
} from "@/lib/radar/jobs";
import { requireRadarActor } from "@/lib/radarActor";
import {
  exportRadarCompaniesToHubSpot,
  isHubSpotConfigured,
  previewRadarHubSpotExport,
} from "@/lib/radar/hubspot";
import type { HubSpotExistingMode } from "@/lib/radar/hubspotTypes";
import {
  addCompanyToProspectList,
  clearRadarProspect,
  createRadarProspectList,
  removeCompanyFromProspectList,
  setRadarProspectOwner,
  setRadarProspectStatus,
} from "@/lib/radar/prospects";
import { scanRadarCompanyDomains } from "@/lib/radar/techScan";
import { runRadarWorkerTick } from "@/lib/radar/workerTick";
import type {
  RadarAudienceStatus,
  RadarBusinessModel,
  RadarJobType,
  RadarProspectStatus,
} from "@/lib/radar/types";
import { ROUTES } from "@/lib/routes";

function revalidateRadar() {
  revalidatePath(ROUTES.radar);
  revalidatePath(ROUTES.radarOverview);
  revalidatePath(ROUTES.radarAudiences);
  revalidatePath(ROUTES.radarCompanies);
  revalidatePath(ROUTES.radarSearch);
  revalidatePath(ROUTES.radarProspects);
  revalidatePath(ROUTES.radarVerticals);
  revalidatePath(ROUTES.radarJobs);
}

export async function createRadarAudienceAction(
  input: CreateRadarAudienceInput
) {
  await requireRadarActor();
  const audience = await createRadarAudience(input);
  revalidateRadar();
  return audience;
}

export async function updateRadarAudienceAction(
  id: string,
  input: UpdateRadarAudienceInput
) {
  await requireRadarActor();
  const audience = await updateRadarAudience(id, input);
  revalidateRadar();
  return audience;
}

export async function setRadarAudienceStatusAction(
  id: string,
  status: RadarAudienceStatus
) {
  await requireRadarActor();
  const audience = await setRadarAudienceStatus(id, status);
  revalidateRadar();
  return audience;
}

export async function deleteRadarAudienceAction(id: string) {
  await requireRadarActor();
  await deleteRadarAudience(id);
  revalidateRadar();
}

export async function setRadarProspectStatusAction(input: {
  companyId: string;
  status: RadarProspectStatus;
  notes?: string | null;
}) {
  const actor = await requireRadarActor();
  await setRadarProspectStatus({
    ...input,
    markedBy: actor.id,
  });
  revalidateRadar();
}

export async function clearRadarProspectAction(companyId: string) {
  await requireRadarActor();
  await clearRadarProspect(companyId);
  revalidateRadar();
}

export async function clearRadarProspectsAction(companyIds: string[]) {
  await requireRadarActor();
  const ids = [...new Set(companyIds.filter(Boolean))];
  for (const companyId of ids) {
    await clearRadarProspect(companyId);
  }
  revalidateRadar();
  return { cleared: ids.length };
}

export async function setRadarProspectsStatusAction(input: {
  companyIds: string[];
  status: RadarProspectStatus;
  notes?: string | null;
}) {
  const actor = await requireRadarActor();
  const ids = [...new Set(input.companyIds.filter(Boolean))];
  for (const companyId of ids) {
    await setRadarProspectStatus({
      companyId,
      status: input.status,
      notes: input.notes,
      markedBy: actor.id,
    });
  }
  revalidateRadar();
  return { updated: ids.length };
}

export async function setRadarProspectOwnerAction(input: {
  companyId: string;
  ownerAppUserId: string | null;
}) {
  const actor = await requireRadarActor();
  await setRadarProspectOwner({
    companyId: input.companyId,
    ownerAppUserId: input.ownerAppUserId,
    markedBy: actor.id,
  });
  revalidateRadar();
}

export async function previewRadarHubSpotExportAction(input: {
  companyIds: string[];
}) {
  await requireRadarActor();
  if (!isHubSpotConfigured()) {
    throw new Error(
      "HubSpot is not configured. Set HUBSPOT_PRIVATE_APP_TOKEN."
    );
  }
  const ids = [...new Set(input.companyIds.filter(Boolean))];
  if (ids.length === 0) {
    throw new Error("Select at least one company.");
  }
  return previewRadarHubSpotExport(ids);
}

export async function exportRadarCompaniesToHubSpotAction(input: {
  companyIds: string[];
  onExisting?: HubSpotExistingMode;
}) {
  await requireRadarActor();
  if (!isHubSpotConfigured()) {
    throw new Error(
      "HubSpot is not configured. Set HUBSPOT_PRIVATE_APP_TOKEN."
    );
  }
  const ids = [...new Set(input.companyIds.filter(Boolean))];
  if (ids.length === 0) {
    throw new Error("Select at least one company.");
  }
  const result = await exportRadarCompaniesToHubSpot(ids, {
    onExisting: input.onExisting ?? "update",
  });
  revalidateRadar();
  return result;
}

export async function createRadarProspectListAction(input: {
  name: string;
  description?: string | null;
}) {
  const actor = await requireRadarActor();
  const list = await createRadarProspectList({
    ...input,
    createdBy: actor.id,
  });
  revalidateRadar();
  return list;
}

export async function addCompanyToProspectListAction(input: {
  listId: string;
  companyId: string;
}) {
  const actor = await requireRadarActor();
  await addCompanyToProspectList({
    ...input,
    addedBy: actor.id,
  });
  revalidateRadar();
}

export async function addCompaniesToProspectListAction(input: {
  listId: string;
  companyIds: string[];
}) {
  const actor = await requireRadarActor();
  const ids = [...new Set(input.companyIds.filter(Boolean))];
  for (const companyId of ids) {
    await addCompanyToProspectList({
      listId: input.listId,
      companyId,
      addedBy: actor.id,
    });
  }
  revalidateRadar();
  return { added: ids.length };
}

export async function removeCompaniesFromProspectListAction(input: {
  listId: string;
  companyIds: string[];
}) {
  await requireRadarActor();
  const ids = [...new Set(input.companyIds.filter(Boolean))];
  for (const companyId of ids) {
    await removeCompanyFromProspectList({
      listId: input.listId,
      companyId,
    });
  }
  revalidateRadar();
  return { removed: ids.length };
}

export async function addRadarDomainAction(input: {
  companyId: string;
  hostname: string;
  isPrimary?: boolean;
  source?: "manual" | "lookup";
}) {
  await requireRadarActor();
  const domain = await addRadarDomain({
    ...input,
    source: input.source ?? "manual",
  });
  revalidateRadar();
  return domain;
}

export async function deleteRadarDomainAction(input: {
  companyId: string;
  hostname?: string | null;
}) {
  await requireRadarActor();
  await deleteRadarDomain(input);
  revalidateRadar();
}

export async function updateRadarCompanyBusinessModelAction(
  companyId: string,
  businessModel: RadarBusinessModel | null
) {
  await requireRadarActor();
  await updateRadarCompanyBusinessModel(companyId, businessModel);
  revalidateRadar();
}

export async function deleteRadarCompanyAction(companyId: string) {
  await requireRadarActor();
  await deleteRadarCompany(companyId);
  revalidateRadar();
}

export async function deleteRadarOrphansAction() {
  await requireRadarActor();
  const deleted = await deleteRadarOrphanCompanies();
  revalidateRadar();
  return { deleted };
}

export async function queueRadarJobAction(jobType: string) {
  const actor = await requireRadarActor();
  if (!isRadarJobType(jobType)) throw new Error("Invalid job type");
  await resumeRadarJob(jobType);
  const { run, created } = await queueRadarJobRun({
    jobType,
    trigger: "manual",
    requestedBy: actor.id,
  });
  revalidateRadar();
  return { run, created };
}

export async function stopRadarJobAction(jobType: string) {
  await requireRadarActor();
  if (!isRadarJobType(jobType)) throw new Error("Invalid job type");
  await stopRadarJob(jobType);
  revalidateRadar();
}

export async function setRadarJobScheduleAction(
  jobType: string,
  scheduleEnabled: boolean
) {
  await requireRadarActor();
  if (!isRadarJobType(jobType)) throw new Error("Invalid job type");
  await updateRadarJobConfig(jobType as RadarJobType, {
    schedule_enabled: scheduleEnabled,
  });
  revalidateRadar();
}

export async function updateRadarJobLimitsAction(
  jobType: string,
  input: {
    max_items_per_run?: number;
    max_parallelism?: number;
    request_delay_ms?: number;
    skip_unchanged?: boolean;
  }
) {
  await requireRadarActor();
  if (!isRadarJobType(jobType)) throw new Error("Invalid job type");
  await updateRadarJobConfig(jobType as RadarJobType, input);
  revalidateRadar();
}

/** Runs queued jobs in-process (dev / manual). Production uses Cloud Run Job + API. */
export async function runRadarWorkerTickAction() {
  await requireRadarActor();
  const result = await runRadarWorkerTick({ enqueueScheduled: false });
  revalidateRadar();
  return result;
}

/** Upsert company from SCB search hit and mark as interesting prospect. */
export async function addSearchHitAsProspectAction(input: {
  organization_number: string;
  name: string;
  legal_form?: string | null;
  county?: string | null;
  municipality?: string | null;
  sni_code?: string | null;
  hostname?: string | null;
}) {
  const actor = await requireRadarActor();
  const org = normalizeOrganizationNumber(input.organization_number);
  if (!org) throw new Error("Invalid organization number");
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");

  const companyId = await upsertRadarCompany({
    organization_number: org,
    name,
    legal_form: input.legal_form ?? null,
    county: input.county ?? null,
    municipality: input.municipality ?? null,
    sni_code: input.sni_code ?? null,
    sni_description: resolveSniDescription(input.sni_code ?? null),
    financials_origin: "scb",
    source: "scb_search",
    source_ref: "radar-search",
    is_demo: false,
  });

  await setRadarProspectStatus({
    companyId,
    status: "interesting",
    markedBy: actor.id,
  });

  if (input.hostname?.trim()) {
    await addRadarDomain({
      companyId,
      hostname: input.hostname.trim(),
      isPrimary: true,
      source: "lookup",
    });
  }

  revalidateRadar();
  return { companyId };
}

/** Probe likely domains for a company name (not persisted). */
export async function guessDomainForSearchHitAction(input: {
  name: string;
  organization_number: string;
}) {
  await requireRadarActor();
  const org = normalizeOrganizationNumber(input.organization_number) ?? "";
  const resolved = await resolveDomainFromName({
    name: input.name,
    organizationNumber: org,
    timeoutMs: 6000,
    delayMs: 100,
  });
  return { hostname: resolved?.hostname ?? null, tried: resolved?.tried ?? 0 };
}

/** Run technology scan on a company's domains (manual, force refresh). */
export async function scanRadarCompanyAction(companyId: string) {
  await requireRadarActor();
  const result = await scanRadarCompanyDomains(companyId);
  revalidateRadar();
  revalidatePath(`${ROUTES.radarCompanies}/${companyId}`);
  return result;
}
