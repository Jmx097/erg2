import { describe, expect, it, vi } from "vitest";
import type { BridgeConfig } from "./config.js";
import { createBridgeApp, type OpenClawChatPort } from "./server.js";

const config: BridgeConfig = {
  port: 8787,
  openclawBaseUrl: "http://127.0.0.1:18789",
  openclawGatewayToken: "gateway-token",
  g2BridgeToken: "bridge-token",
  openclawModel: "openclaw/default",
  openclawRequestTimeoutMs: 1_000,
  openclawHealthCheck: true
};

describe("bridge app", () => {
  it("rejects unauthenticated health checks", async () => {
    const app = createBridgeApp(config, mockOpenClaw());

    const response = await app.request("/health");

    expect(response.status).toBe(401);
  });

  it("allows authenticated health checks", async () => {
    const openclaw = mockOpenClaw();
    const app = createBridgeApp(config, openclaw);

    const response = await app.request("/health", {
      headers: { authorization: "Bearer bridge-token" }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(openclaw.checkHealth).toHaveBeenCalledOnce();
  });

  it("maps install ids to g2 session keys", async () => {
    const openclaw = mockOpenClaw();
    const app = createBridgeApp(config, openclaw);

    const response = await app.request("/v0/turn", {
      method: "POST",
      headers: {
        authorization: "Bearer bridge-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        installId: "abc-123",
        prompt: "ping"
      })
    });

    expect(response.status).toBe(200);
    expect(openclaw.createChatCompletion).toHaveBeenCalledWith({
      requestId: expect.stringMatching(/^turn_[0-9a-f]{8}$/),
      sessionKey: "g2:abc-123",
      prompt: "ping"
    });
    expect(await response.json()).toMatchObject({
      reply: "alive",
      sessionKey: "g2:abc-123"
    });
  });
});

function mockOpenClaw(): OpenClawChatPort {
  return {
    checkHealth: vi.fn(async () => ({ ok: true })),
    createChatCompletion: vi.fn(async ({ sessionKey }) => ({
      reply: "alive",
      model: "openclaw/default",
      sessionKey
    }))
  };
}
