import { describe, expect, it, vi } from "vitest";
import { getOrCreateInstallId } from "./session.js";

describe("getOrCreateInstallId", () => {
  it("reuses an existing install id", async () => {
    const bridge = {
      getLocalStorage: vi.fn(async () => "existing-id"),
      setLocalStorage: vi.fn(async () => true)
    };

    await expect(getOrCreateInstallId(bridge)).resolves.toBe("existing-id");
    expect(bridge.setLocalStorage).not.toHaveBeenCalled();
  });

  it("stores a new install id when none exists", async () => {
    const bridge = {
      getLocalStorage: vi.fn(async () => ""),
      setLocalStorage: vi.fn(async () => true)
    };

    const installId = await getOrCreateInstallId(bridge);

    expect(installId.length).toBeGreaterThan(8);
    expect(bridge.setLocalStorage).toHaveBeenCalledWith("openclaw.g2.installId", installId);
  });
});
