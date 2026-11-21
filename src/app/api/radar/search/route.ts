import { NextResponse } from "next/server";
import {
  countScbDirectoryRows,
  searchRadarDirectory,
} from "@/lib/radar/scb/directorySearch";
import { requireRadarActor } from "@/lib/radarActor";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireRadarActor();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    const directoryCount = await countScbDirectoryRows();
    return NextResponse.json({ hits: [], directoryCount, query: q });
  }
  const [hits, directoryCount] = await Promise.all([
    searchRadarDirectory(q, { limit: 30 }),
    countScbDirectoryRows(),
  ]);
  return NextResponse.json({ hits, directoryCount, query: q });
}
