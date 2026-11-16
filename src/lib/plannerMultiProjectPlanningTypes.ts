import type { AllocationPageData } from "@/lib/allocationPageTypes";
import type { BillingCurrency } from "@/lib/currency";

export type PlannerProjectPlanningPanel = {
  projectId: string;
  projectName: string;
  customerId: string;
  budgetHours: number | null;
  budgetMoney: number | null;
  billingCurrency: BillingCurrency;
  allocationData: AllocationPageData;
  rates?: Record<string, number>;
};
