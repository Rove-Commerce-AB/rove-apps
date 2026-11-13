import { notFound } from "next/navigation";
import { redirectSubcontractorToAccessDenied } from "@/lib/accessGuards";
import { getMyTravelExpense } from "../actions";
import { TravelExpenseFormClient } from "../TravelExpenseFormClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditTravelExpensePage({ params }: Props) {
  await redirectSubcontractorToAccessDenied();
  const { id } = await params;
  const record = await getMyTravelExpense(id);
  if (!record) notFound();

  return (
    <TravelExpenseFormClient
      mode="edit"
      expenseId={record.id}
      initialForm={record.formData}
    />
  );
}
