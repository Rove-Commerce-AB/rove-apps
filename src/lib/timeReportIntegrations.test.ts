import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/cloudSqlPool", () => ({
  cloudSqlPool: {
    query: vi.fn(),
  },
}));

import { cloudSqlPool } from "@/lib/cloudSqlPool";
import { getJiraIssuesByProjectKey } from "./timeReportIntegrations";

const queryMock = vi.mocked(cloudSqlPool.query);

describe("getJiraIssuesByProjectKey", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("loads issues by project_key and Jira key prefix", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          jira_key: "HAKI-123",
          summary: "Install weather protection",
          url: "https://example.atlassian.net/browse/HAKI-123",
        },
      ],
    });

    await expect(getJiraIssuesByProjectKey(" HAKI ")).resolves.toEqual([
      {
        value: "HAKI-123",
        label: "HAKI-123: Install weather protection",
        summary: "Install weather protection",
        url: "https://example.atlassian.net/browse/HAKI-123",
      },
    ]);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("project_key = $1"),
      ["HAKI", "HAKI-%"]
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("jira_key LIKE $2"),
      ["HAKI", "HAKI-%"]
    );
  });

  it("does not query for blank project keys", async () => {
    await expect(getJiraIssuesByProjectKey("   ")).resolves.toEqual([]);

    expect(queryMock).not.toHaveBeenCalled();
  });
});
