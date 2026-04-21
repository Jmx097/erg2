export type AdapterSignal =
  | {
      kind: "device.connection";
      state: "idle" | "scanning" | "pairing" | "connecting" | "connected" | "reconnecting" | "disconnected" | "absent";
      reason?: string;
      sessionId?: string;
      rssi?: number;
    }
  | {
      kind: "telemetry.status";
      batteryPercent?: number;
      charging?: boolean;
      signalStrength?: number;
      statusText?: string;
    }
  | {
      kind: "input.control";
      control: "tap" | "button" | "gesture" | "voice" | "unknown";
      action: "press" | "release" | "toggle" | "activate" | "unknown";
      value?: string;
    }
  | {
      kind: "debug.error";
      code: string;
      message: string;
      retryable: boolean;
      details?: Record<string, unknown>;
    }
  | {
      kind: "debug.raw_ble";
      direction: "rx" | "tx";
      characteristicUuid?: string;
      payloadHex: string;
    };

export interface AdapterStatus {
  mode: "mock" | "xreal_g2_ble_stub";
  state: "idle" | "scanning" | "pairing" | "connecting" | "connected" | "reconnecting" | "disconnected" | "absent";
  connected: boolean;
  lastError?: string;
}

export interface GlassesBleAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): AdapterStatus;
  onSignal(listener: (signal: AdapterSignal) => void): () => void;
}
