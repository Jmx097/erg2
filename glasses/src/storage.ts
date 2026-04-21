import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";

const STORAGE_KEYS = {
  relayBaseUrl: "openclaw.g2.relayBaseUrl",
  deviceId: "openclaw.g2.deviceId",
  refreshToken: "openclaw.g2.refreshToken",
  deviceDisplayName: "openclaw.g2.deviceDisplayName",
  defaultConversationId: "openclaw.g2.defaultConversationId"
} as const;

export interface StoredDeviceRegistration {
  relayBaseUrl: string;
  deviceId: string;
  refreshToken: string;
  deviceDisplayName: string;
  defaultConversationId: string;
}

export type LocalStorageBridge = Pick<EvenAppBridge, "getLocalStorage" | "setLocalStorage">;

export async function loadStoredRegistration(bridge: LocalStorageBridge): Promise<StoredDeviceRegistration | null> {
  const [relayBaseUrl, deviceId, refreshToken, deviceDisplayName, defaultConversationId] = await Promise.all([
    bridge.getLocalStorage(STORAGE_KEYS.relayBaseUrl),
    bridge.getLocalStorage(STORAGE_KEYS.deviceId),
    bridge.getLocalStorage(STORAGE_KEYS.refreshToken),
    bridge.getLocalStorage(STORAGE_KEYS.deviceDisplayName),
    bridge.getLocalStorage(STORAGE_KEYS.defaultConversationId)
  ]);

  if (!relayBaseUrl.trim() || !deviceId.trim() || !refreshToken.trim()) {
    return null;
  }

  return {
    relayBaseUrl: relayBaseUrl.trim(),
    deviceId: deviceId.trim(),
    refreshToken: refreshToken.trim(),
    deviceDisplayName: deviceDisplayName.trim() || "Even Hub device",
    defaultConversationId: defaultConversationId.trim() || "default"
  };
}

export async function saveStoredRegistration(
  bridge: LocalStorageBridge,
  registration: StoredDeviceRegistration
): Promise<void> {
  await Promise.all([
    bridge.setLocalStorage(STORAGE_KEYS.relayBaseUrl, registration.relayBaseUrl),
    bridge.setLocalStorage(STORAGE_KEYS.deviceId, registration.deviceId),
    bridge.setLocalStorage(STORAGE_KEYS.refreshToken, registration.refreshToken),
    bridge.setLocalStorage(STORAGE_KEYS.deviceDisplayName, registration.deviceDisplayName),
    bridge.setLocalStorage(STORAGE_KEYS.defaultConversationId, registration.defaultConversationId)
  ]);
}

export async function clearStoredRegistration(bridge: LocalStorageBridge): Promise<void> {
  await Promise.all(
    Object.values(STORAGE_KEYS).map((key) => {
      return bridge.setLocalStorage(key, "");
    })
  );
}
