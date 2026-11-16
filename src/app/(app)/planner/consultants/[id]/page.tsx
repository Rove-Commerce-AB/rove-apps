import { notFound } from "next/navigation";
import { getCurrentYearWeek } from "@/lib/dateUtils";
import { getConsultantById } from "@/lib/consultants";
import { getConsultantProjectPlanningPanels } from "@/lib/plannerMultiProjectPlanning";
import { PlannerConsultantPlanningClient } from "@/components/PlannerConsultantPlanningClient";
import { redirectSubcontractorToAccessDenied } from "@/lib/accessGuards";

const PLANNING_WEEKS = 30;
const WEEKS_BACK_FROM_CURRENT = 2;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; from?: string; to?: string }>;
};

export default async function PlannerConsultantEntityPage({
  params,
  searchParams,
}: Props) {
  await redirectSubcontractorToAccessDenied();

  const { id } = await params;
  const consultant = await getConsultantById(id);
  if (!consultant) notFound();

  const { year: currentYear, week: currentWeek } = getCurrentYearWeek();
  const query = await searchParams;
  const year = query.year ? parseInt(query.year, 10) : currentYear;
  const fromParam = query.from ? parseInt(query.from, 10) : null;
  const toParam = query.to ? parseInt(query.to, 10) : null;
  const weekFrom =
    fromParam ?? Math.max(1, currentWeek - WEEKS_BACK_FROM_CURRENT);
  const weekTo = toParam ?? Math.min(52, weekFrom + PLANNING_WEEKS - 1);

  let panels: Awaited<
    ReturnType<typeof getConsultantProjectPlanningPanels>
  > = [];
  let allocationError: string | null = null;
  try {
    panels = await getConsultantProjectPlanningPanels(
      consultant.id,
      year,
      weekFrom,
      weekTo
    );
  } catch (e) {
    allocationError =
      e instanceof Error ? e.message : "Could not load planning data";
  }

  return (
    <PlannerConsultantPlanningClient
      consultant={{
        id: consultant.id,
        name: consultant.name,
        appUserId: consultant.app_user_id ?? null,
      }}
      panels={panels}
      allocationError={allocationError}
      year={year}
      weekFrom={weekFrom}
      weekTo={weekTo}
      currentYear={currentYear}
      currentWeek={currentWeek}
    />
  );
}
