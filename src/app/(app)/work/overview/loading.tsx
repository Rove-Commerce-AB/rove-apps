import { PageLoading } from "@/components/ui";

export default function WorkOverviewLoading() {
  return (
    <>
      <PageLoading />
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded bg-bg-muted" />
        <div className="mt-6 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-md bg-bg-muted"
            />
          ))}
        </div>
      </div>
    </>
  );
}
