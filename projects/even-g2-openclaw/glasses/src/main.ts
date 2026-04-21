import "./style.css";
import { createBridgeClientFromEnv, type BridgeClient } from "./bridge.js";
import { DisplayController } from "./display.js";
import {
  connectEvenBridge,
  isAbnormalExitEvent,
  isClickEvent,
  isDoubleClickEvent,
  isForegroundEnterEvent,
  isForegroundExitEvent
} from "./even.js";
import { getOrCreateInstallId } from "./session.js";

const CANNED_PROMPT = "Reply with one sentence confirming the Even G2 link to OpenClaw is alive.";

let inFlight = false;
let appReady = false;
let installId = "";
let display: DisplayController | null = null;
let bridgeClient: BridgeClient | null = null;

void boot();

async function boot(): Promise<void> {
  renderWebStatus("Waiting for Even bridge...");

  try {
    const evenBridge = await connectEvenBridge();
    display = new DisplayController(evenBridge);
    await display.create("OpenClaw G2\nStarting...");

    installId = await getOrCreateInstallId(evenBridge);
    bridgeClient = createBridgeClientFromEnv();

    evenBridge.onEvenHubEvent((event) => {
      if (isClickEvent(event)) {
        void sendCannedPrompt();
      } else if (isDoubleClickEvent(event)) {
        void showIdle("Canceled.\nClick to test OpenClaw.");
      } else if (isForegroundEnterEvent(event)) {
        void checkBridgeHealth("Resumed.\nChecking bridge...");
      } else if (isForegroundExitEvent(event) || isAbnormalExitEvent(event)) {
        inFlight = false;
      }
    });

    await checkBridgeHealth("Checking bridge...");
    appReady = true;
  } catch (error) {
    const message = displayError(error);
    renderWebStatus(message);
    await display?.render(message).catch(() => undefined);
  }
}

async function checkBridgeHealth(statusText: string): Promise<void> {
  await display?.render(statusText);
  renderWebStatus(statusText);

  try {
    await requireBridgeClient().health();
    await showIdle("Connected.\nClick to test OpenClaw.");
  } catch (error) {
    const message = `Bridge offline.\n${displayError(error)}`;
    await display?.render(message);
    renderWebStatus(message);
  }
}

async function sendCannedPrompt(): Promise<void> {
  if (!appReady || inFlight) {
    return;
  }

  inFlight = true;
  await display?.render("Sending...");
  renderWebStatus("Sending canned prompt to OpenClaw...");

  try {
    const result = await requireBridgeClient().sendTurn(installId, CANNED_PROMPT);
    await display?.render(result.reply || "OpenClaw replied with no text.");
    renderWebStatus(result.reply);
  } catch (error) {
    const message = `OpenClaw error.\n${displayError(error)}`;
    await display?.render(message);
    renderWebStatus(message);
  } finally {
    inFlight = false;
  }
}

async function showIdle(message: string): Promise<void> {
  await display?.render(message);
  renderWebStatus(message);
}

function requireBridgeClient(): BridgeClient {
  if (!bridgeClient) {
    throw new Error("Bridge client is not initialized");
  }

  return bridgeClient;
}

function displayError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 220);
  }

  return "Unknown error";
}

function renderWebStatus(message: string): void {
  const status = document.querySelector("#status");
  if (status) {
    status.textContent = message;
  }
}
