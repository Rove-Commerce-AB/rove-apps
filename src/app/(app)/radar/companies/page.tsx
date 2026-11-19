import { RadarCompaniesClient } from "@/components/radar/RadarCompaniesClient";
import { listRadarAudiences } from "@/lib/radar/audiences";
import { listRadarCompanies } from "@/lib/radar/companies";
import { requireRadarActor } from "@/lib/radarActor";

export const dynamic = "force-dynamic";

export default async function RadarCompaniesPage() {
  await requireRadarActor();
  const [companies, audiences] = await Promise.all([
    listRadarCompanies({}),
    listRadarAudiences(),
  ]);
  return (
    <RadarCompaniesClient companies={companies} audiences={audiences} />
  );
}
