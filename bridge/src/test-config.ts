import type { BridgeConfig } from "./config.js";

export function createTestConfig(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    port: 8787,
    relayBaseUrl: "https://api.example.com",
    bridgeStoreDriver: "memory",
    databaseUrl: "",
    databaseSchema: "openclaw_bridge_test",
    databaseAutoMigrate: false,
    adminApiToken: "admin-token",
    accessTokenSecret: "test-access-token-secret",
    accessTokenIssuer: "openclaw-mobile-companion",
    accessTokenAudience: "openclaw-mobile",
    openclawBaseUrl: "http://127.0.0.1:18789",
    openclawGatewayToken: "gateway-token",
    g2BridgeToken: "bridge-token",
    openclawModel: "openclaw/default",
    openclawRequestTimeoutMs: 1_000,
    openclawHealthCheck: true,
    pairingCodeTtlMs: 10 * 60 * 1000,
    bootstrapTokenTtlMs: 60 * 1000,
    accessTokenTtlMs: 5 * 60 * 1000,
    refreshTokenSlidingTtlMs: 30 * 24 * 60 * 60 * 1000,
    refreshTokenAbsoluteTtlMs: 90 * 24 * 60 * 60 * 1000,
    evenHubRefreshTokenSlidingTtlMs: 7 * 24 * 60 * 60 * 1000,
    evenHubRefreshTokenAbsoluteTtlMs: 30 * 24 * 60 * 60 * 1000,
    wsTicketTtlMs: 30 * 1000,
    relayHeartbeatIntervalMs: 25 * 1000,
    relayPongTimeoutMs: 10 * 1000,
    relayStaleMissCount: 2,
    ...overrides
  };
}
