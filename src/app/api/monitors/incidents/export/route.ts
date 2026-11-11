import { NextResponse } from "next/server";
import { getMonitorsIncidentExport } from "@/lib/monitorIncidents";
import { buildMonitorsIncidentWorkbook } from "@/lib/monitorIncidentWorkbook";

export const dynamic = "force-dynamic";

const dateErrors = new Set([
  "Use a valid date in YYYY-MM-DD format",
  "Use a valid calendar date",
  "From date must be on or before to date",
  "Dates cannot be in the future",
  "Invalid customer",
]);

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  try {
    const data = await getMonitorsIncidentExport(
      {
        from: search.get("from") ?? undefined,
        to: search.get("to") ?? undefined,
      },
      { customerId: search.get("customerId") }
    );

    const workbook = await buildMonitorsIncidentWorkbook(data);
    const body = new Uint8Array(workbook.length);
    body.set(workbook);
    const scope = data.customerId ? data.customerId.slice(0, 8) : "all";
    const filename = `monitors-incidents-${scope}-${data.filters.from}-${data.filters.to}.xlsx`;
    return new NextResponse(body, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (dateErrors.has(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("[api/monitors/incidents/export]", error);
    return NextResponse.json(
      { error: "Could not export incidents" },
      { status: 500 }
    );
  }
}
