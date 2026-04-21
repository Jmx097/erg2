import type {
  HardwareBridgeConnectionEvent,
  HardwareBridgeErrorEvent,
  HardwareBridgeEvent,
  HardwareBridgeInputEvent,
  HardwareBridgeRawBleEvent,
  HardwareBridgeTelemetryEvent,
  LaptopBridgeHealthResponse
} from "@openclaw/protocol";
import { calculateBackoffMs } from "./backoff.js";
import type { AdapterSignal, GlassesBleAdapter } from "./adapters/ble-adapter.js";
import type { LaptopBridgeConfig } from "./config.js";
import { EventBuffer } from "./event-buffer.js";
import { createBridgeEventId } from "./ids.js";
import { logLaptopBridgeEvent } from "./logger.js";
import { UpstreamBridgeClient } from "./upstream-client.js";

export class LaptopBridgeRuntime {
  private readonly buffer: EventBuffer;
  private readonly upstreamClient: UpstreamBridgeClient;
  private reconnectAttempt = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private flushTimer?: ReturnType<typeof setInterval>;
  private lastTickMs = Date.now();
  private resumeTimer?: ReturnType<typeof setInterval>;
  private sequence = 0;
  private lastDeliveryAt?: string;
  private lastDeliveryError?: string;
  private started = false;

  constructor(
    private readonly config: LaptopBridgeConfig,
    private readonly adapter: GlassesBleAdapter
  ) {
    this.buffer = new EventBuffer(config.upstreamMaxQueueSize);
    this.upstreamClient = new UpstreamBridgeClient({
      bridgeId: config.bridgeId,
      baseUrl: config.vpsBaseUrl,
      token: config.vpsToken
    });
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
    this.adapter.onSignal((signal) => {
      const event = this.normalizeSignal(signal);
      this.buffer.enqueue(event);
      logLaptopBridgeEvent({
        event: "laptop_bridge_signal",
        bridgeId: this.config.bridgeId,
        deviceId: this.config.deviceId,
        kind: event.kind,
        eventId: event.event_id
      });
    });

    await this.tryConnect();
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.config.upstreamFlushIntervalMs);
    this.resumeTimer = setInterval(() => {
      const now = Date.now();
      const gap = now - this.lastTickMs;
      this.lastTickMs = now;
      if (gap > this.config.resumeGapMs) {
        this.buffer.enqueue(
          this.buildEvent({
            kind: "debug.error",
            code: "laptop_resume_detected",
            message: `Detected sleep/wake gap of ${gap}ms`,
            retryable: true,
            details: { gap_ms: gap }
          })
        );
        void this.tryConnect();
      }
    }, 5_000);
  }

  async stop(): Promise<void> {
    this.started = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    if (this.resumeTimer) {
      clearInterval(this.resumeTimer);
      this.resumeTimer = undefined;
    }

    await this.adapter.disconnect();
  }

  health(): LaptopBridgeHealthResponse {
    const status = this.adapter.getStatus();
    return {
      ok: true,
      bridge_id: this.config.bridgeId,
      mode: status.mode,
      adapter_state: status.state,
      glasses_connected: status.connected,
      upstream_queue_size: this.buffer.size(),
      last_delivery_at: this.lastDeliveryAt,
      last_delivery_error: this.lastDeliveryError,
      raw_ble_logging: this.config.rawBleDebug
    };
  }

  private async tryConnect(): Promise<void> {
    try {
      await this.adapter.connect();
      this.reconnectAttempt = 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.buffer.enqueue(
        this.buildEvent({
          kind: "debug.error",
          code: "adapter_connect_failed",
          message,
          retryable: true
        })
      );
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.started || this.reconnectTimer) {
      return;
    }

    const delayMs = calculateBackoffMs(
      this.reconnectAttempt,
      this.config.reconnectInitialMs,
      this.config.reconnectMaxMs
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.tryConnect();
    }, delayMs);
  }

  private async flush(): Promise<void> {
    const batch = this.buffer.peekBatch(this.config.upstreamMaxBatchSize);
    if (batch.length === 0) {
      return;
    }

    try {
      const result = await this.upstreamClient.deliver(batch);
      this.buffer.acknowledge([...result.acceptedEventIds, ...result.duplicateEventIds, ...result.rejectedEventIds]);
      this.lastDeliveryAt = new Date().toISOString();
      this.lastDeliveryError = undefined;
    } catch (error) {
      this.lastDeliveryError = error instanceof Error ? error.message : String(error);
      logLaptopBridgeEvent({
        event: "laptop_bridge_delivery_failed",
        bridgeId: this.config.bridgeId,
        error: this.lastDeliveryError
      });
    }
  }

  private normalizeSignal(signal: AdapterSignal): HardwareBridgeEvent {
    return this.buildEvent(signal as AdapterSignal);
  }

  private buildEvent(
    signal: AdapterSignal
  ): HardwareBridgeConnectionEvent | HardwareBridgeTelemetryEvent | HardwareBridgeInputEvent | HardwareBridgeErrorEvent | HardwareBridgeRawBleEvent {
    const base = {
      event_id: createBridgeEventId(),
      bridge_id: this.config.bridgeId,
      device_id: this.config.deviceId,
      sequence: this.sequence++,
      occurred_at: new Date().toISOString()
    };

    switch (signal.kind) {
      case "device.connection":
        return {
          ...base,
          kind: signal.kind,
          state: signal.state,
          reason: signal.reason,
          session_id: signal.sessionId,
          rssi: signal.rssi
        };
      case "telemetry.status":
        return {
          ...base,
          kind: signal.kind,
          battery_percent: signal.batteryPercent,
          charging: signal.charging,
          signal_strength: signal.signalStrength,
          status_text: signal.statusText
        };
      case "input.control":
        return {
          ...base,
          kind: signal.kind,
          control: signal.control,
          action: signal.action,
          value: signal.value
        };
      case "debug.error":
        return {
          ...base,
          kind: signal.kind,
          code: signal.code,
          message: signal.message,
          retryable: signal.retryable,
          details: signal.details
        };
      case "debug.raw_ble":
        return {
          ...base,
          kind: signal.kind,
          direction: signal.direction,
          characteristic_uuid: signal.characteristicUuid,
          payload_hex: signal.payloadHex
        };
    }
  }
}
