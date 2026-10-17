import { describe, expect, it } from "vitest";
import {
  isAllowedWorkMarkdownHref,
  workMarkdownUrlTransform,
} from "./workMarkdown";

describe("isAllowedWorkMarkdownHref", () => {
  it("allows http(s) and mailto", () => {
    expect(isAllowedWorkMarkdownHref("https://example.com/a")).toBe(true);
    expect(isAllowedWorkMarkdownHref("http://example.com")).toBe(true);
    expect(isAllowedWorkMarkdownHref("mailto:dev@rove.se")).toBe(true);
  });

  it("allows Work app relative paths", () => {
    expect(isAllowedWorkMarkdownHref("/work")).toBe(true);
    expect(isAllowedWorkMarkdownHref("/work/cust/proj")).toBe(true);
  });

  it("rejects javascript, data, protocol-relative, and other relatives", () => {
    expect(isAllowedWorkMarkdownHref("javascript:alert(1)")).toBe(false);
    expect(isAllowedWorkMarkdownHref("data:text/html,hi")).toBe(false);
    expect(isAllowedWorkMarkdownHref("//evil.example")).toBe(false);
    expect(isAllowedWorkMarkdownHref("/api/work/files/x")).toBe(false);
    expect(isAllowedWorkMarkdownHref("../escape")).toBe(false);
    expect(isAllowedWorkMarkdownHref("")).toBe(false);
  });
});

describe("workMarkdownUrlTransform", () => {
  it("passes through allowed hrefs and blanks disallowed", () => {
    expect(workMarkdownUrlTransform(" https://ok ")).toBe("https://ok");
    expect(workMarkdownUrlTransform("javascript:alert(1)")).toBe("");
  });
});
