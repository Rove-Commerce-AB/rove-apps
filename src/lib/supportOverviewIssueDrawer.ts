"use server";

import { getWorkBoardView } from "@/lib/workBoards";
import { canSeeSupportOverview } from "@/lib/supportAccess";
import { requireSupportActor } from "@/lib/supportActor";
import { WorkInputError } from "@/lib/workErrors";
import type { WorkBoardView, WorkIssue } from "@/lib/workTypes";

export type SupportOverviewIssueDrawerPayload = {
  board: WorkBoardView;
  issue: WorkIssue;
};

export async function loadSupportOverviewWorkIssue(
  boardId: string,
  issueId: string
): Promise<SupportOverviewIssueDrawerPayload> {
  const actor = await requireSupportActor();
  if (!canSeeSupportOverview(actor)) {
    throw new WorkInputError("Unauthorized");
  }

  const board = await getWorkBoardView(boardId);
  if (!board) {
    throw new WorkInputError("Board not found or you lack Work access.");
  }
  const issue = board.issues.find((row) => row.id === issueId);
  if (!issue) {
    throw new WorkInputError("Issue not found on this board.");
  }
  return { board, issue };
}
