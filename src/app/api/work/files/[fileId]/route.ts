import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { requireVisibleWorkBoard } from "@/lib/workBoards";
import { buildContentDisposition } from "@/lib/workFileHttp";
import { resolveWorkFileReadStream } from "@/lib/workFilesPersist";
import { fetchWorkIssueFileForDownload } from "@/lib/workIssuesQueries";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await context.params;
  const file = await fetchWorkIssueFileForDownload(fileId);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const visible = await requireVisibleWorkBoard(file.project_id);
    if (!visible) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const mime = file.mime_type.toLowerCase();
  const name = file.file_name.toLowerCase();
  const looksVideo =
    mime.startsWith("video/") ||
    /\.(mp4|webm|mov|m4v|mkv)$/i.test(name);
  const inline = mime.startsWith("image/") || looksVideo;
  const contentType =
    looksVideo && !mime.startsWith("video/")
      ? name.endsWith(".webm")
        ? "video/webm"
        : name.endsWith(".mov")
          ? "video/quicktime"
          : "video/mp4"
      : file.mime_type;

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Disposition": buildContentDisposition(
      inline ? "inline" : "attachment",
      file.file_name
    ),
    // Images (incl. video posters) may remount after refresh; allow a short
    // private cache so thumbs don't flash blank while re-fetching.
    "Cache-Control": mime.startsWith("image/")
      ? "private, max-age=300"
      : "private, no-store",
  };
  if (file.byte_size > 0) {
    headers["Content-Length"] = String(file.byte_size);
  }

  try {
    const body = resolveWorkFileReadStream(file);
    if (body.kind === "buffer") {
      return new NextResponse(new Uint8Array(body.buffer), { headers });
    }
    return new NextResponse(Readable.toWeb(body.stream) as ReadableStream, {
      headers,
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
