import { describe, expect, it } from "vitest";
import {
  generateTemporaryPassword,
  hashPassword,
  PASSWORD_MIN_LENGTH,
  validatePasswordStrength,
  verifyPassword,
} from "./passwords";

describe("passwords", () => {
  it("validates minimum length", () => {
    expect(validatePasswordStrength("short")).toMatch(/at least/);
    expect(validatePasswordStrength("a".repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });

  it("generates temporary passwords of sufficient length", () => {
    for (let i = 0; i < 10; i++) {
      const password = generateTemporaryPassword();
      expect(password.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
      expect(validatePasswordStrength(password)).toBeNull();
    }
  });

  it("hashes and verifies passwords", () => {
    const password = "correct-horse";
    const hash = hashPassword(password);
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword(password, hash)).toBe(true);
    expect(verifyPassword("wrong-password", hash)).toBe(false);
    expect(verifyPassword(password, null)).toBe(false);
  });
});
