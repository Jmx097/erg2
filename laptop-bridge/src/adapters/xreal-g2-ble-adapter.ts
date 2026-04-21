import type { AdapterSignal, AdapterStatus, GlassesBleAdapter } from "./ble-adapter.js";

export interface XrealG2BleAdapterConfig {
  deviceNamePrefix: string;
  serviceUuid?: string;
  rxCharacteristicUuid?: string;
  txCharacteristicUuid?: string;
  rawBleDebug: boolean;
}

export class XrealG2BleAdapterStub implements GlassesBleAdapter {
  private readonly listeners = new Set<(signal: AdapterSignal) => void>();
  private status: AdapterStatus = {
    mode: "xreal_g2_ble_stub",
    state: "idle",
    connected: false
  };

  constructor(private readonly config: XrealG2BleAdapterConfig) {}

  async connect(): Promise<void> {
    this.setStatus({
      state: "scanning",
      connected: false,
      lastError: undefined
    });
    this.emit({ kind: "device.connection", state: "scanning" });

    if (!this.config.serviceUuid || !this.config.rxCharacteristicUuid || !this.config.txCharacteristicUuid) {
      const message =
        "Xreal G2 BLE adapter stub is waiting for service UUID plus RX/TX characteristic UUID configuration.";
      this.setStatus({
        state: "absent",
        connected: false,
        lastError: message
      });
      this.emit({
        kind: "debug.error",
        code: "g2_uuid_config_missing",
        message,
        retryable: false,
        details: {
          device_name_prefix: this.config.deviceNamePrefix,
          service_uuid_configured: Boolean(this.config.serviceUuid),
          rx_characteristic_configured: Boolean(this.config.rxCharacteristicUuid),
          tx_characteristic_configured: Boolean(this.config.txCharacteristicUuid)
        }
      });
      this.emit({
        kind: "device.connection",
        state: "absent",
        reason: "uuid_configuration_missing"
      });
      return;
    }

    // TODO: Replace this stub with a real Node BLE implementation that:
    // 1. scans for a device matching deviceNamePrefix
    // 2. pairs or reconnects to the G2 session
    // 3. subscribes to the RX characteristic
    // 4. writes control traffic to the TX characteristic
    // 5. emits parsed device events through the normalized adapter signal surface
    this.setStatus({
      state: "absent",
      connected: false,
      lastError: "Real Xreal G2 BLE transport is not implemented yet."
    });
    this.emit({
      kind: "debug.error",
      code: "g2_ble_transport_not_implemented",
      message: "Real Xreal G2 BLE transport is not implemented yet.",
      retryable: false,
      details: {
        device_name_prefix: this.config.deviceNamePrefix,
        service_uuid: this.config.serviceUuid,
        rx_characteristic_uuid: this.config.rxCharacteristicUuid,
        tx_characteristic_uuid: this.config.txCharacteristicUuid,
        raw_ble_debug: this.config.rawBleDebug
      }
    });
    this.emit({
      kind: "device.connection",
      state: "absent",
      reason: "transport_not_implemented"
    });
  }

  async disconnect(): Promise<void> {
    this.setStatus({
      state: "disconnected",
      connected: false
    });
    this.emit({
      kind: "device.connection",
      state: "disconnected",
      reason: "operator_disconnect"
    });
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

  private setStatus(next: Partial<AdapterStatus>): void {
    this.status = {
      ...this.status,
      ...next
    };
  }
}
