import { redirect } from "next/navigation";
import { getRoles } from "@/lib/roles";
import { getTeams } from "@/lib/teams";
import { getCalendarsWithHolidayCount } from "@/lib/calendars";
import { getTimeActivities } from "@/lib/timeActivitiesClient";
import { getCurrentAppUser } from "@/lib/appUsers";
import { SettingsPageClient } from "@/components/SettingsPageClient";
import { redirectSubcontractorToAccessDenied } from "@/lib/accessGuards";

export default async function SettingsPage() {
  await redirectSubcontractorToAccessDenied();

  const user = await getCurrentAppUser();
  if (!user || user.role !== "admin") {
    redirect("/access-denied");
  }

  let roles: Awaited<ReturnType<typeof getRoles>> = [];
  let teams: Awaited<ReturnType<typeof getTeams>> = [];
  let calendars: Awaited<ReturnType<typeof getCalendarsWithHolidayCount>> = [];
  let activities: Awaited<ReturnType<typeof getTimeActivities>> = [];
  let error: string | null = null;

  try {
    [roles, teams, calendars, activities] = await Promise.all([
      getRoles(),
      getTeams(),
      getCalendarsWithHolidayCount(),
      getTimeActivities().catch((e) => {
        const code =
          typeof e === "object" && e && "code" in e
            ? String((e as { code?: unknown }).code ?? "")
            : "";
        if (code === "42P01") return [];
        throw e;
      }),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load settings";
  }

  return (
    <div>
      <div className="w-full max-w-3xl">
        <SettingsPageClient
          roles={roles}
          teams={teams}
          calendars={calendars}
          activities={activities}
          error={error}
        />
      </div>
    </div>
  );
}
