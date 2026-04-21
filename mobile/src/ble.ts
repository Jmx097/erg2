export interface BleDeviceMessage {
  type: string;
  payload: string;
}

export interface BleConnectionState {
  connected: boolean;
  deviceId?: string;
  peripheralId?: string;
  displayName?: string;
  adapterState?: string;
  reason?: string;
}

export interface BleBridge {
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  send(message: BleDeviceMessage): Promise<void>;
  onMessage(listener: (message: BleDeviceMessage) => void): () => void;
  onStateChange(listener: (state: BleConnectionState) => void): () => void;
}

export class NoopBleBridge implements BleBridge {
  private readonly stateListeners = new Set<(state: BleConnectionState) => void>();

  async connect(deviceId: string): Promise<void> {
    this.emitState({
      connected: false,
      deviceId,
      reason: "BLE is not configured for this build."
    });
    return;
  }

  async disconnect(): Promise<void> {
    this.emitState({
      connected: false
    });
    return;
  }

  async send(_message: BleDeviceMessage): Promise<void> {
    return;
  }

  onMessage(_listener: (message: BleDeviceMessage) => void): () => void {
    return () => undefined;
  }

  onStateChange(listener: (state: BleConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    listener({ connected: false });
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private emitState(state: BleConnectionState): void {
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }
}
