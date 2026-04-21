import { describe, expect, it, vi } from "vitest";
import type { AdapterSignal, AdapterStatus, GlassesBleAdapter } from "./adapters/ble-adapter.js";
import { LaptopBridgeRuntime } from "./bridge-runtime.js";
import type { LaptopBridgeConfig } from "./config.js";

describe("LaptopBridgeRuntime", () => {
  it("reports health even when the adapter starts disconnected", async () => {
    let listener: ((signal: AdapterSignal) => void) | undefined;
    const status: AdapterStatus = {
      mode: "xreal_g2_ble_stub",
      state: "absent",
      connected: false,
      lastError: "No glasses nearby"
    };
    const adapter: GlassesBleAdapter = {
      connect: vi.fn(async () => {
        listener?.({
          kind: "debug.error",
          code: "glasses_absent",
          message: "No glasses nearby",
          retryable: true
        });
      }),
      disconnect: vi.fn(async () => undefined),
      getStatus: () => status,
      onSignal(next) {
        listener = next;
        return () => undefined;
      }
    };

    const runtime = new LaptopBridgeRuntime(createTestConfig(), adapter);
    await runtime.start();

    const health = runtime.health();
    expect(health.ok).toBe(true);
    expect(health.glasses_connected).toBe(false);
    expect(health.adapter_state).toBe("absent");

    await runtime.stop();
  });
});

function createTestConfig(): LaptopBridgeConfig {
  return {
    environment: "test",
    port: 8791,
    bridgeId: "test-bridge",
    deviceId: "test-device",
    adapterMode: "mock",
    rawBleDebug: false,
    reconnectInitialMs: 10,
    reconnectMaxMs: 50,
    resumeGapMs: 1_000,
    upstreamFlushIntervalMs: 50,
    upstreamMaxBatchSize: 10,
    upstreamMaxQueueSize: 10,
    vpsBaseUrl: "https://api.example.com",
    vpsToken: "hardware-bridge-token",
    g2NamePrefix: "XREAL"
  };
}
