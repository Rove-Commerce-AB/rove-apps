import { describe, expect, it } from "vitest";
import { buildContentDisposition } from "./workFileHttp";

describe("buildContentDisposition", () => {
  it("keeps ASCII names simple and header-safe", () => {
    const value = buildContentDisposition("inline", 'shot"1".png');
    expect(value).toBe(
      'inline; filename="shot_1_.png"; filename*=UTF-8\'\'shot_1_.png'
    );
    expect(() => new Headers({ "Content-Disposition": value })).not.toThrow();
  });

  it("encodes Swedish / combining-mark filenames for Headers", () => {
    const name = "Ska\u0308rmavbild 2026-09-11 kl. 12.14.24.jpg";
    const value = buildContentDisposition("inline", name);
    expect(value.startsWith('inline; filename="Skarmavbild 2026-09-11 kl. 12.14.24.jpg";')).toBe(
      true
    );
    expect(value).toContain("filename*=UTF-8''");
    expect(value).toContain(encodeURIComponent(name));
    expect(() => new Headers({ "Content-Disposition": value })).not.toThrow();
  });
});
