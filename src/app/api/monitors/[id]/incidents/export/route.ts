import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/appUsers";
import { getMonitorIncidentPage } from "@/lib/monitorIncidents";
import { buildMonitorIncidentWorkbook } from "@/lib/monitorIncidentWorkbook";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentAppUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await context.params;
  const search = new URL(request.url).searchParams;
  try {
    const data = await getMonitorIncidentPage(id, {
      from: search.get("from") ?? undefined,
      to: search.get("to") ?? undefined,
    }, 1, true);
    if (!data) return NextResponse.json({ error: "Monitor not found" }, { status: 404 });

    const workbook = await buildMonitorIncidentWorkbook(data);
    const body = new Uint8Array(workbook.length);
    body.set(workbook);
    const filename = `monitor-incidents-${id}-${data.filters.from}-${data.filters.to}.xlsx`;
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if ([
      "Use a valid date in YYYY-MM-DD format",
      "Use a valid calendar date",
      "From date must be on or before to date",
      "Dates cannot be in the future",
    ].includes(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not export incidents" }, { status: 500 });
  }
}
