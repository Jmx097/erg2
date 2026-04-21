import { describe, expect, it } from "vitest";
import { clampGlassText } from "./display.js";

describe("clampGlassText", () => {
  it("normalizes whitespace for HUD display", () => {
    expect(clampGlassText(" hello  \n\n\n world \r")).toBe("hello\n\n world");
  });

  it("keeps text under the startup text limit", () => {
    expect(clampGlassText("a".repeat(1_200))).toHaveLength(950);
  });
});
