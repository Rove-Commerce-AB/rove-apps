import { NextResponse } from "next/server";
import { listRadarJobConfigs, listRadarJobRuns } from "@/lib/radar/jobs";
import { requireRadarActor } from "@/lib/radarActor";

export const dynamic = "force-dynamic";

/** Lightweight poll endpoint for Jobs UI progress. */
export async function GET() {
  await requireRadarActor();
  const [configs, runs] = await Promise.all([
    listRadarJobConfigs(),
    listRadarJobRuns(40),
  ]);
  return NextResponse.json({ configs, runs });
}
