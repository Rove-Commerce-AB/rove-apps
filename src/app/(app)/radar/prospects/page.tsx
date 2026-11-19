import { RadarProspectsClient } from "@/components/radar/RadarProspectsClient";
import { listRadarCompanies } from "@/lib/radar/companies";
import { listRadarProspectLists } from "@/lib/radar/prospects";
import { requireRadarActor } from "@/lib/radarActor";

export const dynamic = "force-dynamic";

export default async function RadarProspectsPage() {
  await requireRadarActor();
  const [companies, lists] = await Promise.all([
    listRadarCompanies({ prospectStatus: "interesting" }),
    listRadarProspectLists(),
  ]);
  return <RadarProspectsClient interesting={companies} lists={lists} />;
}
