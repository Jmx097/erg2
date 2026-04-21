import { PermissionsAndroid, Platform } from "react-native";
import {
  BleManager,
  type BleError,
  type Characteristic,
  type Device,
  State as BleAdapterState
} from "react-native-ble-plx";
import type { BleBridge, BleConnectionState, BleDeviceMessage } from "../ble.js";

interface SubscriptionLike {
  remove(): void;
}

export interface EvenG2BleConfig {
  deviceNamePrefix: string;
  serviceUuid?: string;
  rxCharacteristicUuid?: string;
  txCharacteristicUuid?: string;
  scanTimeoutMs: number;
}

export function createReactNativeBleBridge(config: EvenG2BleConfig): BleBridge {
  return new ReactNativeEvenG2BleBridge(config);
}

class ReactNativeEvenG2BleBridge implements BleBridge {
  private readonly stateListeners = new Set<(state: BleConnectionState) => void>();
  private readonly messageListeners = new Set<(message: BleDeviceMessage) => void>();
  private readonly manager: BleManager | null;
  private readonly unavailableReason?: string;
  private readonly adapterSubscription?: SubscriptionLike;
  private readonly decoder = new TextDecoder();
  private currentState: BleConnectionState = { connected: false };
  private connectedDevice: Device | null = null;
  private notificationSubscription?: SubscriptionLike;
  private scanTimer?: ReturnType<typeof setTimeout>;
  private logicalDeviceId?: string;

  constructor(private readonly config: EvenG2BleConfig) {
    try {
      this.manager = new BleManager();
      this.adapterSubscription = this.manager.onStateChange((state) => {
        this.mergeState({
          adapterState: state,
          ...(state === BleAdapterState.PoweredOff
            ? {
                connected: false,
                reason: "Bluetooth is turned off on this phone."
              }
            : {})
        });
      }, true);
    } catch {
      this.manager = null;
      this.unavailableReason = "BLE native module unavailable. Use an Expo development build, not Expo Go.";
    }
  }

  async connect(deviceId: string): Promise<void> {
    this.logicalDeviceId = deviceId;

    if (!this.manager) {
      this.mergeState({
        connected: false,
        deviceId,
        reason: this.unavailableReason
      });
      return;
    }

    if (this.connectedDevice?.isConnected) {
      this.mergeState({
        connected: true,
        deviceId,
        peripheralId: this.connectedDevice.id,
        displayName: resolveDeviceName(this.connectedDevice),
        reason: undefined
      });
      return;
    }

    try {
      await this.ensurePermissions();
      await this.ensureAdapterReady();

      const discoveredDevice = await this.scanForMatchingDevice();
      if (!discoveredDevice) {
        this.mergeState({
          connected: false,
          deviceId,
          reason: `No BLE device matching "${this.config.deviceNamePrefix}" was found nearby.`
        });
        return;
      }

      const connectedDevice = await discoveredDevice.connect();
      await connectedDevice.discoverAllServicesAndCharacteristics();

      this.connectedDevice = connectedDevice;
      await this.subscribeToNotifications(connectedDevice);

      this.mergeState({
        connected: true,
        deviceId,
        peripheralId: connectedDevice.id,
        displayName: resolveDeviceName(connectedDevice),
        reason: undefined
      });
    } catch (error) {
      await this.disconnect();
      this.mergeState({
        connected: false,
        deviceId,
        reason: formatBleError(error)
      });
    }
  }

  async disconnect(): Promise<void> {
    this.clearScanTimer();
    await this.stopScan();
    this.notificationSubscription?.remove();
    this.notificationSubscription = undefined;

    if (this.connectedDevice && this.manager) {
      try {
        await this.manager.cancelDeviceConnection(this.connectedDevice.id);
      } catch {
        // Ignore disconnect races when the peripheral is already gone.
      }
    }

    this.connectedDevice = null;
    this.mergeState({
      connected: false,
      deviceId: this.logicalDeviceId,
      peripheralId: undefined,
      displayName: undefined
    });
  }

  async send(message: BleDeviceMessage): Promise<void> {
    if (!this.manager || !this.connectedDevice) {
      throw new Error("BLE device is not connected.");
    }

    if (!this.config.serviceUuid || !this.config.txCharacteristicUuid) {
      throw new Error("BLE write path is not configured. Set the service and TX characteristic UUIDs.");
    }

    const payload = message.type === "raw" ? message.payload : JSON.stringify(message);
    const encoded = bytesToBase64(new TextEncoder().encode(payload));

    await this.manager.writeCharacteristicWithoutResponseForDevice(
      this.connectedDevice.id,
      this.config.serviceUuid,
      this.config.txCharacteristicUuid,
      encoded
    );
  }

