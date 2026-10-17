import { describe, expect, it } from "vitest";
import {
  isValidWorkBoardPrefix,
  normalizeWorkBoardPrefix,
  suggestWorkBoardPrefix,
  workIssueKey,
} from "./workIssueKey";

describe("work board prefix", () => {
  it("normalizes and validates", () => {
    expect(normalizeWorkBoardPrefix(" rt-1 ")).toBe("RT1");
    expect(isValidWorkBoardPrefix("RT")).toBe(true);
    expect(isValidWorkBoardPrefix("R")).toBe(false);
    expect(isValidWorkBoardPrefix("rt")).toBe(false);
  });

  it("suggests from customer name, combined with project title when set", () => {
    expect(suggestWorkBoardPrefix("Riverstone Technologies")).toBe("RT");
    expect(suggestWorkBoardPrefix("Acme")).toBe("ACM");
    expect(suggestWorkBoardPrefix("Göhlins", "Wholesale")).toBe("GOWH");
    expect(suggestWorkBoardPrefix("Riverstone Technologies", "Mobile App")).toBe(
      "RTMA"
    );
  });

  it("builds a per-board issue key", () => {
    expect(workIssueKey("RT", 170)).toBe("RT-170");
  });
});
