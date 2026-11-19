import { RadarAudiencesClient } from "@/components/radar/RadarAudiencesClient";
import { listRadarAudiences } from "@/lib/radar/audiences";
import { requireRadarActor } from "@/lib/radarActor";

export const dynamic = "force-dynamic";

export default async function RadarAudiencesPage() {
  await requireRadarActor();
  const audiences = await listRadarAudiences();
  return <RadarAudiencesClient audiences={audiences} />;
}
