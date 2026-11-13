import { redirectSubcontractorToAccessDenied } from "@/lib/accessGuards";
import { getCurrentAppUser } from "@/lib/appUsers";
import { emptyTravelExpenseForm } from "@/lib/travelExpenseTypes";
import { TravelExpenseFormClient } from "../TravelExpenseFormClient";

export const dynamic = "force-dynamic";

export default async function NewTravelExpensePage() {
  await redirectSubcontractorToAccessDenied();
  const user = await getCurrentAppUser();
  const initialForm = emptyTravelExpenseForm(user?.name ?? "");

  return (
    <TravelExpenseFormClient mode="create" initialForm={initialForm} />
  );
}
