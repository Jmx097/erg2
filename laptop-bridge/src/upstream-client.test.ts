import { describe, expect, it, vi } from "vitest";
import type { HardwareBridgeEventBatchResponse } from "@openclaw/protocol";
import { UpstreamBridgeClient } from "./upstream-client.js";

describe("UpstreamBridgeClient", () => {
  it("delivers laptop-bridge events to the VPS ingest endpoint", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 202,
      json: async (): Promise<HardwareBridgeEventBatchResponse> => ({
        request_id: "req_123",
        accepted_event_ids: ["evt_1"],
        duplicate_event_ids: [],
        rejected_events: []
      })
    })) as unknown as typeof fetch;

    const client = new UpstreamBridgeClient(
      {
        bridgeId: "bridge-local",
        baseUrl: "https://api.example.com",
        token: "hardware-bridge-token"
      },
      fetchImpl
    );

    const result = await client.deliver([
      {
        kind: "device.connection",
        event_id: "evt_1",
        bridge_id: "bridge-local",
        device_id: "xreal-g2-local",
        sequence: 1,
        occurred_at: new Date().toISOString(),
        state: "connected"
      }
    ]);

    expect(result).toEqual({
      acceptedEventIds: ["evt_1"],
      duplicateEventIds: [],
      rejectedEventIds: []
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.com/v1/hardware-bridge/events",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer hardware-bridge-token"
        })
      })
    );
  });
});
