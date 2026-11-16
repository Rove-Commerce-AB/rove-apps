import { notFound } from "next/navigation";
import { getCurrentYearWeek } from "@/lib/dateUtils";
import { getCustomerById } from "@/lib/customers";
import { getCustomerProjectPlanningPanels } from "@/lib/plannerMultiProjectPlanning";
import { PlannerCustomerPlanningClient } from "@/components/PlannerCustomerPlanningClient";
import { redirectSubcontractorToAccessDenied } from "@/lib/accessGuards";

const PLANNING_WEEKS = 30;
const WEEKS_BACK_FROM_CURRENT = 2;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; from?: string; to?: string }>;
};

export default async function PlannerCustomerPage({
  params,
  searchParams,
}: Props) {
  await redirectSubcontractorToAccessDenied();

  const { id } = await params;
  const customer = await getCustomerById(id);
  if (!customer) notFound();

  const { year: currentYear, week: currentWeek } = getCurrentYearWeek();
  const query = await searchParams;
  const year = query.year ? parseInt(query.year, 10) : currentYear;
  const fromParam = query.from ? parseInt(query.from, 10) : null;
  const toParam = query.to ? parseInt(query.to, 10) : null;
  const weekFrom =
    fromParam ?? Math.max(1, currentWeek - WEEKS_BACK_FROM_CURRENT);
  const weekTo = toParam ?? Math.min(52, weekFrom + PLANNING_WEEKS - 1);

  let panels: Awaited<ReturnType<typeof getCustomerProjectPlanningPanels>> = [];
  let allocationError: string | null = null;
  try {
    panels = await getCustomerProjectPlanningPanels(
      customer.id,
      year,
      weekFrom,
      weekTo
    );
  } catch (e) {
    allocationError =
      e instanceof Error ? e.message : "Could not load planning data";
  }

  return (
    <PlannerCustomerPlanningClient
      customer={{
        id: customer.id,
        name: customer.name,
        color: customer.color,
        url: customer.url,
        isActive: customer.isActive,
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
