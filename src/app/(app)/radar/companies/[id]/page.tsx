import { notFound } from "next/navigation";
import { RadarCompanyDetailClient } from "@/components/radar/RadarCompanyDetailClient";
import { getRadarCompany } from "@/lib/radar/companies";
import { listRadarProspectLists } from "@/lib/radar/prospects";
import { requireRadarActor } from "@/lib/radarActor";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function RadarCompanyDetailPage({ params }: Props) {
  await requireRadarActor();
  const { id } = await params;
  const [company, lists] = await Promise.all([
    getRadarCompany(id),
    listRadarProspectLists(),
  ]);
  if (!company) notFound();
  return <RadarCompanyDetailClient company={company} lists={lists} />;
}
