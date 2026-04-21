import Constants from "expo-constants";

interface ExpoExtraConfig {
  defaultRelayBaseUrl?: string;
  defaultDeviceDisplayName?: string;
  bleDeviceNamePrefix?: string;
  bleServiceUuid?: string;
  bleRxCharacteristicUuid?: string;
  bleTxCharacteristicUuid?: string;
  bleScanTimeoutMs?: number;
}

export interface MobileAppConfig {
  appVersion: string;
  platform: "ios" | "android";
  defaultRelayBaseUrl: string;
  defaultDeviceDisplayName: string;
  bleDeviceNamePrefix: string;
  bleServiceUuid?: string;
  bleRxCharacteristicUuid?: string;
  bleTxCharacteristicUuid?: string;
  bleScanTimeoutMs: number;
}

export function loadMobileAppConfig(): MobileAppConfig {
  const expoExtra = (Constants.expoConfig?.extra ?? {}) as ExpoExtraConfig;

  return {
    appVersion: Constants.expoConfig?.version ?? "0.1.0",
    platform: Constants.platform?.ios ? "ios" : "android",
    defaultRelayBaseUrl: process.env.EXPO_PUBLIC_DEFAULT_RELAY_BASE_URL?.trim() || expoExtra.defaultRelayBaseUrl || "",
    defaultDeviceDisplayName:
      process.env.EXPO_PUBLIC_DEFAULT_DEVICE_DISPLAY_NAME?.trim() || expoExtra.defaultDeviceDisplayName || "OpenClaw Mobile",
    bleDeviceNamePrefix:
      process.env.EXPO_PUBLIC_G2_BLE_DEVICE_NAME_PREFIX?.trim() || expoExtra.bleDeviceNamePrefix || "Even",
    bleServiceUuid: normalizeOptionalValue(process.env.EXPO_PUBLIC_G2_BLE_SERVICE_UUID, expoExtra.bleServiceUuid),
    bleRxCharacteristicUuid: normalizeOptionalValue(
      process.env.EXPO_PUBLIC_G2_BLE_RX_CHARACTERISTIC_UUID,
      expoExtra.bleRxCharacteristicUuid
    ),
    bleTxCharacteristicUuid: normalizeOptionalValue(
      process.env.EXPO_PUBLIC_G2_BLE_TX_CHARACTERISTIC_UUID,
      expoExtra.bleTxCharacteristicUuid
    ),
    bleScanTimeoutMs: parseNumber(process.env.EXPO_PUBLIC_G2_BLE_SCAN_TIMEOUT_MS, expoExtra.bleScanTimeoutMs, 10_000)
  };
}

function normalizeOptionalValue(envValue: string | undefined, fallback: string | undefined): string | undefined {
  const value = envValue?.trim() || fallback?.trim();
  return value || undefined;
}

function parseNumber(envValue: string | undefined, fallback: number | undefined, defaultValue: number): number {
  const parsed = Number(envValue ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}
