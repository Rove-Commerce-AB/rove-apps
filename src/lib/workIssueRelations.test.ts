import { describe, expect, it } from "vitest";
import {
  canonicalizeRelatePair,
  childAlreadyHasParent,
  emptyWorkIssueRelations,
  groupRelationsForIssues,
  isIssueBlocked,
  relatedIssueIds,
  relationEdgeFromRole,
  wouldCreateBlocksCycle,
  wouldCreateParentCycle,
  type WorkIssueRelationRef,
  type WorkRelationRow,
} from "./workIssueRelations";

const refs = new Map<string, WorkIssueRelationRef>([
  ["a", { id: "a", key: "RT-1", title: "One", status: "todo", isDone: false }],
  ["b", { id: "b", key: "RT-2", title: "Two", status: "todo", isDone: false }],
  ["c", { id: "c", key: "RT-3", title: "Three", status: "done", isDone: true }],
]);

function row(
  partial: Partial<WorkRelationRow> &
    Pick<WorkRelationRow, "id" | "fromIssueId" | "toIssueId" | "kind">
): WorkRelationRow {
  return { boardId: "board", ...partial };
}

describe("relationEdgeFromRole", () => {
  it("stores relates with a stable order", () => {
    expect(canonicalizeRelatePair("b", "a")).toEqual(["a", "b"]);
    expect(relationEdgeFromRole("b", "a", "relates")).toEqual({
      fromIssueId: "a",
      toIssueId: "b",
      kind: "relates",
    });
  });

  it("maps blocked-by to a blocks edge the other way", () => {
    expect(relationEdgeFromRole("a", "b", "blocked_by")).toEqual({
      fromIssueId: "b",
      toIssueId: "a",
      kind: "blocks",
    });
  });
});

describe("cycles", () => {
  it("rejects a parent cycle", () => {
    const rows = [row({ id: "1", fromIssueId: "a", toIssueId: "b", kind: "parent" })];
    expect(wouldCreateParentCycle(rows, "b", "a")).toBe(true);
    expect(wouldCreateParentCycle(rows, "c", "a")).toBe(false);
    expect(childAlreadyHasParent(rows, "b")).toBe(true);
  });

  it("rejects a blocks cycle", () => {
    const rows = [
      row({ id: "1", fromIssueId: "a", toIssueId: "b", kind: "blocks" }),
      row({ id: "2", fromIssueId: "b", toIssueId: "c", kind: "blocks" }),
    ];
    expect(wouldCreateBlocksCycle(rows, "c", "a")).toBe(true);
    expect(wouldCreateBlocksCycle(rows, "a", "c")).toBe(false);
  });
});

describe("groupRelationsForIssues", () => {
  it("exposes both sides and treats done blockers as not blocking", () => {
    const grouped = groupRelationsForIssues(
      ["a", "b", "c"],
      [
        row({ id: "p", fromIssueId: "a", toIssueId: "b", kind: "parent" }),
        row({ id: "k", fromIssueId: "c", toIssueId: "a", kind: "blocks" }),
        row({ id: "r", fromIssueId: "a", toIssueId: "c", kind: "relates" }),
      ],
      refs
    );
    expect(grouped.get("b")?.parent?.id).toBe("a");
    expect(grouped.get("a")?.children.map((item) => item.id)).toEqual(["b"]);
    expect(grouped.get("a")?.blockedBy.map((item) => item.id)).toEqual(["c"]);
    expect(isIssueBlocked(grouped.get("a")!)).toBe(false);
    expect(grouped.get("a")?.relates.map((item) => item.id)).toEqual(["c"]);
  });
});

describe("relatedIssueIds", () => {
  it("collects every linked issue id", () => {
    const relations = emptyWorkIssueRelations();
    relations.parent = {
      relationId: "1",
      id: "p",
      key: "P-1",
      title: "Parent",
      status: "todo",
      isDone: false,
    };
    relations.relates = [
      {
        relationId: "2",
        id: "r",
        key: "R-1",
        title: "Related",
        status: "todo",
        isDone: false,
      },
    ];
    expect(relatedIssueIds(relations).sort()).toEqual(["p", "r"]);
  });
});
