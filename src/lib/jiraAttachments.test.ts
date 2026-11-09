import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  jiraAttachmentContentUrl,
  loadJiraAttachmentCredentials,
  prepareAttachmentBytes,
} from "./jiraAttachments";

describe("jiraAttachments", () => {
  it("parses credential JSON from env shape", () => {
    const rows = loadJiraAttachmentCredentials(
      JSON.stringify([
        {
          host: "https://rovecommerce.atlassian.net/",
          email: "user@rove.se",
          apiToken: "token",
        },
      ])
    );
    expect(rows).toEqual([
      {
        host: "rovecommerce.atlassian.net",
        email: "user@rove.se",
        apiToken: "token",
      },
    ]);
  });

  it("builds attachment content URL from issue link", () => {
    expect(
      jiraAttachmentContentUrl(
        "https://rovecommerce.atlassian.net/browse/ABC-1",
        "20894"
      )
    ).toBe(
      "https://rovecommerce.atlassian.net/rest/api/3/attachment/content/20894"
    );
  });

  it("keeps small non-image files as-is", async () => {
    const raw = Buffer.from("hello");
    const result = await prepareAttachmentBytes(
      raw,
      "notes.txt",
      "text/plain"
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.equals(raw)).toBe(true);
      expect(result.mimeType).toBe("text/plain");
    }
  });
});
