import { describe, expect, it, vi } from "vitest";
import { EvenHubAppController } from "./app-controller.js";
import { BridgeApiError } from "./bridge.js";

describe("EvenHubAppController", () => {
  it("refreshes on foreground enter when the access token is near expiry", async () => {
    const api = {
      health: vi.fn(async () => ({ ok: true, bridge: "openclaw-mobile-companion" })),
      redeemPairing: vi.fn(),
      registerDevice: vi.fn(),
      refreshSession: vi.fn(async () => ({
        access_token: "new-access",
        access_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        refresh_token: "new-refresh",
        refresh_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        refresh_family_id: "rtf_123",
        client_type: "even_hub"
      })),
      sendTurn: vi.fn()
    };
    const storage = createStorageBridge({
      "openclaw.g2.relayBaseUrl": "https://relay.example.com",
      "openclaw.g2.deviceId": "dev_123",
      "openclaw.g2.refreshToken": "rt_123",
      "openclaw.g2.deviceDisplayName": "Jon's G2",
      "openclaw.g2.defaultConversationId": "default"
    });
    const controller = new EvenHubAppController(storage, api as any);

    await controller.boot();
    await controller.handleForegroundEnter();

    expect(api.refreshSession).toHaveBeenCalled();
    expect(controller.getSnapshot().status).toBe("connected");
  });

  it("moves into repair_required when the backend revokes the device", async () => {
    const api = {
      health: vi.fn(async () => ({ ok: true, bridge: "openclaw-mobile-companion" })),
      redeemPairing: vi.fn(),
      registerDevice: vi.fn(),
      refreshSession: vi.fn(async () => {
        throw new BridgeApiError("Device session has been revoked.", 401, "device_revoked");
      }),
      sendTurn: vi.fn()
    };
    const controller = new EvenHubAppController(
      createStorageBridge({
        "openclaw.g2.relayBaseUrl": "https://relay.example.com",
        "openclaw.g2.deviceId": "dev_123",
        "openclaw.g2.refreshToken": "rt_123",
        "openclaw.g2.deviceDisplayName": "Jon's G2",
        "openclaw.g2.defaultConversationId": "default"
      }),
      api as any
    );

    await controller.boot();

    expect(controller.getSnapshot().status).toBe("repair_required");
  });

  it("keeps a reconnect path after abnormal exits and recovers on the next foreground", async () => {
    const api = {
      health: vi.fn(async () => ({ ok: true, bridge: "openclaw-mobile-companion" })),
      redeemPairing: vi.fn(),
      registerDevice: vi.fn(),
      refreshSession: vi.fn(async () => ({
        access_token: "new-access",
        access_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        refresh_token: "new-refresh",
        refresh_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        refresh_family_id: "rtf_123",
        client_type: "even_hub"
      })),
      sendTurn: vi.fn()
    };
    const controller = new EvenHubAppController(
      createStorageBridge({
        "openclaw.g2.relayBaseUrl": "https://relay.example.com",
        "openclaw.g2.deviceId": "dev_123",
        "openclaw.g2.refreshToken": "rt_123",
        "openclaw.g2.deviceDisplayName": "Jon's G2",
        "openclaw.g2.defaultConversationId": "default"
      }),
      api as any
    );

    await controller.boot();
    controller.handleAbnormalExit();
    expect(controller.getSnapshot().status).toBe("reconnect_needed");

    await controller.handleForegroundEnter();
    expect(controller.getSnapshot().status).toBe("connected");
  });
});

function createStorageBridge(values: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(values));
  return {
    getLocalStorage: vi.fn(async (key: string) => store.get(key) || ""),
    setLocalStorage: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return true;
    })
  };
}
