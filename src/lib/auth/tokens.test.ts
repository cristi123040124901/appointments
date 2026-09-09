import { describe, it, expect } from "vitest";
import { generateToken, hashToken } from "./tokens";

describe("generateToken", () => {
  it("returns a raw token whose hash matches the returned hash", () => {
    const { raw, hash } = generateToken();
    expect(hashToken(raw)).toBe(hash);
  });

  it("generates unique tokens across calls", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });

  it("never leaks the raw token through its hash", () => {
    const { raw, hash } = generateToken();
    expect(hash).not.toContain(raw);
  });
});

describe("hashToken", () => {
  it("is deterministic", () => {
    expect(hashToken("same-input")).toBe(hashToken("same-input"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });
});
