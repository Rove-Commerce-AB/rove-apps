import "server-only";

import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/appUsers";
import { canSeeRadarApp, type RadarActor } from "@/lib/radarAccess";

export async function requireRadarActor(): Promise<RadarActor> {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  const actor: RadarActor = {
    id: user.id,
    role: user.role,
    appKeys: user.appKeys,
  };
  if (!canSeeRadarApp(actor)) redirect("/access-denied");
  return actor;
}
