"use server";

import { cloudSqlPool, withCloudSqlTransaction } from "@/lib/cloudSqlPool";
import { getCurrentAppUser } from "@/lib/appUsers";
import { joinWorkInlineImages } from "@/lib/workInlineImages";
import { WORK_FILE_MAX_BYTES } from "@/lib/workTypes";

const FEATURE_REQUEST_BOARD_TITLE = "Rove Apps";
const STATUS_REQUEST = "Request";
const MAX_SCREENSHOTS = 8;

function titleFromContent(content: string): string {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim()) ?? content;
  const trimmed = firstLine.trim();
  if (trimmed.length <= 120) return trimmed;
  return `${trimmed.slice(0, 117)}...`;
}

function descriptionFromRequest(args: {
  content: string;
  requestedBy: string | null;
  declineComment?: string | null;
}): string {
  const lines = [
    `Requested by: ${args.requestedBy?.trim() || "unknown"}`,
    "",
    args.content.trim(),
  ];
  const decline = args.declineComment?.trim();
  if (decline) {
    lines.push("", `Decline reason: ${decline}`);
  }
  return lines.join("\n");
}

async function resolveFeatureRequestBoard(): Promise<{
  boardId: string;
  requestStatusId: string;
}> {
  const { rows: boards } = await cloudSqlPool.query<{ id: string }>(
    `SELECT id
     FROM work_projects
     WHERE title = $1 AND archived_at IS NULL
     ORDER BY created_at ASC
     LIMIT 2`,
    [FEATURE_REQUEST_BOARD_TITLE]
  );
  if (boards.length === 0) {
    throw new Error(`Work board “${FEATURE_REQUEST_BOARD_TITLE}” was not found`);
  }
  if (boards.length > 1) {
    throw new Error(
      `Multiple Work boards named “${FEATURE_REQUEST_BOARD_TITLE}” found`
    );
  }
  const boardId = boards[0]!.id;

  const { rows: statuses } = await cloudSqlPool.query<{ id: string }>(
    `SELECT id
     FROM work_project_statuses
     WHERE project_id = $1 AND name = $2
     LIMIT 1`,
    [boardId, STATUS_REQUEST]
  );
  const requestStatusId = statuses[0]?.id;
  if (!requestStatusId) {
    throw new Error(
      `Status “${STATUS_REQUEST}” is missing on board “${FEATURE_REQUEST_BOARD_TITLE}”`
    );
  }

  return { boardId, requestStatusId };
}

function collectScreenshotFiles(formData: FormData): File[] {
  const files = formData
    .getAll("screenshots")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length > MAX_SCREENSHOTS) {
    throw new Error(`You can attach at most ${MAX_SCREENSHOTS} screenshots`);
  }
  for (const file of files) {
    if (!file.type.toLowerCase().startsWith("image/")) {
      throw new Error("Screenshots must be images");
    }
    if (file.size > WORK_FILE_MAX_BYTES) {
      throw new Error("Each screenshot must be 8 MB or smaller");
    }
  }
  return files;
}

/**
 * Creates a Work issue on the “Rove Apps” board (column Request).
 * Any signed-in user may submit; board membership is not required.
 * Reporter = submitter. Owner is left empty.
 * Optional screenshots are stored as issue files and embedded in the description.
 */
export async function createFeatureRequest(
  formData: FormData
): Promise<void> {
  const trimmed = String(formData.get("content") ?? "").trim();
  if (!trimmed) throw new Error("Content is required");
  const type = formData.get("issueType") === "bug" ? "bug" : "issue";
  const screenshots = collectScreenshotFiles(formData);

  const user = await getCurrentAppUser();
  if (!user?.id) throw new Error("Unauthorized");

  const { boardId, requestStatusId } = await resolveFeatureRequestBoard();
  const title = titleFromContent(trimmed);
  const baseDescription = descriptionFromRequest({
    content: trimmed,
    requestedBy: user.email ?? null,
  });

  const screenshotBytes = await Promise.all(
    screenshots.map(async (file) => ({
      name: file.name.trim() || "screenshot.png",
      mimeType: file.type || "image/png",
      byteSize: file.size,
      content: Buffer.from(await file.arrayBuffer()),
    }))
  );

  await withCloudSqlTransaction("feature-request-create", async (client) => {
    await client.query("SELECT id FROM work_projects WHERE id = $1 FOR UPDATE", [
      boardId,
    ]);
    const { rows: numberRows } = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(number), 0) + 1 AS next
       FROM work_issues
       WHERE project_id = $1`,
      [boardId]
    );
    const { rows: orderRows } = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
       FROM work_issues
       WHERE project_id = $1 AND status = $2`,
      [boardId, requestStatusId]
    );
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO work_issues (
         project_id, number, title, status, sort_order,
         owner_app_user_id, created_by_app_user_id, description, issue_type
       ) VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8)
       RETURNING id`,
      [
        boardId,
        numberRows[0]?.next ?? 1,
        title,
        requestStatusId,
        orderRows[0]?.next ?? 0,
        user.id,
        baseDescription,
        type,
      ]
    );
    const issueId = rows[0]?.id;
    if (!issueId) throw new Error("Failed to create feature request");

    const fileIds: string[] = [];
    for (const file of screenshotBytes) {
      const { rows: fileRows } = await client.query<{ id: string }>(
        `INSERT INTO work_issue_files (
           issue_id, file_name, mime_type, byte_size, content, uploaded_by_app_user_id
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          issueId,
          file.name,
          file.mimeType,
          file.byteSize,
          file.content,
          user.id,
        ]
      );
      const fileId = fileRows[0]?.id;
      if (!fileId) throw new Error("Failed to attach screenshot");
      fileIds.push(fileId);
      await client.query(
        `INSERT INTO work_issue_events (issue_id, actor_app_user_id, kind, summary)
         VALUES ($1, $2, 'file', $3)`,
        [issueId, user.id, `uploaded ${file.name}`]
      );
    }

    if (fileIds.length > 0) {
      await client.query(
        `UPDATE work_issues SET description = $2 WHERE id = $1`,
        [issueId, joinWorkInlineImages(baseDescription, fileIds)]
      );
    }

    await client.query(
      `INSERT INTO work_issue_events (issue_id, actor_app_user_id, kind, summary)
       VALUES ($1, $2, 'created', $3)`,
      [
        issueId,
        user.id,
        type === "bug" ? "created the bug" : "created the issue",
      ]
    );
  });
}