  onMessage(listener: (message: BleDeviceMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  onStateChange(listener: (state: BleConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    listener({ ...this.currentState });
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private async ensurePermissions(): Promise<void> {
    if (Platform.OS !== "android") {
      return;
    }

    const requiredPermissions = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
    ];

    if (Platform.Version <= 30) {
      requiredPermissions.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }

    const result = await PermissionsAndroid.requestMultiple(requiredPermissions);
    const denied = Object.entries(result).find(([, value]) => value !== PermissionsAndroid.RESULTS.GRANTED);

    if (denied) {
      throw new Error(`Bluetooth permission denied: ${denied[0]}`);
    }
  }

  private async ensureAdapterReady(): Promise<void> {
    if (!this.manager) {
      throw new Error(this.unavailableReason || "BLE is unavailable.");
    }

    const currentState = await this.manager.state();
    if (currentState === BleAdapterState.PoweredOn) {
      return;
    }

    if (currentState === BleAdapterState.PoweredOff) {
      throw new Error("Bluetooth is turned off on this phone.");
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        subscription.remove();
        reject(new Error("Bluetooth did not become ready in time."));
      }, 10_000);

      const subscription = this.manager!.onStateChange((state) => {
        if (state === BleAdapterState.PoweredOn) {
          clearTimeout(timeout);
          subscription.remove();
          resolve();
        }

        if (state === BleAdapterState.Unauthorized || state === BleAdapterState.Unsupported) {
          clearTimeout(timeout);
          subscription.remove();
          reject(new Error(`Bluetooth state is ${state}.`));
        }
      }, true);
    });
  }

  private async scanForMatchingDevice(): Promise<Device | null> {
    if (!this.manager) {
      return null;
    }

    const normalizedPrefix = this.config.deviceNamePrefix.trim().toLowerCase();
    return new Promise<Device | null>((resolve, reject) => {
      let settled = false;

      const finish = async (device: Device | null, error?: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        this.clearScanTimer();
        await this.stopScan();

        if (error) {
          reject(error);
          return;
        }

        resolve(device);
      };

      this.scanTimer = setTimeout(() => {
        void finish(null);
      }, this.config.scanTimeoutMs);

      this.manager!
        .startDeviceScan(this.config.serviceUuid ? [this.config.serviceUuid] : null, null, (error: BleError | null, device) => {
          if (error) {
            void finish(null, new Error(error.message));
            return;
          }

          if (!device) {
            return;
          }

          const deviceName = resolveDeviceName(device).toLowerCase();
          const matchesPrefix = normalizedPrefix ? deviceName.includes(normalizedPrefix) : true;
          const matchesService = Boolean(this.config.serviceUuid);

          if (matchesPrefix || matchesService) {
            void finish(device);
          }
        })
        .catch((error: unknown) => {
          void finish(null, error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  private async subscribeToNotifications(device: Device): Promise<void> {
    this.notificationSubscription?.remove();
    this.notificationSubscription = undefined;

    if (!this.config.serviceUuid || !this.config.rxCharacteristicUuid) {
      return;
    }

    this.notificationSubscription = device.monitorCharacteristicForService(
      this.config.serviceUuid,
      this.config.rxCharacteristicUuid,
      (error: BleError | null, characteristic: Characteristic | null) => {
        if (error) {
          this.mergeState({
            connected: false,
            deviceId: this.logicalDeviceId,
            peripheralId: this.connectedDevice?.id,
            displayName: this.connectedDevice ? resolveDeviceName(this.connectedDevice) : undefined,
            reason: error.message
          });
          return;
        }

        if (!characteristic?.value) {
          return;
        }

        this.emitMessage({
          type: "raw",
          payload: this.decoder.decode(base64ToBytes(characteristic.value))
        });
      }
    );
  }

  private async stopScan(): Promise<void> {
    if (!this.manager) {
      return;
    }

    try {
      await this.manager.stopDeviceScan();
    } catch {
      // Ignore scan-stop races when nothing is currently scanning.
    }
  }

  private clearScanTimer(): void {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = undefined;
    }
  }

  private mergeState(nextState: Partial<BleConnectionState>): void {
    this.currentState = {
      ...this.currentState,
      ...nextState
    };

    for (const listener of this.stateListeners) {
      listener({ ...this.currentState });
    }
  }

  private emitMessage(message: BleDeviceMessage): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }
}

function resolveDeviceName(device: Pick<Device, "localName" | "name" | "id">): string {
  return device.localName || device.name || device.id;
}

function formatBleError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "BLE operation failed.";
}

function bytesToBase64(bytes: Uint8Array): string {
  const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!;
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    const chunk = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);

    output += table[(chunk >> 18) & 63];
    output += table[(chunk >> 12) & 63];
    output += typeof b === "number" ? table[(chunk >> 6) & 63] : "=";
    output += typeof c === "number" ? table[chunk & 63] : "=";
  }

  return output;
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/=+$/, "");
  const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes: number[] = [];

  for (let index = 0; index < normalized.length; index += 4) {
    const a = table.indexOf(normalized[index] ?? "A");
    const b = table.indexOf(normalized[index + 1] ?? "A");
    const c = table.indexOf(normalized[index + 2] ?? "A");
    const d = table.indexOf(normalized[index + 3] ?? "A");
    const chunk = (a << 18) | (b << 12) | ((Math.max(c, 0) & 63) << 6) | (Math.max(d, 0) & 63);

    bytes.push((chunk >> 16) & 255);

    if (normalized[index + 2]) {
      bytes.push((chunk >> 8) & 255);
    }

    if (normalized[index + 3]) {
      bytes.push(chunk & 255);
    }
  }

  return Uint8Array.from(bytes);
}
