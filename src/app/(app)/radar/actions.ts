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
  updateRadarCompanyBusinessModel,
} from "@/lib/radar/companies";
import {
  isRadarJobType,
  queueRadarJobRun,
  resumeRadarJob,
  stopRadarJob,
  updateRadarJobConfig,
} from "@/lib/radar/jobs";
import { requireRadarActor } from "@/lib/radarActor";
import {
  addCompanyToProspectList,
  createRadarProspectList,
  setRadarProspectStatus,
} from "@/lib/radar/prospects";
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

export async function addRadarDomainAction(input: {
  companyId: string;
  hostname: string;
  isPrimary?: boolean;
}) {
  await requireRadarActor();
  const domain = await addRadarDomain({
    ...input,
    source: "manual",
  });
  revalidateRadar();
  return domain;
}

export async function updateRadarCompanyBusinessModelAction(
  companyId: string,
  businessModel: RadarBusinessModel | null
) {
  await requireRadarActor();
  await updateRadarCompanyBusinessModel(companyId, businessModel);
  revalidateRadar();
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
