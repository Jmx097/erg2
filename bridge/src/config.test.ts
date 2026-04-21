import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, resolveRuntimeEnv } from "./config.js";

const tempDirs: string[] = [];

describe("resolveRuntimeEnv", () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("loads the first matching env file and preserves explicit env overrides", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "openclaw-bridge-config-"));
    tempDirs.push(tempDir);

    const envPath = path.join(tempDir, ".env");
    writeFileSync(
      envPath,
      [
        "PORT=9000",
        "RELAY_BASE_URL=https://relay.example.com",
        "ADMIN_API_TOKEN=file-admin-token",
        "ACCESS_TOKEN_SECRET=file-secret",
        "OPENCLAW_BASE_URL=http://10.10.0.5:18789",
        "OPENCLAW_GATEWAY_TOKEN=file-token",
        "G2_BRIDGE_TOKEN=file-bridge-token",
        "OPENCLAW_MODEL=file-model"
      ].join("\n")
    );

    const runtimeEnv = resolveRuntimeEnv(
      {
        OPENCLAW_MODEL: "shell-model",
        OPENCLAW_REQUEST_TIMEOUT_MS: "15000"
      },
      [envPath]
    );

    const config = loadConfig(runtimeEnv);

    expect(config).toMatchObject({
      port: 9000,
      relayBaseUrl: "https://relay.example.com",
      adminApiToken: "file-admin-token",
      accessTokenSecret: "file-secret",
      openclawBaseUrl: "http://10.10.0.5:18789",
      openclawGatewayToken: "file-token",
      g2BridgeToken: "file-bridge-token",
      openclawModel: "shell-model",
      openclawRequestTimeoutMs: 15000
    });
  });

  it("normalizes websocket-style upstream URLs for HTTP fetch usage", () => {
    const config = loadConfig({
      RELAY_BASE_URL: "https://relay.example.com/",
      ADMIN_API_TOKEN: "admin-token",
      ACCESS_TOKEN_SECRET: "secret",
      OPENCLAW_BASE_URL: "wss://glasses.plinkosolutions.com/",
      OPENCLAW_GATEWAY_TOKEN: "gateway-token",
      G2_BRIDGE_TOKEN: "bridge-token"
    });

    expect(config.openclawBaseUrl).toBe("https://glasses.plinkosolutions.com");
    expect(config.relayBaseUrl).toBe("https://relay.example.com");
  });

  it("falls back to a local relay base URL when one is not provided", () => {
    const config = loadConfig({
      PORT: "8123",
      ADMIN_API_TOKEN: "admin-token",
      ACCESS_TOKEN_SECRET: "secret",
      OPENCLAW_BASE_URL: "http://127.0.0.1:18789",
      OPENCLAW_GATEWAY_TOKEN: "gateway-token"
    });

    expect(config.relayBaseUrl).toBe("http://127.0.0.1:8123");
    expect(config.g2BridgeToken).toBe("");
  });
});
