import { NextResponse } from "next/server";
import { runRadarWorkerTick } from "@/lib/radar/workerTick";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function requestHasRadarWorkerKey(request: Request): boolean {
  const expected = process.env.RADAR_WORKER_API_KEY?.trim();
  if (!expected) return false;
  const header =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-api-key") ??
    "";
  return header === expected;
}

/**
 * Cloud Run Job / Cloud Scheduler entrypoint.
 * Authenticate with RADAR_WORKER_API_KEY (Bearer or x-api-key).
 */
export async function POST(request: Request) {
  if (!process.env.RADAR_WORKER_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "Radar worker endpoint is not configured." },
      { status: 503 }
    );
  }
  if (!requestHasRadarWorkerKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let enqueueScheduled = true;
  try {
    const body = (await request.json()) as { enqueueScheduled?: boolean };
    if (typeof body.enqueueScheduled === "boolean") {
      enqueueScheduled = body.enqueueScheduled;
    }
  } catch {
    // empty body is fine
  }

  const result = await runRadarWorkerTick({ enqueueScheduled });
  return NextResponse.json(result);
}
