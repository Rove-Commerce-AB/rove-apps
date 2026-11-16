"use client";

import { useCallback } from "react";
import Link from "next/link";
import {
  Button,
  DetailPageHeader,
} from "@/components/ui";
import { CustomerFavicon } from "@/components/CustomerFavicon";
import { PlannerMultiProjectPlanning } from "@/components/PlannerMultiProjectPlanning";
import { getCustomerProjectPlanningData } from "@/app/(app)/allocation/actions";
import { DEFAULT_CUSTOMER_COLOR } from "@/lib/constants";
import type { PlannerProjectPlanningPanel } from "@/lib/plannerMultiProjectPlanningTypes";
import { ROUTES, customerSettingsHref } from "@/lib/routes";

type Props = {
  customer: {
    id: string;
    name: string;
    color: string | null;
    url: string | null;
    isActive: boolean;
  };
  panels: PlannerProjectPlanningPanel[];
  allocationError: string | null;
  year: number;
  weekFrom: number;
  weekTo: number;
  currentYear: number;
  currentWeek: number;
};

export function PlannerCustomerPlanningClient({
  customer,
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
      const result = await getCustomerProjectPlanningData(
        customer.id,
        y,
        from,
        to
      );
      return { panels: result.panels, error: result.error };
    },
    [customer.id]
  );

  return (
    <PlannerMultiProjectPlanning
      header={
        <DetailPageHeader
          backHref={ROUTES.plannerPlanCustomer}
          backLabel="Back to customers"
          avatar={
            <CustomerFavicon
              name={customer.name}
              url={customer.url}
              color={customer.color ?? DEFAULT_CUSTOMER_COLOR}
              size="sm"
            />
          }
          title={customer.name}
          subtitle={customer.isActive ? "Active" : "Inactive"}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href={customerSettingsHref(customer.id)}>
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
      emptyMessage="No active projects for this customer."
      onFetchPanels={onFetchPanels}
    />
  );
}
