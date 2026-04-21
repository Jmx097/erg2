import { describe, expect, it } from "vitest";
import { createPromptId, expiresWithin } from "./session.js";

describe("session helpers", () => {
  it("creates retry-safe prompt ids", () => {
    expect(createPromptId()).toMatch(/^prm_[a-z0-9-]+$/i);
  });

  it("detects expiring access tokens", () => {
    expect(expiresWithin(new Date(Date.now() + 5_000).toISOString(), 60_000)).toBe(true);
    expect(expiresWithin(new Date(Date.now() + 5 * 60_000).toISOString(), 60_000)).toBe(false);
  });
});
