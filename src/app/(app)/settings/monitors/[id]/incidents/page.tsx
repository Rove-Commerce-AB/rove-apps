import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button, PageHeader, Panel } from "@/components/ui";
import { getCurrentAppUser } from "@/lib/appUsers";
import { getMonitorIncidentPage, type IncidentPage } from "@/lib/monitorIncidents";
import { parseIncidentPage } from "@/lib/monitorIncidentFilters";
import { monitorIncidentsHref, ROUTES } from "@/lib/routes";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[]; to?: string | string[]; page?: string | string[] }>;
};

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function pageHref(data: IncidentPage, page: number): string {
  const search = new URLSearchParams();
  if (data.filters.from) search.set("from", data.filters.from);
  if (data.filters.to) search.set("to", data.filters.to);
  search.set("page", String(page));
  return `${monitorIncidentsHref(data.monitor.id)}?${search}`;
}

export default async function MonitorIncidentsPage({ params, searchParams }: Props) {
  const user = await getCurrentAppUser();
  if (!user || user.role !== "admin") redirect("/access-denied");

  const [{ id }, query] = await Promise.all([params, searchParams]);
  let data: IncidentPage | null = null;
  let loadError: string | null = null;
  try {
    data = await getMonitorIncidentPage(
      id,
      { from: single(query.from), to: single(query.to) },
      parseIncidentPage(single(query.page))
    );
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Failed to load incidents";
  }

  if (!data && !loadError) notFound();
  if (loadError || !data) {
    return (
      <div className="max-w-6xl space-y-5">
        <PageHeader title="Incidents" />
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{loadError}</p>
        <Link href={monitorIncidentsHref(id)} className="text-sm text-brand-signal hover:underline">Clear filters</Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div><Link href={ROUTES.monitors} className="text-sm text-text-secondary hover:underline">← Monitors</Link></div>
      <PageHeader title={`${data.monitor.name} incidents`} description={`${data.monitor.customerName} · ${data.monitor.url}`} />
      <form action={monitorIncidentsHref(data.monitor.id)} method="get" className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="incident-from" className="mb-1 block text-sm font-medium text-text-primary">From</label>
          <input id="incident-from" name="from" type="date" defaultValue={data.filters.from ?? ""} max={data.filters.to} className="h-10 rounded-lg border border-form bg-bg-default px-3 text-sm text-text-primary" />
        </div>
        <div>
          <label htmlFor="incident-to" className="mb-1 block text-sm font-medium text-text-primary">To</label>
          <input id="incident-to" name="to" type="date" defaultValue={data.filters.to ?? ""} min={data.filters.from} className="h-10 rounded-lg border border-form bg-bg-default px-3 text-sm text-text-primary" />
        </div>
        <Button type="submit">Filter</Button>
        {(data.filters.from || data.filters.to) && <Link href={monitorIncidentsHref(data.monitor.id)} className="inline-flex h-10 items-center px-2 text-sm text-text-secondary hover:underline">Clear</Link>}
      </form>
      <p className="text-xs text-text-tertiary">Filter by incident start date. Dates and times use Europe/Stockholm.</p>
      <Panel>
        {data.incidents.length === 0 ? (
          <p className="p-6 text-sm text-text-secondary">No incidents found for this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border-subtle text-xs text-text-secondary">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Started</th>
                  <th scope="col" className="px-4 py-3 font-medium">Confirmed</th>
                  <th scope="col" className="px-4 py-3 font-medium">Last failure</th>
                  <th scope="col" className="px-4 py-3 font-medium">Recovered</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Failures</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {data.incidents.map((incident) => (
                  <tr key={incident.id}>
                    <td className="whitespace-nowrap px-4 py-3"><span className={incident.recoveredAt ? "text-text-secondary" : "font-medium text-danger"}>{incident.recoveredAt ? "Recovered" : "Open"}</span></td>
                    <td className="whitespace-nowrap px-4 py-3">{formatTime(incident.startedAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatTime(incident.confirmedAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatTime(incident.lastFailureAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{incident.recoveredAt ? formatTime(incident.recoveredAt) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{incident.failureCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <div className="flex items-center justify-between text-sm text-text-secondary">
        <span>{data.total} {data.total === 1 ? "incident" : "incidents"} · Page {data.page} of {data.pageCount}</span>
        <div className="flex gap-3">
          {data.page > 1 && <Link href={pageHref(data, data.page - 1)} className="hover:underline">Previous</Link>}
          {data.page < data.pageCount && <Link href={pageHref(data, data.page + 1)} className="hover:underline">Next</Link>}
        </div>
      </div>
    </div>
  );
}
