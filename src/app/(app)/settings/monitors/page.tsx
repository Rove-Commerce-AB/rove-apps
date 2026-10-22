import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export const dynamic = "force-dynamic";

/** Monitors moved to Rove Support. */
export default function SettingsMonitorsRedirectPage() {
  redirect(ROUTES.supportOverview);
}
