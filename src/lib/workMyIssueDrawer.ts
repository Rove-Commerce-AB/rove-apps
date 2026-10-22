"use server";

import { getCurrentAppUser } from "@/lib/appUsers";
import { getWorkBoardView } from "@/lib/workBoards";
import { fetchMemberWorkProjectIds } from "@/lib/workMyIssuesQueries";
import { WorkInputError } from "@/lib/workErrors";
import type { WorkBoardView, WorkIssue } from "@/lib/workTypes";

export type WorkMyIssueDrawerPayload = {
  board: WorkBoardView;
  issue: WorkIssue;
};

export async function loadMyWorkIssue(
  boardId: string,
  issueId: string
): Promise<WorkMyIssueDrawerPayload> {
  const user = await getCurrentAppUser();
  if (!user || !user.appKeys.includes("work")) {
    throw new WorkInputError("Unauthorized");
  }

  const memberProjectIds = await fetchMemberWorkProjectIds(user.id);
  if (!memberProjectIds.includes(boardId)) {
    throw new WorkInputError("You are not a member of this project.");
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
