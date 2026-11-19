import { NextResponse } from "next/server";
import { exportProspectListCsv } from "@/lib/radar/prospects";
import { requireRadarActor } from "@/lib/radarActor";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  await requireRadarActor();
  const { id } = await params;
  const csv = await exportProspectListCsv(id);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="radar-prospects-${id}.csv"`,
    },
  });
}
