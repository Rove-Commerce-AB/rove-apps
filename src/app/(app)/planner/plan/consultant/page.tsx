import { PlannerAllocationPage } from "../../PlannerAllocationPage";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ year?: string; from?: string; to?: string }>;
};

export default async function PlannerPlanConsultantPage({ searchParams }: Props) {
  return (
    <PlannerAllocationPage view="consultant" searchParams={searchParams} />
  );
}
