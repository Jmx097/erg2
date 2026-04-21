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
      openclawBaseUrl: "http://10.10.0.5:18789",
      openclawGatewayToken: "file-token",
      g2BridgeToken: "file-bridge-token",
      openclawModel: "shell-model",
      openclawRequestTimeoutMs: 15000
    });
  });

  it("normalizes websocket-style base URLs for HTTP fetch usage", () => {
    const config = loadConfig({
      OPENCLAW_BASE_URL: "wss://glasses.plinkosolutions.com/",
      OPENCLAW_GATEWAY_TOKEN: "gateway-token",
      G2_BRIDGE_TOKEN: "bridge-token"
    });

    expect(config.openclawBaseUrl).toBe("https://glasses.plinkosolutions.com");
  });
});
