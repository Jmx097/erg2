import type { AdapterSignal, AdapterStatus, GlassesBleAdapter } from "./ble-adapter.js";

export class MockG2BleAdapter implements GlassesBleAdapter {
  private readonly listeners = new Set<(signal: AdapterSignal) => void>();
  private telemetryTimer?: ReturnType<typeof setInterval>;
  private inputTimer?: ReturnType<typeof setInterval>;
  private status: AdapterStatus = {
    mode: "mock",
    state: "idle",
    connected: false
  };

  async connect(): Promise<void> {
    this.setStatus({ state: "scanning", connected: false });
    this.emit({ kind: "device.connection", state: "scanning" });

    await delay(100);
    this.setStatus({ state: "connecting", connected: false });
    this.emit({ kind: "device.connection", state: "connecting" });

    await delay(100);
    this.setStatus({ state: "connected", connected: true });
    this.emit({ kind: "device.connection", state: "connected", sessionId: "mock-session" });

    this.telemetryTimer = setInterval(() => {
      this.emit({
        kind: "telemetry.status",
        batteryPercent: 84,
        charging: false,
        signalStrength: -58,
        statusText: "mock_link_healthy"
      });
    }, 2_000);

    this.inputTimer = setInterval(() => {
      this.emit({
        kind: "input.control",
        control: "tap",
        action: "activate",
        value: "mock_tap"
      });
    }, 5_000);
  }

  async disconnect(): Promise<void> {
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = undefined;
    }

    if (this.inputTimer) {
      clearInterval(this.inputTimer);
      this.inputTimer = undefined;
    }

    this.setStatus({ state: "disconnected", connected: false });
    this.emit({ kind: "device.connection", state: "disconnected", reason: "mock_disconnect" });
  }

  getStatus(): AdapterStatus {
    return { ...this.status };
  }

  onSignal(listener: (signal: AdapterSignal) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(signal: AdapterSignal): void {
    for (const listener of this.listeners) {
      listener(signal);
    }
  }

  private setStatus(next: Pick<AdapterStatus, "state" | "connected">): void {
    this.status = {
      ...this.status,
      ...next,
      lastError: next.connected ? undefined : this.status.lastError
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
