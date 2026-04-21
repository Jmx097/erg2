#!/usr/bin/env node

import fs from "node:fs";

const RELAY_BASE_URL = requiredEnv("RELAY_BASE_URL");
const ADMIN_API_TOKEN = requiredEnv("ADMIN_API_TOKEN");
const DEVICE_DISPLAY_NAME = process.env.STAGING_DEVICE_DISPLAY_NAME || "Staging Smoke Device";
const PLATFORM = process.env.STAGING_PLATFORM || "ios";
const APP_VERSION = process.env.STAGING_APP_VERSION || "0.1.0-staging";
const CONVERSATION_ID = process.env.STAGING_CONVERSATION_ID || "default";
const PROMPT_TEXT =
  process.env.STAGING_PROMPT_TEXT || "Reply with one short sentence confirming the staging relay path is healthy.";
const REVOKE_REASON = process.env.STAGING_REVOKE_REASON || "staging_smoke_complete";
const TIMEOUT_MS = readPositiveInteger(process.env.STAGING_TIMEOUT_MS, 15_000);
const REPORT_PATH = process.env.STAGING_REPORT_PATH;

const report = {
  relay_base_url: RELAY_BASE_URL,
  started_at: new Date().toISOString(),
  steps: [],
  outcome: "running"
};

async function main() {
  await recordStep("health", async () => {
    const response = await fetchJson("/v1/health", { method: "GET" });
    if (response.status !== 200 || response.body?.ok !== true) {
      throw new Error(`Expected /v1/health to return ok=true, got ${response.status}`);
    }
    return response.body;
  });

  await recordStep("ready", async () => {
    const response = await fetchJson("/v1/ready", { method: "GET" });
    if (response.status !== 200 || response.body?.ready !== true) {
      throw new Error(`Expected /v1/ready to return ready=true, got ${response.status}`);
    }
    if (response.body?.storage !== "postgres") {
      throw new Error(`Expected readiness storage=postgres, got ${String(response.body?.storage)}`);
    }
    if (response.body?.checks?.database !== true || response.body?.checks?.openclaw !== true) {
      throw new Error("Expected readiness checks.database and checks.openclaw to both be true");
    }
    return response.body;
  });

  const pairing = await recordStep("pairing_session_create", async () => {
    const response = await fetchJson("/v1/pairing/sessions", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        platform: PLATFORM,
        device_display_name_hint: DEVICE_DISPLAY_NAME
      })
    });
    if (response.status !== 201 || typeof response.body?.pairing_code !== "string") {
      throw new Error(`Expected pairing session creation to return 201, got ${response.status}`);
    }
    return response.body;
  });

  const redeemed = await recordStep("pairing_redeem", async () => {
    const response = await fetchJson("/v1/pairing/redeem", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        pairing_session_id: pairing.pairing_session_id,
        pairing_code: pairing.pairing_code
      })
    });
    if (response.status !== 200 || typeof response.body?.bootstrap_token !== "string") {
      throw new Error(`Expected pairing redeem to return 200, got ${response.status}`);
    }
    return response.body;
  });

  const registered = await recordStep("device_register", async () => {
    const response = await fetchJson("/v1/devices/register", {
      method: "POST",
      headers: bearerJsonHeaders(redeemed.bootstrap_token),
      body: JSON.stringify({
        device_display_name: DEVICE_DISPLAY_NAME,
        platform: PLATFORM,
        app_version: APP_VERSION
      })
    });
    if (response.status !== 201 || typeof response.body?.device_id !== "string") {
      throw new Error(`Expected device registration to return 201, got ${response.status}`);
    }
    return response.body;
  });

  const refreshed = await recordStep("refresh_rotate", async () => {
    const response = await fetchJson("/v1/auth/refresh", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        device_id: registered.device_id,
        refresh_token: registered.refresh_token
      })
    });
    if (response.status !== 200 || typeof response.body?.refresh_token !== "string") {
      throw new Error(`Expected refresh rotation to return 200, got ${response.status}`);
    }
    if (response.body.refresh_token === registered.refresh_token) {
      throw new Error("Expected refresh rotation to issue a new refresh token");
    }
    return response.body;
  });

  await recordStep("refresh_reuse_rejected", async () => {
    const response = await fetchJson("/v1/auth/refresh", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        device_id: registered.device_id,
        refresh_token: registered.refresh_token
      })
    });
    if (response.status === 200) {
      throw new Error("Expected reuse of the original refresh token to be rejected");
    }
    return response.body;
  });

  const listedAfterReuse = await recordStep("device_status_after_reuse", async () => {
    const response = await fetchJson("/v1/devices", {
      method: "GET",
      headers: adminHeaders()
    });
    if (response.status !== 200 || !Array.isArray(response.body?.devices)) {
      throw new Error(`Expected device list to return 200, got ${response.status}`);
    }
    const matchedDevice = response.body.devices.find((device) => device.device_id === registered.device_id);
    if (!matchedDevice) {
      throw new Error(`Expected device ${registered.device_id} to appear in /v1/devices`);
    }
    if (matchedDevice.status !== "repair_required") {
      throw new Error(`Expected refresh reuse to mark device repair_required, got ${matchedDevice.status}`);
    }
    return matchedDevice;
  });

  const replacementPairing = await recordStep("pairing_session_create_repair_path", async () => {
    const response = await fetchJson("/v1/pairing/sessions", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        platform: PLATFORM,
        device_display_name_hint: `${DEVICE_DISPLAY_NAME} Repaired`
      })
    });
    if (response.status !== 201 || typeof response.body?.pairing_code !== "string") {
      throw new Error(`Expected repair-path pairing session creation to return 201, got ${response.status}`);
    }
    return response.body;
  });

  const replacementRedeem = await recordStep("pairing_redeem_repair_path", async () => {
    const response = await fetchJson("/v1/pairing/redeem", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        pairing_session_id: replacementPairing.pairing_session_id,
        pairing_code: replacementPairing.pairing_code
      })
    });
    if (response.status !== 200 || typeof response.body?.bootstrap_token !== "string") {
      throw new Error(`Expected repair-path redeem to return 200, got ${response.status}`);
    }
    return response.body;
  });

  const replacementRegistered = await recordStep("device_register_repair_path", async () => {
    const response = await fetchJson("/v1/devices/register", {
      method: "POST",
      headers: bearerJsonHeaders(replacementRedeem.bootstrap_token),
      body: JSON.stringify({
        device_display_name: `${DEVICE_DISPLAY_NAME} Repaired`,
        platform: PLATFORM,
        app_version: APP_VERSION
      })
    });
    if (response.status !== 201 || typeof response.body?.device_id !== "string") {
      throw new Error(`Expected repair-path registration to return 201, got ${response.status}`);
    }
    return response.body;
  });

  const ticket = await recordStep("ws_ticket_issue", async () => {
    const response = await fetchJson("/v1/auth/ws-ticket", {
      method: "POST",
      headers: bearerJsonHeaders(replacementRegistered.access_token),
      body: JSON.stringify({ conversation_id: CONVERSATION_ID })
    });
    if (response.status !== 201 || typeof response.body?.ws_url !== "string") {
      throw new Error(`Expected websocket ticket issue to return 201, got ${response.status}`);
    }
    return response.body;
  });

  const relayResult = await recordStep("relay_ws_prompt_round_trip", async () => {
    return connectAndExerciseRelay(ticket.ws_url, CONVERSATION_ID, PROMPT_TEXT);
  });

  await recordStep("device_revoke_disconnect", async () => {
    const revokePromise = relayResult.waitForRevocation();

    const response = await fetchJson(`/v1/devices/${replacementRegistered.device_id}/revoke`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ reason: REVOKE_REASON })
    });
    if (response.status !== 200) {
      throw new Error(`Expected revoke to return 200, got ${response.status}`);
    }

    const revoked = await revokePromise;
    if (revoked.reason !== REVOKE_REASON) {
      throw new Error(`Expected revoked reason ${REVOKE_REASON}, got ${revoked.reason}`);
    }

    return {
      revoke_response: response.body,
      relay_revoked: revoked
    };
  });

  report.completed_at = new Date().toISOString();
  report.outcome = "passed";
  writeReportIfNeeded();
  console.log(JSON.stringify(report, null, 2));
}

