import { RadarProspectsClient } from "@/components/radar/RadarProspectsClient";
import { listRadarCompanies } from "@/lib/radar/companies";
import { isHubSpotConfigured } from "@/lib/radar/hubspot";
import {
  listRadarOwnerPeople,
  listRadarProspectLists,
} from "@/lib/radar/prospects";
import { requireRadarActor } from "@/lib/radarActor";

export const dynamic = "force-dynamic";

export default async function RadarProspectsPage() {
  await requireRadarActor();
  const [interesting, lists, people] = await Promise.all([
    listRadarCompanies({ prospectStatus: "interesting" }),
    listRadarProspectLists(),
    listRadarOwnerPeople(),
  ]);

  const listMembersEntries = await Promise.all(
    lists.map(async (list) => {
      const members = await listRadarCompanies({ prospectListId: list.id });
      return [list.id, members] as const;
    })
  );

  return (
    <RadarProspectsClient
      interesting={interesting}
      lists={lists}
      listMembers={Object.fromEntries(listMembersEntries)}
      people={people}
      hubspotConfigured={isHubSpotConfigured()}
    />
  );
}
