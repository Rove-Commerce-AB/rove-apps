import { describe, expect, it } from "vitest";
import { mentionRangesInText } from "./workMentionHighlight";
import type { WorkPerson } from "./workTypes";

const people: WorkPerson[] = [
  { id: "1", name: "Martin Brandt", initials: "MB" },
  { id: "2", name: "Martin", initials: "M" },
  { id: "3", name: "Alex", initials: "A" },
];

describe("mentionRangesInText", () => {
  it("highlights completed @Name tokens", () => {
    expect(mentionRangesInText("Hi @Alex thanks", people)).toEqual([
      { from: 3, to: 8 },
    ]);
  });

  it("prefers the longest matching name", () => {
    expect(mentionRangesInText("@Martin Brandt hi", people)).toEqual([
      { from: 0, to: 14 },
    ]);
  });

  it("ignores incomplete queries", () => {
    expect(mentionRangesInText("Hello @Al", people)).toEqual([]);
  });
});
