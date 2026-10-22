import { NextResponse } from "next/server";
import { createMonitor, type MonitorInput } from "@/lib/monitors";
import { monitorApiError, monitorJson, requireMonitorAdmin } from "./_shared";

export async function POST(request: Request) {
  const denied = await requireMonitorAdmin();
  if (denied) return denied;
  try {
    const input = await monitorJson(request);
    await createMonitor(input as MonitorInput);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return monitorApiError(error);
  }
}
