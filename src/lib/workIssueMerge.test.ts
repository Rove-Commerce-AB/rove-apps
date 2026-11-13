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
    estimateSize: null,
    scopeApproved: false,
    loggedHours: 0,
    sprintId: null,
    startDate: null,
    dueDate: null,
    hiddenFromBoard: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
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

  it("keeps optimistic file uploads when server refresh is stale", () => {
    const uploaded = {
      id: "f-new",
      fileName: "clip.mp4",
      mimeType: "video/mp4",
      byteSize: 100,
      createdAt: "2026-11-13T00:00:00.000Z",
    };
    const poster = {
      id: "f-poster",
      fileName: "thumb__clip.mp4.jpg",
      mimeType: "image/jpeg",
      byteSize: 20,
      createdAt: "2026-11-13T00:00:00.000Z",
    };
    const local = [issue({ id: "a", files: [uploaded, poster] })];
    const server = [issue({ id: "a", files: [] })];
    const merged = mergeIssuesFromServer(local, server);
    expect(merged[0]?.files.map((file) => file.id)).toEqual([
      "f-new",
      "f-poster",
    ]);
  });

  it("drops local-only files once server includes them", () => {
    const uploaded = {
      id: "f-new",
      fileName: "clip.mp4",
      mimeType: "video/mp4",
      byteSize: 100,
      createdAt: "2026-11-13T00:00:00.000Z",
    };
    const local = [issue({ id: "a", files: [uploaded] })];
    const server = [
      issue({
        id: "a",
        files: [{ ...uploaded, byteSize: 100 }],
      }),
    ];
    const merged = mergeIssuesFromServer(local, server);
    expect(merged[0]?.files).toEqual(server[0]?.files);
  });
});
