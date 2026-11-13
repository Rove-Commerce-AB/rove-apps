import { redirectSubcontractorToAccessDenied } from "@/lib/accessGuards";
import { listMyTravelExpenses } from "./actions";
import { TravelExpenseListClient } from "./TravelExpenseListClient";

export const dynamic = "force-dynamic";

export default async function TravelExpenseListPage() {
  await redirectSubcontractorToAccessDenied();
  const items = await listMyTravelExpenses();
  return <TravelExpenseListClient items={items} />;
}
