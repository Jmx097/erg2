import type { RegisterDeviceRequest } from "@openclaw/protocol";
import appMeta from "../app.json";
import { BridgeApiError, BridgeClient } from "./bridge.js";
import { createPromptId, expiresWithin } from "./session.js";
import {
  clearStoredRegistration,
  loadStoredRegistration,
  saveStoredRegistration,
  type LocalStorageBridge,
  type StoredDeviceRegistration
} from "./storage.js";
import { validatePairingForm, type PairingFormErrors } from "./validation.js";

const ACCESS_REFRESH_WINDOW_MS = 60_000;
const DEFAULT_PROMPT = "Reply with one sentence confirming the Even G2 link to OpenClaw is alive.";

export type AppStatus =
  | "booting"
  | "unpaired"
  | "pairing"
  | "connected"
  | "request_in_progress"
  | "repair_required"
  | "reconnect_needed";

export interface ControllerSnapshot {
  status: AppStatus;
  statusDetail: string;
  hudText: string;
  lastReply: string;
  relayBaseUrl: string;
  pairingCode: string;
  deviceDisplayName: string;
  promptDraft: string;
  pairingErrors: PairingFormErrors;
  accessTokenExpiresAt?: string;
  storedRegistration: StoredDeviceRegistration | null;
  pendingPromptId?: string;
  pendingPromptText?: string;
  lastError?: string;
}

export class EvenHubAppController {
  private readonly listeners = new Set<(snapshot: ControllerSnapshot) => void>();
  private snapshot: ControllerSnapshot = {
    status: "booting",
    statusDetail: "Waiting for Even bridge...",
    hudText: "OpenClaw G2\nWaiting for Even bridge...",
    lastReply: "",
    relayBaseUrl: import.meta.env.VITE_DEFAULT_RELAY_BASE_URL?.trim() || "",
    pairingCode: "",
    deviceDisplayName: import.meta.env.VITE_DEFAULT_DEVICE_DISPLAY_NAME?.trim() || "OpenClaw G2",
    promptDraft: DEFAULT_PROMPT,
    pairingErrors: {},
    storedRegistration: null
  };
  private accessToken = "";
  private currentAbortController: AbortController | null = null;
  private backgrounded = false;

  constructor(
    private readonly bridge: LocalStorageBridge,
    private readonly api: BridgeClient = new BridgeClient(),
    private readonly now: () => Date = () => new Date()
  ) {}

