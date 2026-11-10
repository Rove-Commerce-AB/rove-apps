import { PageLoading } from "@/components/ui";

export default function InsightsOverviewLoading() {
  return (
    <>
      <PageLoading />
      <div className="flex h-full min-h-0 max-w-3xl flex-col">
        <div className="mb-4 h-8 w-40 animate-pulse rounded bg-bg-muted" />
        <div className="min-h-[16rem] flex-1 animate-pulse rounded-md bg-bg-muted" />
      </div>
    </>
  );
}
