import { describe, expect, it } from "vitest";
import {
  aggregateWorkCommentReactions,
  emptyWorkCommentReactions,
  toggleWorkCommentReactionLocal,
} from "./workCommentReactions";

describe("workCommentReactions", () => {
  it("aggregates rows into fixed reaction set", () => {
    const reactions = aggregateWorkCommentReactions(
      [
        {
          comment_id: "c1",
          reaction: "agree",
          app_user_id: "u1",
          user_name: "Anna",
          user_email: "anna@rove.se",
        },
        {
          comment_id: "c1",
          reaction: "agree",
          app_user_id: "u2",
          user_name: null,
          user_email: "simon@rove.se",
        },
        {
          comment_id: "c1",
          reaction: "seen",
          app_user_id: "u2",
          user_name: "Simon",
          user_email: "simon@rove.se",
        },
      ],
      "u2"
    );
    expect(reactions.find((r) => r.type === "agree")).toMatchObject({
      count: 2,
      reactedByMe: true,
      names: ["Anna", "simon"],
    });
    expect(reactions.find((r) => r.type === "seen")).toMatchObject({
      count: 1,
      reactedByMe: true,
    });
    expect(reactions.find((r) => r.type === "good")?.count).toBe(0);
  });

  it("toggles locally", () => {
    const base = emptyWorkCommentReactions();
    const added = toggleWorkCommentReactionLocal(base, "thanks", "Simon");
    expect(added.find((r) => r.type === "thanks")).toMatchObject({
      count: 1,
      reactedByMe: true,
      names: ["Simon"],
    });
    const removed = toggleWorkCommentReactionLocal(added, "thanks", "Simon");
    expect(removed.find((r) => r.type === "thanks")).toMatchObject({
      count: 0,
      reactedByMe: false,
      names: [],
    });
  });
});
