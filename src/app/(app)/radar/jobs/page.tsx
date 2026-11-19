import { RadarJobsClient } from "@/components/radar/RadarJobsClient";
import { listRadarJobConfigs, listRadarJobRuns } from "@/lib/radar/jobs";
import { requireRadarActor } from "@/lib/radarActor";

export const dynamic = "force-dynamic";

export default async function RadarJobsPage() {
  await requireRadarActor();
  const [configs, runs] = await Promise.all([
    listRadarJobConfigs(),
    listRadarJobRuns(40),
  ]);
  return <RadarJobsClient configs={configs} runs={runs} />;
}
