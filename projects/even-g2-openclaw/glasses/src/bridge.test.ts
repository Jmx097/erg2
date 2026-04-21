import { describe, expect, it, vi } from "vitest";
import { BridgeClient } from "./bridge.js";

describe("BridgeClient", () => {
  it("authenticates bridge requests with the narrow G2 token", async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init]);
      return new Response(JSON.stringify({ reply: "alive", model: "openclaw/default", sessionKey: "g2:abc" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const client = new BridgeClient({ baseUrl: "https://bridge.example.com/", token: "g2-token" }, fetchImpl);

    const result = await client.sendTurn("abc", "ping");

    expect(result.reply).toBe("alive");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = calls[0]!;
    expect(url).toBe("https://bridge.example.com/v0/turn");
    expect(init?.headers).toMatchObject({ authorization: "Bearer g2-token" });
  });
});
