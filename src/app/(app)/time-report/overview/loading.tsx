import { PageLoading } from "@/components/ui";

export default function TimeReportOverviewLoading() {
  return (
    <>
      <PageLoading />
      <div className="max-w-5xl">
        <div className="mb-6 h-10 w-48 animate-pulse rounded bg-bg-muted" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-panel bg-bg-muted"
            />
          ))}
        </div>
      </div>
    </>
  );
}
