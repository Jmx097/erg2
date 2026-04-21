import { describe, expect, it, vi } from "vitest";
import type { BridgeConfig } from "./config.js";
import { buildG2SessionKey, OpenClawClient } from "./openclaw.js";

const config: BridgeConfig = {
  port: 8787,
  openclawBaseUrl: "http://openclaw.local",
  openclawGatewayToken: "gateway-token",
  g2BridgeToken: "bridge-token",
  openclawModel: "openclaw/default",
  openclawRequestTimeoutMs: 1_000,
  openclawHealthCheck: true
};

describe("OpenClawClient", () => {
  it("sends the OpenClaw session key header", async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init]);
      return new Response(
        JSON.stringify({
          model: "openclaw/default",
          choices: [{ message: { content: "pong" } }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    const client = new OpenClawClient(config, fetchImpl);

    const result = await client.createChatCompletion({
      requestId: "turn_1234abcd",
      sessionKey: "g2:abc",
      prompt: "ping"
    });

    expect(result.reply).toBe("pong");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = calls[0]!;
    expect(init?.headers).toMatchObject({
      authorization: "Bearer gateway-token",
      "x-openclaw-session-key": "g2:abc",
      "x-openclaw-message-channel": "g2"
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "openclaw/default",
      messages: [
        expect.objectContaining({ role: "system" }),
        expect.objectContaining({ role: "user", content: "ping" })
      ]
    });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("stream");
  });

  it("treats a missing models endpoint as reachable health", async () => {
    const fetchImpl = vi.fn(async () => new Response("not found", { status: 404 }));
    const client = new OpenClawClient(config, fetchImpl);

    await expect(client.checkHealth()).resolves.toMatchObject({
      ok: true,
      status: 404
    });
  });

  it("retries narrow transient upstream replies before succeeding", async () => {
    const sleepImpl = vi.fn(async () => undefined);
    const logger = vi.fn();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonReply("Even AI is busy with another request. Please retry shortly."))
      .mockResolvedValueOnce(jsonReply("Even AI request failed upstream. Please try again."))
      .mockResolvedValueOnce(jsonReply("Hello in five words."));
    const client = new OpenClawClient(config, fetchImpl, sleepImpl, logger);

    const result = await client.createChatCompletion({
      requestId: "turn_1234abcd",
      sessionKey: "g2:abc",
      prompt: "ping"
    });

    expect(result.reply).toBe("Hello in five words.");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleepImpl).toHaveBeenNthCalledWith(1, 400);
    expect(sleepImpl).toHaveBeenNthCalledWith(2, 1_200);
    expect(logger).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: "openclaw_upstream_attempt",
        requestId: "turn_1234abcd",
        sessionKey: "g2:abc",
        attempt: 1,
        maxAttempts: 3,
        ok: true,
        retryable: true,
        failureKind: "busy",
        replyText: "Even AI is busy with another request. Please retry shortly."
      })
    );
    expect(logger).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        event: "openclaw_upstream_attempt",
        attempt: 2,
        retryable: true,
        failureKind: "upstream_failed"
      })
    );
    expect(logger).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        event: "openclaw_upstream_attempt",
        attempt: 3,
        ok: true,
        retryable: false,
        failureKind: undefined,
        upstreamModel: "openclaw/default",
        replyText: "Hello in five words."
      })
    );
    expect(logger).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        event: "openclaw_upstream_result",
        requestId: "turn_1234abcd",
        sessionKey: "g2:abc",
        attemptsUsed: 3,
        finalOutcome: "success",
        finalReplyText: "Hello in five words.",
        finalHttpStatus: 200
      })
    );
  });

  it("does not retry non-transient upstream replies", async () => {
    const sleepImpl = vi.fn(async () => undefined);
    const logger = vi.fn();
    const fetchImpl = vi.fn(async () => jsonReply("Authentication failed."));
    const client = new OpenClawClient(config, fetchImpl, sleepImpl, logger);

    const result = await client.createChatCompletion({
      requestId: "turn_1234abcd",
      sessionKey: "g2:abc",
      prompt: "ping"
    });

    expect(result.reply).toBe("Authentication failed.");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(sleepImpl).not.toHaveBeenCalled();
    expect(logger).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: "openclaw_upstream_attempt",
        requestId: "turn_1234abcd",
        failureKind: "auth",
        retryable: false,
        ok: true,
        httpStatus: 200
      })
    );
    expect(logger).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        event: "openclaw_upstream_result",
        requestId: "turn_1234abcd",
        attemptsUsed: 1,
        finalOutcome: "auth",
        finalReplyText: "Authentication failed.",
        finalHttpStatus: 200
      })
    );
  });
});

describe("buildG2SessionKey", () => {
  it("normalizes unsafe characters", () => {
    expect(buildG2SessionKey(" abc 123 !!! ")).toBe("g2:abc123");
  });
});

function jsonReply(content: string): Response {
  return new Response(
    JSON.stringify({
      model: "openclaw/default",
      choices: [{ message: { content } }]
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