  subscribe(listener: (snapshot: ControllerSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): ControllerSnapshot {
    return this.snapshot;
  }

  async boot(): Promise<void> {
    this.updateSnapshot({
      status: "booting",
      statusDetail: "Loading paired device...",
      hudText: "OpenClaw G2\nLoading..."
    });

    const storedRegistration = await loadStoredRegistration(this.bridge);
    if (!storedRegistration) {
      this.updateSnapshot({
        status: "unpaired",
        statusDetail: "Pair this client from the phone-side form to continue.",
        hudText: "Pairing needed.\nUse phone to connect.",
        storedRegistration: null
      });
      return;
    }

    this.updateSnapshot({
      relayBaseUrl: storedRegistration.relayBaseUrl,
      deviceDisplayName: storedRegistration.deviceDisplayName,
      storedRegistration
    });

    await this.resumeStoredSession("Reconnecting to OpenClaw...");
  }

  setPairingField(field: "relayBaseUrl" | "pairingCode" | "deviceDisplayName", value: string): void {
    const nextErrors = { ...this.snapshot.pairingErrors };
    delete nextErrors[field];
    this.updateSnapshot({
      [field]: value,
      pairingErrors: nextErrors
    } as Partial<ControllerSnapshot>);
  }

  setPromptDraft(value: string): void {
    this.updateSnapshot({ promptDraft: value });
  }

  async submitPairing(): Promise<void> {
    const validation = validatePairingForm({
      relayBaseUrl: this.snapshot.relayBaseUrl,
      pairingCode: this.snapshot.pairingCode,
      deviceDisplayName: this.snapshot.deviceDisplayName
    });

    if (!validation.ok) {
      this.updateSnapshot({
        pairingErrors: validation.errors,
        statusDetail: "Fix the highlighted pairing fields.",
        hudText: "Pairing needed.\nCheck phone form."
      });
      return;
    }

    this.updateSnapshot({
      status: "pairing",
      statusDetail: "Redeeming pairing code...",
      hudText: "Pairing...\nRedeeming code.",
      pairingErrors: {},
      lastError: undefined
    });

    try {
      const redeemed = await this.api.redeemPairing(validation.value.relayBaseUrl, validation.value.pairingCode);
      const registerRequest: RegisterDeviceRequest = {
        device_display_name: validation.value.deviceDisplayName,
        platform: "even_hub",
        app_version: appMeta.version,
        client_type: "even_hub"
      };
      const registered = await this.api.registerDevice(
        validation.value.relayBaseUrl,
        redeemed.bootstrap_token,
        registerRequest
      );

      this.accessToken = registered.access_token;
      const storedRegistration: StoredDeviceRegistration = {
        relayBaseUrl: validation.value.relayBaseUrl,
        deviceId: registered.device_id,
        refreshToken: registered.refresh_token,
        deviceDisplayName: validation.value.deviceDisplayName,
        defaultConversationId: registered.default_conversation_id
      };
      await saveStoredRegistration(this.bridge, storedRegistration);

      this.updateSnapshot({
        storedRegistration,
        accessTokenExpiresAt: registered.access_expires_at,
        pairingCode: "",
        relayBaseUrl: storedRegistration.relayBaseUrl,
        deviceDisplayName: storedRegistration.deviceDisplayName
      });

      await this.api.health(storedRegistration.relayBaseUrl);
      this.updateSnapshot({
        status: "connected",
        statusDetail: "Connected. Single click sends the current prompt.",
        hudText: "Connected.\nClick to ask OpenClaw.",
        lastError: undefined
      });
    } catch (error) {
      this.handleOperationalError(error, {
        reconnectStatusDetail: "Pairing failed. Check the relay URL and pairing code.",
        reconnectHudText: "Pairing failed.\nCheck phone form."
      });
    }
  }

  async handleForegroundEnter(): Promise<void> {
    this.backgrounded = false;

    if (!this.snapshot.storedRegistration) {
      this.updateSnapshot({
        status: "unpaired",
        statusDetail: "Pair this client from the phone-side form to continue.",
        hudText: "Pairing needed.\nUse phone to connect."
      });
      return;
    }

    await this.resumeStoredSession("Resumed. Checking OpenClaw...");
  }

  handleForegroundExit(): void {
    this.backgrounded = true;
    this.currentAbortController?.abort();
    this.currentAbortController = null;
    this.updateSnapshot({
      status: this.snapshot.storedRegistration ? "reconnect_needed" : "unpaired",
      statusDetail: this.snapshot.storedRegistration
        ? "Backgrounded. Tap reconnect or foreground again to resume."
        : "Pair this client from the phone-side form to continue.",
      hudText: this.snapshot.storedRegistration ? "Reconnect needed.\nResume in phone app." : "Pairing needed.\nUse phone to connect."
    });
  }

  handleAbnormalExit(): void {
    this.currentAbortController?.abort();
    this.currentAbortController = null;
    this.updateSnapshot({
      status: this.snapshot.storedRegistration ? "reconnect_needed" : "unpaired",
      statusDetail: this.snapshot.storedRegistration
        ? "The host app exited unexpectedly. Foreground again to reconnect."
        : "Pair this client from the phone-side form to continue.",
      hudText: this.snapshot.storedRegistration ? "Reconnect needed.\nHost app restarted." : "Pairing needed.\nUse phone to connect."
    });
  }

  async reconnect(): Promise<void> {
    if (!this.snapshot.storedRegistration) {
      this.updateSnapshot({
        status: "unpaired",
        statusDetail: "Pair this client from the phone-side form to continue.",
        hudText: "Pairing needed.\nUse phone to connect."
      });
      return;
    }

    await this.resumeStoredSession("Reconnecting to OpenClaw...");
  }

  async refreshCurrentSession(): Promise<void> {
    if (!this.snapshot.storedRegistration) {
      return;
    }

    try {
      await this.refreshAccessToken();
      this.updateSnapshot({
        status: "connected",
        statusDetail: "Session refreshed.",
        hudText: "Connected.\nSession refreshed."
      });
    } catch (error) {
      this.handleOperationalError(error, {
        reconnectStatusDetail: "Session refresh failed.",
        reconnectHudText: "Refresh failed.\nCheck connection."
      });
    }
  }

  async sendPrompt(): Promise<void> {
    if (!this.snapshot.storedRegistration) {
      this.updateSnapshot({
        status: "unpaired",
        statusDetail: "Pair this client before sending prompts.",
        hudText: "Pairing needed.\nUse phone to connect."
      });
      return;
    }

    if (this.currentAbortController) {
      return;
    }

    const promptText = (this.snapshot.pendingPromptText || this.snapshot.promptDraft).trim();
    if (!promptText) {
      this.updateSnapshot({
        statusDetail: "Enter a prompt first.",
        hudText: "No prompt set.\nUse phone form."
      });
      return;
    }

    const promptId = this.snapshot.pendingPromptId || createPromptId();
    this.currentAbortController = new AbortController();
    this.updateSnapshot({
      status: "request_in_progress",
      statusDetail: "Sending prompt to OpenClaw...",
      hudText: "Sending...\nOpenClaw is thinking.",
      pendingPromptId: promptId,
      pendingPromptText: promptText,
      lastError: undefined
    });

    try {
      await this.ensureFreshSession();
      const registration = this.requireStoredRegistration();
      const response = await this.sendTurnWithRetry(
        registration.relayBaseUrl,
        promptId,
        registration.defaultConversationId,
        promptText,
        this.currentAbortController.signal
      );

      this.currentAbortController = null;
      this.updateSnapshot({
        status: "connected",
        statusDetail: `Request ${response.request_id} completed.`,
        hudText: response.reply || "OpenClaw replied with no text.",
        lastReply: response.reply,
        pendingPromptId: undefined,
        pendingPromptText: undefined
      });
    } catch (error) {
      const wasBackgrounded = this.backgrounded;
      this.currentAbortController = null;

      if (error instanceof Error && error.name === "AbortError") {
        this.updateSnapshot({
          status: wasBackgrounded ? "reconnect_needed" : "connected",
          statusDetail: wasBackgrounded
            ? "Prompt interrupted while backgrounded. Reconnect to retry."
            : "Prompt canceled.",
          hudText: wasBackgrounded ? "Reconnect needed.\nPrompt paused." : "Canceled.\nClick to send again."
        });
        return;
      }

      this.handleOperationalError(error, {
        reconnectStatusDetail: "Prompt failed. Reconnect and retry.",
        reconnectHudText: "OpenClaw error.\nReconnect to retry."
      });
    }
  }

  cancelOrReturnIdle(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
      this.updateSnapshot({
        status: "connected",
        statusDetail: "Prompt canceled.",
        hudText: "Canceled.\nClick to send again.",
        pendingPromptId: undefined,
        pendingPromptText: undefined
      });
      return;
    }

    this.updateSnapshot({
      status: this.snapshot.storedRegistration ? "connected" : "unpaired",
      statusDetail: this.snapshot.storedRegistration
        ? "Connected. Single click sends the current prompt."
        : "Pair this client from the phone-side form to continue.",
      hudText: this.snapshot.storedRegistration ? "Connected.\nClick to ask OpenClaw." : "Pairing needed.\nUse phone to connect."
    });
  }

