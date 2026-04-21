import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";

const INSTALL_ID_KEY = "openclaw.g2.installId";

export async function getOrCreateInstallId(bridge: Pick<EvenAppBridge, "getLocalStorage" | "setLocalStorage">): Promise<string> {
  const existing = (await bridge.getLocalStorage(INSTALL_ID_KEY)).trim();

  if (existing) {
    return existing;
  }

  const installId = createInstallId();
  await bridge.setLocalStorage(INSTALL_ID_KEY, installId);
  return installId;
}

function createInstallId(): string {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `g2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
