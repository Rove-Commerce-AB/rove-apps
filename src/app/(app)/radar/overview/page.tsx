import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui";
import { listRadarAudiences } from "@/lib/radar/audiences";
import { listRadarCompanies } from "@/lib/radar/companies";
import { listRadarJobConfigs, listRadarJobRuns } from "@/lib/radar/jobs";
import { listRadarProspectLists } from "@/lib/radar/prospects";
import { requireRadarActor } from "@/lib/radarActor";
import { ROUTES } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function RadarOverviewPage() {
  await requireRadarActor();
  const [audiences, companies, lists, configs, runs] = await Promise.all([
    listRadarAudiences(),
    listRadarCompanies({}),
    listRadarProspectLists(),
    listRadarJobConfigs(),
    listRadarJobRuns(5),
  ]);

  const activeAudiences = audiences.filter((a) => a.status === "active").length;
  const interesting = companies.filter(
    (c) => c.prospect_status === "interesting"
  ).length;
  const withTech = companies.filter((c) => c.technologies.length > 0).length;
  const demoCount = companies.filter((c) => c.is_demo).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Radar"
        description="Market and sales intelligence for Rove. Define target groups, enrich companies, identify platforms, and save prospects."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Companies" value={companies.length} href={ROUTES.radarCompanies} />
        <StatCard label="Active target groups" value={activeAudiences} href={ROUTES.radarAudiences} />
        <StatCard label="Interesting prospects" value={interesting} href={ROUTES.radarProspects} />
        <StatCard label="With technology" value={withTech} href={ROUTES.radarCompanies} />
      </div>

      {demoCount > 0 ? (
        <p className="text-sm text-text-secondary">
          {demoCount} companies are marked as <span className="text-text-primary">demo</span>.
          Real Bolagsverket rows keep financials empty until a licensed source is connected.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="flex flex-col gap-3 p-4">
            <h2 className="text-heading-m text-text-primary">Quick links</h2>
            <ul className="flex flex-col gap-2 text-sm">
              <li>
                <Link className="text-text-link" href={ROUTES.radarAudiences}>
                  Manage target groups
                </Link>
              </li>
              <li>
                <Link className="text-text-link" href={ROUTES.radarCompanies}>
                  Explore companies
                </Link>
              </li>
              <li>
                <Link className="text-text-link" href={ROUTES.radarVerticals}>
                  Compare verticals
                </Link>
              </li>
              <li>
                <Link className="text-text-link" href={ROUTES.radarJobs}>
                  Run import and enrichment jobs
                </Link>
              </li>
            </ul>
            <p className="text-sm text-text-secondary">
              {lists.length} prospect list{lists.length === 1 ? "" : "s"} ready for export.
            </p>
          </div>
        </Panel>

        <Panel>
          <div className="flex flex-col gap-3 p-4">
            <h2 className="text-heading-m text-text-primary">Jobs</h2>
            <ul className="flex flex-col gap-2 text-sm text-text-secondary">
              {configs.map((c) => (
                <li key={c.job_type}>
                  <span className="text-text-primary">{c.job_type}</span>
                  {" · "}
                  {c.paused ? "paused" : "ready"}
                  {" · "}
                  schedule {c.schedule_enabled ? "on" : "off"}
                </li>
              ))}
            </ul>
            {runs[0] ? (
              <p className="text-sm text-text-secondary">
                Latest run: {runs[0].job_type} · {runs[0].status}
                {runs[0].message ? ` · ${runs[0].message}` : ""}
              </p>
            ) : (
              <p className="text-sm text-text-secondary">No runs yet.</p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link href={href}>
      <Panel>
        <div className="p-4">
          <p className="text-sm text-text-secondary">{label}</p>
          <p className="mt-1 text-heading-xl text-text-primary">{value}</p>
        </div>
      </Panel>
    </Link>
  );
}
