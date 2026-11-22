import { describe, expect, it } from "vitest";
import {
  activityIdFromLinkKey,
  activityLinkKey,
  collectActivityIdsFromLinkKeys,
} from "./activityTimeLink";

describe("activityTimeLink", () => {
  it("round-trips activity link keys", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(activityLinkKey(id)).toBe(`activity:${id}`);
    expect(activityIdFromLinkKey(`activity:${id}`)).toBe(id);
  });

  it("ignores non-activity keys", () => {
    expect(activityIdFromLinkKey("work:abc")).toBeNull();
    expect(activityIdFromLinkKey("jira:ABC-1")).toBeNull();
    expect(activityIdFromLinkKey("")).toBeNull();
    expect(activityIdFromLinkKey(null)).toBeNull();
  });

  it("dedupes collected ids", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(
      collectActivityIdsFromLinkKeys([
        `activity:${id}`,
        `activity:${id}`,
        "jira:X-1",
      ])
    ).toEqual([id]);
  });
});
