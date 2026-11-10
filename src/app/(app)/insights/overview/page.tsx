import { redirectSubcontractorToAccessDenied } from "@/lib/accessGuards";
import { DataAgentChat } from "@/components/DataAgentChat";

export const dynamic = "force-dynamic";

export default async function InsightsOverviewPage() {
  await redirectSubcontractorToAccessDenied();

  return (
    <div className="flex h-full min-h-0 max-w-3xl flex-col">
      <h1 className="mb-4 text-heading-xl text-text-primary">
        Ask the data
      </h1>
      <DataAgentChat />
    </div>
  );
}
