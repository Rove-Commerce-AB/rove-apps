import { RadarJobsClient } from "@/components/radar/RadarJobsClient";
import {
  countRadarOrphanCompanies,
  listRadarOrphanCompanies,
} from "@/lib/radar/companies";
import {
  countRadarDomainEnrichmentBacklog,
  countRadarTechScanBacklog,
  listRadarJobConfigs,
  listRadarJobRuns,
} from "@/lib/radar/jobs";
import { requireRadarActor } from "@/lib/radarActor";

export const dynamic = "force-dynamic";

export default async function RadarJobsPage() {
  await requireRadarActor();
  const [
    configs,
    runs,
    orphanCount,
    orphanSample,
    techScanBacklog,
    domainEnrichmentBacklog,
  ] = await Promise.all([
    listRadarJobConfigs(),
    listRadarJobRuns(40),
    countRadarOrphanCompanies(),
    listRadarOrphanCompanies(20),
    countRadarTechScanBacklog(),
    countRadarDomainEnrichmentBacklog(),
  ]);
  return (
    <RadarJobsClient
      configs={configs}
      runs={runs}
      orphanCount={orphanCount}
      orphanSample={orphanSample}
      techScanBacklog={techScanBacklog}
      domainEnrichmentBacklog={domainEnrichmentBacklog}
    />
  );
}
