import { PageHeader, Panel } from "@/components/ui";
import { requireRadarActor } from "@/lib/radarActor";
import {
  listRadarVerticalsByBusinessModel,
  listRadarVerticalsBySni,
} from "@/lib/radar/verticals";
import type { RadarVerticalRow } from "@/lib/radar/types";

export const dynamic = "force-dynamic";

export default async function RadarVerticalsPage() {
  await requireRadarActor();
  const [bySni, byModel] = await Promise.all([
    listRadarVerticalsBySni(),
    listRadarVerticalsByBusinessModel(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Verticals"
        description="First cut of market verticals by SNI and business model. Use this to decide where Rove should go deeper."
      />
      <VerticalTable title="By SNI (2-digit)" rows={bySni} />
      <VerticalTable title="By business model" rows={byModel} />
    </div>
  );
}

function VerticalTable({
  title,
  rows,
}: {
  title: string;
  rows: RadarVerticalRow[];
}) {
  return (
    <Panel>
      <div className="overflow-x-auto p-0">
        <div className="border-b border-border-subtle px-4 py-3 text-heading-m text-text-primary">
          {title}
        </div>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-table-header text-text-secondary">
            <tr>
              <th className="px-4 py-2 font-medium">Vertical</th>
              <th className="px-4 py-2 font-medium">Companies</th>
              <th className="px-4 py-2 font-medium">Avg employees</th>
              <th className="px-4 py-2 font-medium">Priority tech hits</th>
              <th className="px-4 py-2 font-medium">Top platforms</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border-subtle">
                <td className="px-4 py-3 text-text-primary">{r.label}</td>
                <td className="px-4 py-3 text-text-primary">{r.company_count}</td>
                <td className="px-4 py-3 text-text-secondary">
                  {r.avg_employees ?? "—"}
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {r.with_priority_tech}
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {r.tech_breakdown.length > 0
                    ? r.tech_breakdown
                        .slice(0, 4)
                        .map((t) => `${t.name} (${t.count})`)
                        .join(", ")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
