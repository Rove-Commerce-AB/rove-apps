import { PageLoading } from "@/components/ui";

export default function SupportOverviewLoading() {
  return (
    <>
      <PageLoading />
      <div className="space-y-6">
        <div className="h-8 w-40 animate-pulse rounded bg-bg-muted" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-panel bg-bg-muted"
            />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-48 animate-pulse rounded-panel bg-bg-muted" />
          <div className="h-48 animate-pulse rounded-panel bg-bg-muted" />
        </div>
      </div>
    </>
  );
}
