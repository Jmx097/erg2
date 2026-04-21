import type { HardwareBridgeEvent, HardwareBridgeEventBatchRequest, HardwareBridgeEventBatchResponse } from "@openclaw/protocol";
import type { BridgeConfig } from "./config.js";
import { logBridgeEvent } from "./logger.js";

export class HardwareBridgeIngestService {
  private readonly seenEventIds = new Map<string, number>();

  constructor(private readonly config: Pick<BridgeConfig, "hardwareBridgeDedupTtlMs" | "hardwareBridgeMaxBatchSize">) {}

  ingest(batch: HardwareBridgeEventBatchRequest, requestId: string, remoteIp: string): HardwareBridgeEventBatchResponse {
    this.cleanupExpired();

    const acceptedEventIds: string[] = [];
    const duplicateEventIds: string[] = [];
    const rejectedEvents: HardwareBridgeEventBatchResponse["rejected_events"] = [];
    const now = Date.now();

    if (!batch.bridge_id.trim()) {
      return {
        request_id: requestId,
        accepted_event_ids: [],
        duplicate_event_ids: [],
        rejected_events: [{ event_id: "batch", reason: "bridge_id is required" }]
      };
    }

    if (!Array.isArray(batch.events) || batch.events.length === 0) {
      return {
        request_id: requestId,
        accepted_event_ids: [],
        duplicate_event_ids: [],
        rejected_events: [{ event_id: "batch", reason: "events must contain at least one item" }]
      };
    }

    if (batch.events.length > this.config.hardwareBridgeMaxBatchSize) {
      return {
        request_id: requestId,
        accepted_event_ids: [],
        duplicate_event_ids: [],
        rejected_events: [{ event_id: "batch", reason: `batch exceeds max size ${this.config.hardwareBridgeMaxBatchSize}` }]
      };
    }

    for (const event of batch.events) {
      const validation = validateHardwareBridgeEvent(event, batch.bridge_id);
      if (validation) {
        rejectedEvents.push({
          event_id: event?.event_id || "unknown",
          reason: validation
        });
        continue;
      }

      if (this.seenEventIds.has(event.event_id)) {
        duplicateEventIds.push(event.event_id);
        continue;
      }

      this.seenEventIds.set(event.event_id, now + this.config.hardwareBridgeDedupTtlMs);
      acceptedEventIds.push(event.event_id);
      logBridgeEvent(buildLogEntry(event, requestId, remoteIp));
    }

    return {
      request_id: requestId,
      accepted_event_ids: acceptedEventIds,
      duplicate_event_ids: duplicateEventIds,
      rejected_events: rejectedEvents
    };
  }

  private cleanupExpired(now = Date.now()): void {
    for (const [eventId, expiresAt] of this.seenEventIds) {
      if (expiresAt <= now) {
        this.seenEventIds.delete(eventId);
      }
    }
  }
}

function validateHardwareBridgeEvent(event: HardwareBridgeEvent | undefined, bridgeId: string): string | undefined {
  if (!event) {
    return "event is required";
  }

  if (!event.event_id?.trim()) {
    return "event_id is required";
  }

  if (event.bridge_id !== bridgeId) {
    return "event bridge_id must match batch bridge_id";
  }

  if (!event.device_id?.trim()) {
    return "device_id is required";
  }

  if (!event.occurred_at?.trim()) {
    return "occurred_at is required";
  }

  if (!Number.isFinite(event.sequence) || event.sequence < 0) {
    return "sequence must be a non-negative number";
  }

  return undefined;
}

function buildLogEntry(event: HardwareBridgeEvent, requestId: string, remoteIp: string): { event: string } & Record<string, unknown> {
  const base = {
    event: "hardware_bridge_event",
    requestId,
    remoteIp,
    bridgeId: event.bridge_id,
    deviceId: event.device_id,
    eventId: event.event_id,
    kind: event.kind,
    sequence: event.sequence,
    occurredAt: event.occurred_at
  };

  switch (event.kind) {
    case "device.connection":
      return {
        ...base,
        state: event.state,
        reason: event.reason,
        sessionId: event.session_id,
        rssi: event.rssi
      };
    case "telemetry.status":
      return {
        ...base,
        batteryPercent: event.battery_percent,
        charging: event.charging,
        signalStrength: event.signal_strength,
        statusText: event.status_text
      };
    case "input.control":
      return {
        ...base,
        control: event.control,
        action: event.action,
        value: event.value
      };
    case "debug.error":
      return {
        ...base,
        code: event.code,
        message: event.message,
        retryable: event.retryable,
        details: event.details
      };
    case "debug.raw_ble":
      return {
        ...base,
        direction: event.direction,
        characteristicUuid: event.characteristic_uuid,
        payloadHex: event.payload_hex
      };
  }
}