async function connectAndExerciseRelay(wsUrl, conversationId, promptText) {
  const socket = new WebSocket(wsUrl);
  const promptId = `prm_stage_${Date.now().toString(36)}`;
  let readyMessage = null;
  let finalReply = null;
  let deltaSeen = false;
  let revokedResolver;
  let revokedRejecter;
  const revokedPromise = new Promise((resolve, reject) => {
    revokedResolver = resolve;
    revokedRejecter = reject;
  });

  const connectionOpen = onceWithTimeout(
    socket,
    "open",
    TIMEOUT_MS,
    "Timed out waiting for websocket to open"
  );

  const closePromise = new Promise((resolve) => {
    socket.addEventListener("close", (event) => {
      resolve({ code: event.code, reason: event.reason });
    }, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = parseJson(String(event.data));

    if (message.type === "ping" && typeof message.ping_id === "string") {
      socket.send(JSON.stringify({ type: "pong", ping_id: message.ping_id }));
      return;
    }

    if (message.type === "ready") {
      readyMessage = message;
      socket.send(
        JSON.stringify({
          type: "prompt",
          conversation_id: conversationId,
          prompt_id: promptId,
          text: promptText
        })
      );
      return;
    }

    if (message.type === "reply.delta") {
      deltaSeen = true;
      return;
    }

    if (message.type === "reply.final") {
      finalReply = message;
      return;
    }

    if (message.type === "revoked") {
      revokedResolver({
        reason: message.reason,
        close: closePromise
      });
      return;
    }

    if (message.type === "error") {
      revokedRejecter(new Error(`Relay returned error ${message.code}: ${message.message}`));
    }
  });

  socket.addEventListener("error", (event) => {
    revokedRejecter(new Error(`WebSocket error: ${String(event.message || "unknown")}`));
  }, { once: true });

  await connectionOpen;

  socket.send(
    JSON.stringify({
      type: "hello",
      conversation_id: conversationId,
      client_instance_id: `inst_stage_${Date.now().toString(36)}`,
      app_state: "foreground"
    })
  );

  const deadline = Date.now() + TIMEOUT_MS;
  while ((!readyMessage || !finalReply) && Date.now() < deadline) {
    await sleep(100);
  }

  if (!readyMessage) {
    socket.close();
    throw new Error("Timed out waiting for relay ready message");
  }

  if (!finalReply) {
    socket.close();
    throw new Error("Timed out waiting for relay final reply");
  }

  return {
    ready: readyMessage,
    reply_final: finalReply,
    reply_delta_seen: deltaSeen,
    waitForRevocation: async () => {
      const revoked = await revokedPromise;
      const close = await revoked.close;
      if (close.code !== 4003) {
        throw new Error(`Expected revoke close code 4003, got ${close.code}`);
      }
      return {
        reason: revoked.reason,
        close_code: close.code,
        close_reason: close.reason
      };
    }
  };
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function jsonHeaders() {
  return {
    "content-type": "application/json"
  };
}

function bearerJsonHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json"
  };
}

function adminHeaders() {
  return bearerJsonHeaders(ADMIN_API_TOKEN);
}

async function fetchJson(path, init) {
  const response = await fetch(`${RELAY_BASE_URL.replace(/\/+$/, "")}${path}`, init);
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function recordStep(name, fn) {
  const startedAt = new Date().toISOString();
  try {
    const detail = await fn();
    report.steps.push({
      name,
      status: "passed",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      detail
    });
    return detail;
  } catch (error) {
    report.steps.push({
      name,
      status: "failed",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    });
    report.completed_at = new Date().toISOString();
    report.outcome = "failed";
    writeReportIfNeeded();
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    throw error;
  }
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function onceWithTimeout(target, eventName, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    target.addEventListener(
      eventName,
      (event) => {
        clearTimeout(timeout);
        resolve(event);
      },
      { once: true }
    );
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeReportIfNeeded() {
  if (!REPORT_PATH) {
    return;
  }

  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  if (process.exitCode !== 1) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});
