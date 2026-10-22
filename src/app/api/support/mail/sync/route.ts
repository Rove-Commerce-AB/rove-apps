import { NextResponse, type NextRequest } from "next/server";
import { syncSupportMail } from "@/lib/supportMailSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Gmail + case create can take a while on a full inbox pass. */
export const maxDuration = 120;

function requireSyncSecret(request: NextRequest): NextResponse | null {
  const expected = process.env.SUPPORT_MAIL_SYNC_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      {
        error:
          "SUPPORT_MAIL_SYNC_SECRET must be set to call the mail sync endpoint.",
      },
      { status: 503 }
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice("bearer ".length).trim()
    : null;
  const headerToken = request.headers.get("x-support-mail-token")?.trim();

  if (bearer === expected || headerToken === expected) {
    return null;
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function parseMaxResults(request: NextRequest): number {
  const raw = request.nextUrl.searchParams.get("maxResults");
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 25;
  return Math.min(Math.floor(parsed), 100);
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const denied = requireSyncSecret(request);
  if (denied) return denied;

  const dryRun =
    request.nextUrl.searchParams.get("dryRun") === "1" ||
    request.nextUrl.searchParams.get("dryRun") === "true";

  try {
    const result = await syncSupportMail({
      dryRun,
      maxResults: parseMaxResults(request),
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Support mail sync failed";
    console.error("[api/support/mail/sync]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