  async repair(): Promise<void> {
    await clearStoredRegistration(this.bridge);
    this.accessToken = "";
    this.updateSnapshot({
      status: "unpaired",
      statusDetail: "Stored session cleared. Pair again to continue.",
      hudText: "Pairing needed.\nUse phone to connect.",
      storedRegistration: null,
      accessTokenExpiresAt: undefined,
      pendingPromptId: undefined,
      pendingPromptText: undefined,
      lastReply: ""
    });
  }

  private async resumeStoredSession(statusDetail: string): Promise<void> {
    try {
      this.updateSnapshot({
        status: "booting",
        statusDetail,
        hudText: "Reconnecting...\nChecking OpenClaw."
      });
      await this.ensureFreshSession();
      const registration = this.requireStoredRegistration();
      await this.api.health(registration.relayBaseUrl);
      this.updateSnapshot({
        status: "connected",
        statusDetail: "Connected. Single click sends the current prompt.",
        hudText: "Connected.\nClick to ask OpenClaw.",
        lastError: undefined
      });
    } catch (error) {
      this.handleOperationalError(error, {
        reconnectStatusDetail: "Reconnect needed. The saved session could not be restored.",
        reconnectHudText: "Reconnect needed.\nCheck connection."
      });
    }
  }

  private async ensureFreshSession(): Promise<void> {
    if (!this.snapshot.storedRegistration) {
      throw new Error("No stored registration");
    }

    if (!this.accessToken || expiresWithin(this.snapshot.accessTokenExpiresAt, ACCESS_REFRESH_WINDOW_MS, this.now())) {
      await this.refreshAccessToken();
    }
  }

