import { RadarSearchClient } from "@/components/radar/RadarSearchClient";
import { countScbDirectoryRows } from "@/lib/radar/scb/directorySearch";
import { requireRadarActor } from "@/lib/radarActor";

export const dynamic = "force-dynamic";

export default async function RadarSearchPage() {
  await requireRadarActor();
  const directoryCount = await countScbDirectoryRows();
  return <RadarSearchClient initialDirectoryCount={directoryCount} />;
}
