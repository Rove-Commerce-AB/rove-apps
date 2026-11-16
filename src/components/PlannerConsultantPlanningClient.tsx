"use client";

import { useCallback } from "react";
import Link from "next/link";
import {
  Button,
  DetailPageHeader,
  InitialsAvatar,
} from "@/components/ui";
import { PlannerMultiProjectPlanning } from "@/components/PlannerMultiProjectPlanning";
import { getConsultantProjectPlanningData } from "@/app/(app)/allocation/actions";
import type { PlannerProjectPlanningPanel } from "@/lib/plannerMultiProjectPlanningTypes";
import { ROUTES, consultantSettingsHref } from "@/lib/routes";

type Props = {
  consultant: {
    id: string;
    name: string;
    appUserId: string | null;
  };
  panels: PlannerProjectPlanningPanel[];
  allocationError: string | null;
  year: number;
  weekFrom: number;
  weekTo: number;
  currentYear: number;
  currentWeek: number;
};

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function PlannerConsultantPlanningClient({
  consultant,
  panels,
  allocationError,
  year,
  weekFrom,
  weekTo,
  currentYear,
  currentWeek,
}: Props) {
  const onFetchPanels = useCallback(
    async (y: number, from: number, to: number) => {
      const result = await getConsultantProjectPlanningData(
        consultant.id,
        y,
        from,
        to
      );
      return { panels: result.panels, error: result.error };
    },
    [consultant.id]
  );

  return (
    <PlannerMultiProjectPlanning
      header={
        <DetailPageHeader
          backHref={ROUTES.plannerPlanConsultant}
          backLabel="Back to consultants"
          avatar={
            <InitialsAvatar
              name={consultant.name}
              initials={initialsFromName(consultant.name)}
              size="lg"
            />
          }
          title={consultant.name}
          subtitle="Consultant planning"
          action={
            <Button asChild variant="secondary" size="sm">
              <Link
                href={consultantSettingsHref(
                  consultant.id,
                  consultant.appUserId
                )}
              >
                Edit in Settings
              </Link>
            </Button>
          }
        />
      }
      initialPanels={panels}
      initialError={allocationError}
      year={year}
      weekFrom={weekFrom}
      weekTo={weekTo}
      currentYear={currentYear}
      currentWeek={currentWeek}
      emptyMessage="No projects with bookings for this consultant in the selected weeks."
      onFetchPanels={onFetchPanels}
    />
  );
}
