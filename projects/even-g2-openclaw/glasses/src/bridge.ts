export interface BridgeHealth {
  ok: boolean;
  bridge?: string;
  gateway?: unknown;
}

export interface TurnResponse {
  reply: string;
  model: string;
  sessionKey: string;
}

export interface BridgeClientConfig {
  baseUrl: string;
  token: string;
}

export type FetchLike = typeof fetch;

export class BridgeClient {
  private readonly baseUrl: string;

  constructor(
    private readonly config: BridgeClientConfig,
    private readonly fetchImpl: FetchLike = fetch
  ) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
  }

  async health(): Promise<BridgeHealth> {
    const response = await this.fetchJson(`${this.baseUrl}/health`, { method: "GET" });
    const health = response as BridgeHealth;

    if (!health.ok) {
      throw new Error("Bridge health check failed");
    }

    if (isGatewayFailure(health.gateway)) {
      throw new Error(`OpenClaw gateway offline: ${health.gateway.error ?? "health check failed"}`);
    }

    return health;
  }

  async sendTurn(installId: string, prompt: string): Promise<TurnResponse> {
    const response = await this.fetchJson(`${this.baseUrl}/v0/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ installId, prompt })
    });

    return response as TurnResponse;
  }

  private async fetchJson(url: string, init: RequestInit): Promise<unknown> {
    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        authorization: `Bearer ${this.config.token}`,
        ...(init.headers ?? {})
      }
    });

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      const error = isErrorPayload(json) ? json.error : `Bridge returned ${response.status}`;
      throw new Error(error);
    }

    return json;
  }
}

export function createBridgeClientFromEnv(): BridgeClient {
  const baseUrl = import.meta.env.VITE_BRIDGE_BASE_URL?.trim();
  const token = import.meta.env.VITE_G2_BRIDGE_TOKEN?.trim();

  if (!baseUrl || !token) {
    throw new Error("Missing VITE_BRIDGE_BASE_URL or VITE_G2_BRIDGE_TOKEN");
  }

  return new BridgeClient({ baseUrl, token });
}

function isErrorPayload(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string";
}

function isGatewayFailure(value: unknown): value is { ok: false; error?: string } {
  return typeof value === "object" && value !== null && "ok" in value && value.ok === false;
}
