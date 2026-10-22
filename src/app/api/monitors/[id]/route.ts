import { NextResponse } from "next/server";
import { deleteMonitor, setMonitorEnabled, updateMonitor, type MonitorInput } from "@/lib/monitors";
import { monitorApiError, monitorJson, requireMonitorAdmin } from "../_shared";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const denied = await requireMonitorAdmin();
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const input = await monitorJson(request);
    await updateMonitor(id, input as MonitorInput);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return monitorApiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  const denied = await requireMonitorAdmin();
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const input = await monitorJson(request) as { enabled?: unknown };
    await setMonitorEnabled(id, input.enabled as boolean);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return monitorApiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const denied = await requireMonitorAdmin();
  if (denied) return denied;
  try {
    const { id } = await context.params;
    await deleteMonitor(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return monitorApiError(error);
  }
}
