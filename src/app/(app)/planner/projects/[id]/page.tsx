import { notFound } from "next/navigation";
import { getCurrentYearWeek } from "@/lib/dateUtils";
import { getProjectWithDetailsById } from "@/lib/projects";
import { getAllocationPageDataForProject } from "@/lib/allocationPage";
import { getProjectRates } from "@/lib/projectRates";
import { getCustomerRates } from "@/lib/customerRates";
import { ProjectDetailClient } from "@/components/ProjectDetailClient";
import { redirectSubcontractorToAccessDenied } from "@/lib/accessGuards";
import { getCurrentAppUser } from "@/lib/appUsers";
import { debugLog, timedDebug } from "@/lib/debugLogs";
import { encodeBillingItemKey } from "@/lib/billingItem";

const PLANNING_WEEKS = 30;
/** Weeks to show to the left of current week (default view: past, then current, then future). */
const WEEKS_BACK_FROM_CURRENT = 2;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; from?: string; to?: string }>;
};

export default async function PlannerProjectPage({ params, searchParams }: Props) {
  const pageStart = Date.now();
  await redirectSubcontractorToAccessDenied();

  const { id } = await params;
  const project = await getProjectWithDetailsById(id);

  if (!project) notFound();

  const { year: currentYear, week: currentWeek } = getCurrentYearWeek();
  const query = await searchParams;
  const year = query.year ? parseInt(query.year, 10) : currentYear;
  const fromParam = query.from ? parseInt(query.from, 10) : null;
  const toParam = query.to ? parseInt(query.to, 10) : null;
  const weekFrom =
    fromParam ?? Math.max(1, currentWeek - WEEKS_BACK_FROM_CURRENT);
  const weekTo =
    toParam ?? Math.min(52, weekFrom + PLANNING_WEEKS - 1);

  let allocationData = null;
  let allocationError: string | null = null;
  try {
    allocationData = await timedDebug(
      "projects-page",
      "load allocation data",
      () =>
        getAllocationPageDataForProject(
          project.id,
          project.customer_id,
          year,
          weekFrom,
          weekTo
        ),
      { projectId: project.id, year, weekFrom, weekTo }
    );
  } catch (e) {
    allocationError =
      e instanceof Error ? e.message : "Could not load planning data";
    debugLog(
      "projects-page",
      "allocation load failed",
      { projectId: project.id, allocationError },
      "error"
    );
  }

  const [projectRates, customerRates, appUser] = await timedDebug(
    "projects-page",
    "load rates and user",
    () =>
      Promise.all([
        getProjectRates(project.id),
        project.customer_id ? getCustomerRates(project.customer_id) : Promise.resolve([]),
        getCurrentAppUser(),
      ]),
    { projectId: project.id }
  );
  const isAdmin = appUser?.role === "admin";
  const allocationRates: Record<string, number> = {};
  for (const r of customerRates) {
    const key = r.role_id
      ? r.role_id
      : encodeBillingItemKey({ kind: "customer_rate", id: r.id });
    allocationRates[key] = r.rate_per_hour;
  }
  for (const r of projectRates) {
    const key = r.role_id
      ? r.role_id
      : encodeBillingItemKey({ kind: "project_rate", id: r.id });
    allocationRates[key] = r.rate_per_hour;
  }
  debugLog("projects-page", "page rendered", {
    projectId: project.id,
    allocationLoaded: Boolean(allocationData),
    allocationError,
    durationMs: Date.now() - pageStart,
  });

  return (
    <div>
      <ProjectDetailClient
        project={project}
        allocationData={allocationData}
        allocationError={allocationError}
        allocationYear={year}
        allocationWeekFrom={weekFrom}
        allocationWeekTo={weekTo}
        currentYear={currentYear}
        currentWeek={currentWeek}
        allocationRates={Object.keys(allocationRates).length > 0 ? allocationRates : undefined}
        isAdmin={isAdmin}
      />
    </div>
  );
}
