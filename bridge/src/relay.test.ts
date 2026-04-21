import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { createBridgeRuntime, startBridgeServer, type OpenClawChatPort } from "./server.js";
import { createTestConfig } from "./test-config.js";

const startedServers: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  while (startedServers.length > 0) {
    await startedServers.pop()!.close();
  }
});

describe("RelayServer", () => {
  it("accepts websocket tickets and relays prompt replies", async () => {
    const openclaw = mockOpenClaw("Relay reply from OpenClaw.");
    const config = createTestConfig();
    const started = await startBridgeServer(config, createBridgeRuntime(config, openclaw), { port: 0 });
    startedServers.push(started);

    const session = await registerDevice(started.port);
    const ticket = await issueWebSocketTicket(started.port, session.accessToken);
    const ws = new WebSocket(`ws://127.0.0.1:${started.port}/v1/relay/ws?ticket=${ticket}`);
    const messages = createMessageCollector(ws);

    await waitForOpen(ws);
    ws.send(JSON.stringify({ type: "hello", conversation_id: "default" }));
    expect(await messages.waitFor("ready")).toMatchObject({
      type: "ready",
      heartbeat_interval_seconds: 25
    });

    ws.send(
      JSON.stringify({
        type: "prompt",
        conversation_id: "default",
        prompt_id: "prm_123",
        text: "ping"
      })
    );

    expect(await messages.waitFor("reply.delta")).toMatchObject({
      type: "reply.delta",
      prompt_id: "prm_123",
      delta: "Relay reply from OpenClaw."
    });
    expect(await messages.waitFor("reply.final")).toMatchObject({
      type: "reply.final",
      prompt_id: "prm_123",
      text: "Relay reply from OpenClaw."
    });
    expect(openclaw.createChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: expect.stringMatching(/^mobile:dev_[0-9a-f]{20}:conversation:default$/),
        messageChannel: "mobile"
      })
    );

    ws.close();
  });

  it("enforces single-use websocket tickets", async () => {
    const config = createTestConfig();
    const started = await startBridgeServer(config, createBridgeRuntime(config, mockOpenClaw("alive")), { port: 0 });
    startedServers.push(started);

    const session = await registerDevice(started.port);
    const ticket = await issueWebSocketTicket(started.port, session.accessToken);

    const first = new WebSocket(`ws://127.0.0.1:${started.port}/v1/relay/ws?ticket=${ticket}`);
    await waitForOpen(first);

    const second = new WebSocket(`ws://127.0.0.1:${started.port}/v1/relay/ws?ticket=${ticket}`);
    const unexpectedResponseStatus = await new Promise<number>((resolve) => {
      second.on("unexpected-response", (_, response) => {
        resolve(response.statusCode ?? 0);
      });
    });

    expect(unexpectedResponseStatus).toBe(401);
    first.close();
  });

  it("pushes revocation to an active websocket connection", async () => {
    const config = createTestConfig();
    const started = await startBridgeServer(config, createBridgeRuntime(config, mockOpenClaw("alive")), { port: 0 });
    startedServers.push(started);

    const session = await registerDevice(started.port);
    const ticket = await issueWebSocketTicket(started.port, session.accessToken);
    const ws = new WebSocket(`ws://127.0.0.1:${started.port}/v1/relay/ws?ticket=${ticket}`);
    const messages = createMessageCollector(ws);

    await waitForOpen(ws);
    ws.send(JSON.stringify({ type: "hello", conversation_id: "default" }));
    await messages.waitFor("ready");

    const closePromise = waitForClose(ws);
    const revokedMessagePromise = messages.waitFor("revoked");

    const revokeResponse = await fetch(`http://127.0.0.1:${started.port}/v1/devices/${session.deviceId}/revoke`, {
      method: "POST",
      headers: {
        authorization: "Bearer admin-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({ reason: "device_lost" })
    });

    expect(revokeResponse.status).toBe(200);
    expect(await revokedMessagePromise).toMatchObject({
      type: "revoked",
      reason: "device_lost"
    });
    expect(await closePromise).toMatchObject({ code: 4003 });
  });
});

async function registerDevice(port: number): Promise<{
  accessToken: string;
  deviceId: string;
}> {
  const pairingResponse = await fetch(`http://127.0.0.1:${port}/v1/pairing/sessions`, {
    method: "POST",
    headers: {
      authorization: "Bearer admin-token",
      "content-type": "application/json"
    },
    body: JSON.stringify({ platform: "ios" })
  });
  const pairing = await pairingResponse.json();

  const redeemResponse = await fetch(`http://127.0.0.1:${port}/v1/pairing/redeem`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pairing_code: pairing.pairing_code })
  });
  const redeemed = await redeemResponse.json();

  const registerResponse = await fetch(`http://127.0.0.1:${port}/v1/devices/register`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${redeemed.bootstrap_token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      device_display_name: "Jon's iPhone",
      platform: "ios"
    })
  });
  const registered = await registerResponse.json();

  return {
    accessToken: registered.access_token,
    deviceId: registered.device_id
  };
}

async function issueWebSocketTicket(port: number, accessToken: string): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${port}/v1/auth/ws-ticket`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ conversation_id: "default" })
  });
  const json = await response.json();
  return json.ticket;
}

function mockOpenClaw(reply: string): OpenClawChatPort {
  return {
    checkHealth: vi.fn(async () => ({ ok: true })),
    createChatCompletion: vi.fn(async ({ sessionKey }) => ({
      reply,
      model: "openclaw/default",
      sessionKey
    }))
  };
}

async function waitForOpen(ws: WebSocket): Promise<void> {
  if (ws.readyState === ws.OPEN) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for websocket open")), 2_000);
    ws.once("open", () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function createMessageCollector(ws: WebSocket): {
  waitFor(expectedType: string): Promise<Record<string, unknown>>;
} {
  const queue: Record<string, unknown>[] = [];
  const listeners = new Map<string, Array<(message: Record<string, unknown>) => void>>();

  ws.on("message", (raw: Buffer) => {
    const parsed = JSON.parse(String(raw)) as Record<string, unknown>;
    queue.push(parsed);

    const type = String(parsed.type ?? "");
    const waiting = listeners.get(type);
    if (!waiting || waiting.length === 0) {
      return;
    }

    const next = waiting.shift()!;
    next(parsed);
  });

  return {
    waitFor(expectedType: string) {
      const queuedIndex = queue.findIndex((message) => message.type === expectedType);
      if (queuedIndex >= 0) {
        const [message] = queue.splice(queuedIndex, 1);
        return Promise.resolve(message!);
      }

      return new Promise<Record<string, unknown>>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${expectedType}`)), 2_000);
        const waiting = listeners.get(expectedType) ?? [];
        waiting.push((message) => {
          clearTimeout(timeout);
          resolve(message);
        });
        listeners.set(expectedType, waiting);
      });
    }
  };
}

async function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise<{ code: number; reason: string }>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for websocket close")), 2_000);
    ws.once("close", (code, reason) => {
      clearTimeout(timeout);
      resolve({ code: Number(code), reason: String(reason) });
    });
  });
}
