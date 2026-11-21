import { NextResponse } from "next/server";
import { runRadarWorkerTick } from "@/lib/radar/workerTick";
import { requireRadarActor } from "@/lib/radarActor";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

/**
 * Manual worker kick from the Radar Jobs UI (session auth).
 * Kept as a Route Handler so long runs do not block App Router refreshes / polling.
 */
export async function POST() {
  await requireRadarActor();
  const result = await runRadarWorkerTick({ enqueueScheduled: false });
  return NextResponse.json(result);
}
