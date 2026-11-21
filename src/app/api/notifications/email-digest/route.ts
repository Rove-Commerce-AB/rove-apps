import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { flushNotificationEmailDigest } from "@/lib/notificationEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function requireDigestSecret(request: NextRequest): NextResponse | null {
  const expected =
    process.env.NOTIFICATION_EMAIL_DIGEST_SECRET?.trim() ||
    process.env.SUPPORT_MAIL_SYNC_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      {
        error:
          "NOTIFICATION_EMAIL_DIGEST_SECRET (or SUPPORT_MAIL_SYNC_SECRET) must be set.",
      },
      { status: 503 }
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice("bearer ".length).trim()
    : null;
  const headerToken = request.headers.get("x-notification-digest-token")?.trim();

  if (
    (bearer != null && secretsEqual(bearer, expected)) ||
    (headerToken != null && secretsEqual(headerToken, expected))
  ) {
    return null;
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Cloud Scheduler entrypoint (~every 15 minutes).
 * POST /api/notifications/email-digest
 */
export async function POST(request: NextRequest) {
  const unauthorized = requireDigestSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await flushNotificationEmailDigest();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[notifications/email-digest] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Digest failed",
      },
      { status: 500 }
    );
  }
}