  private async refreshAccessToken(): Promise<void> {
    const registration = this.requireStoredRegistration();
    const refreshed = await this.api.refreshSession(registration.relayBaseUrl, {
      device_id: registration.deviceId,
      refresh_token: registration.refreshToken
    });

    this.accessToken = refreshed.access_token;
    const storedRegistration: StoredDeviceRegistration = {
      ...registration,
      refreshToken: refreshed.refresh_token
    };
    await saveStoredRegistration(this.bridge, storedRegistration);
    this.updateSnapshot({
      storedRegistration,
      accessTokenExpiresAt: refreshed.access_expires_at,
      relayBaseUrl: storedRegistration.relayBaseUrl,
      deviceDisplayName: storedRegistration.deviceDisplayName
    });
  }

  private async sendTurnWithRetry(
    relayBaseUrl: string,
    promptId: string,
    conversationId: string,
    text: string,
    signal: AbortSignal
  ) {
    try {
      return await this.api.sendTurn(
        relayBaseUrl,
        this.accessToken,
        {
          conversation_id: conversationId,
          prompt_id: promptId,
          text
        },
        signal
      );
    } catch (error) {
      if (error instanceof BridgeApiError && error.code === "access_invalid") {
        await this.refreshAccessToken();
        return this.api.sendTurn(
          relayBaseUrl,
          this.accessToken,
          {
            conversation_id: conversationId,
            prompt_id: promptId,
            text
          },
          signal
        );
      }

      throw error;
    }
  }

  private requireStoredRegistration(): StoredDeviceRegistration {
    if (!this.snapshot.storedRegistration) {
      throw new Error("No stored registration");
    }

    return this.snapshot.storedRegistration;
  }

  private handleOperationalError(
    error: unknown,
    messages: {
      reconnectStatusDetail: string;
      reconnectHudText: string;
    }
  ): void {
    if (error instanceof BridgeApiError && isRepairRequiredCode(error.code)) {
      this.accessToken = "";
      this.updateSnapshot({
        status: "repair_required",
        statusDetail: "This device needs to be repaired or re-paired.",
        hudText: "Repair needed.\nUse phone to re-pair.",
        lastError: error.message
      });
      return;
    }

    this.updateSnapshot({
      status: this.snapshot.storedRegistration ? "reconnect_needed" : "unpaired",
      statusDetail: this.snapshot.storedRegistration
        ? messages.reconnectStatusDetail
        : "Pair this client from the phone-side form to continue.",
      hudText: this.snapshot.storedRegistration ? messages.reconnectHudText : "Pairing needed.\nUse phone to connect.",
      lastError: error instanceof Error ? error.message : "Unknown error"
    });
  }

  private updateSnapshot(next: Partial<ControllerSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...next
    };

    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}

function isRepairRequiredCode(code: string | undefined): boolean {
  return code === "device_revoked" || code === "device_inactive" || code === "refresh_reuse_detected";
}
