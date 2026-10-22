import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/appUsers";

const inputErrors = new Set([
  "Select a customer", "Name is required", "Name is too long", "Enter a valid URL",
  "Enter an HTTP or HTTPS URL without embedded credentials", "Interval must be 30–86400 seconds",
  "Retry delay must be a positive number of seconds", "Timeout must be positive",
  "Expected HTTP status range must be within 100–599", "Invalid enabled value",
  "Invalid Slack channel selection", "Secret reference is too long", "Invalid monitor ID",
  "Invalid monitor update", "Customer no longer exists", "Monitor no longer exists",
  "A selected Slack channel no longer exists",
]);

export async function requireMonitorAdmin() {
  const user = await getCurrentAppUser();
  return user?.role === "admin" ? null : NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

export async function monitorJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new Error("Expected JSON request");
  }
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new Error("Invalid JSON request");
  }
}

export function monitorApiError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "Expected JSON request" || message === "Invalid JSON request" || inputErrors.has(message)) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ error: "Could not save monitor. Try again." }, { status: 500 });
}
