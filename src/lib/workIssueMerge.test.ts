import { describe, expect, it } from "vitest";
import { emptyWorkIssueRelations } from "./workIssueRelations";
import {
  mergeIssuesFromServer,
  noteOptimisticIssuePatch,
  type OptimisticIssuePatches,
} from "./workIssueMerge";
import type { WorkIssue } from "./workTypes";

function issue(partial: Partial<WorkIssue> & Pick<WorkIssue, "id">): WorkIssue {
  return {
    number: 1,
    key: "T-1",
    title: "Title",
    status: "todo",
    sortOrder: 0,
    issueType: "issue",
    component: null,
    description: "",
    currentState: "",
    nextStep: "",
    priority: null,
    owner: null,
    reporter: null,
    assignees: [],
    labels: [],
    comments: [],
    events: [],
    files: [],
    requirements: [],
    definitionOfDone: [],
    preDeployActions: [],
    outOfScope: "",
    references: [],
    relations: emptyWorkIssueRelations(),
    estimateHours: null,
    loggedHours: 0,
    sprintId: null,
    startDate: null,
    dueDate: null,
    ...partial,
  };
}

describe("mergeIssuesFromServer", () => {
  it("keeps optimistic description when server is still empty", () => {
    const patches: OptimisticIssuePatches = new Map();
    noteOptimisticIssuePatch(patches, "a", {
      description: "typed after create",
    });
    const local = [issue({ id: "a", description: "typed after create" })];
    const server = [issue({ id: "a", description: "" })];
    const merged = mergeIssuesFromServer(local, server, patches);
    expect(merged[0]?.description).toBe("typed after create");
    expect(patches.get("a")?.description).toBe("typed after create");
  });

  it("drops optimistic patch once server catches up", () => {
    const patches: OptimisticIssuePatches = new Map();
    noteOptimisticIssuePatch(patches, "a", {
      description: "saved",
    });
    const local = [issue({ id: "a", description: "saved" })];
    const server = [issue({ id: "a", description: "saved" })];
    const merged = mergeIssuesFromServer(local, server, patches);
    expect(merged[0]?.description).toBe("saved");
    expect(patches.has("a")).toBe(false);
  });

  it("still applies newer server description when nothing is optimistic", () => {
    const local = [issue({ id: "a", description: "old" })];
    const server = [issue({ id: "a", description: "from elsewhere" })];
    const merged = mergeIssuesFromServer(local, server);
    expect(merged[0]?.description).toBe("from elsewhere");
  });

  it("preserves local status/sortOrder while merging remote fields", () => {
    const local = [
      issue({ id: "a", status: "doing", sortOrder: 3, title: "Local" }),
    ];
    const server = [
      issue({ id: "a", status: "todo", sortOrder: 0, title: "Remote" }),
    ];
    const merged = mergeIssuesFromServer(local, server);
    expect(merged[0]?.status).toBe("doing");
    expect(merged[0]?.sortOrder).toBe(3);
    expect(merged[0]?.title).toBe("Remote");
  });
});
