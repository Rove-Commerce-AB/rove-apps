import { describe, expect, it } from "vitest";
import { compareIssueKey, sortByIssueKey } from "./issueKeySort";

describe("compareIssueKey", () => {
  it("orders numeric suffixes ascending", () => {
    const keys = ["atrac-100", "atrac-1", "atrac-10", "atrac-2"];
    expect([...keys].sort(compareIssueKey)).toEqual([
      "atrac-1",
      "atrac-2",
      "atrac-10",
      "atrac-100",
    ]);
  });

  it("is case-insensitive on the prefix", () => {
    expect(compareIssueKey("ATRAC-2", "atrac-10")).toBeLessThan(0);
  });
});

describe("sortByIssueKey", () => {
  it("sorts objects by key field", () => {
    const rows = [
      { jira_key: "SUP-10" },
      { jira_key: "SUP-2" },
      { jira_key: "SUP-1" },
    ];
    expect(sortByIssueKey(rows, (r) => r.jira_key).map((r) => r.jira_key)).toEqual([
      "SUP-1",
      "SUP-2",
      "SUP-10",
    ]);
  });
});
