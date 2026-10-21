import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/appUsers";
import { getMonitorCustomers, getMonitors } from "@/lib/monitors";
import { MonitorsPageClient } from "@/components/MonitorsPageClient";

export const dynamic = "force-dynamic";

export default async function MonitorsPage() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== "admin") redirect("/access-denied");

  let monitors: Awaited<ReturnType<typeof getMonitors>> = [];
  let customers: Awaited<ReturnType<typeof getMonitorCustomers>> = [];
  let loadError: string | undefined;
  try {
    [monitors, customers] = await Promise.all([getMonitors(), getMonitorCustomers()]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Failed to load monitors";
  }
  return <MonitorsPageClient monitors={monitors} customers={customers} loadError={loadError} />;
}
