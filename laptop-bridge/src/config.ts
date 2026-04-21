import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface LaptopBridgeConfig {
  environment: "development" | "test" | "production";
  port: number;
  bridgeId: string;
  deviceId: string;
  adapterMode: "mock" | "xreal_g2_ble_stub";
  rawBleDebug: boolean;
  reconnectInitialMs: number;
  reconnectMaxMs: number;
  resumeGapMs: number;
  upstreamFlushIntervalMs: number;
  upstreamMaxBatchSize: number;
  upstreamMaxQueueSize: number;
  vpsBaseUrl: string;
  vpsToken: string;
  g2NamePrefix: string;
  g2ServiceUuid?: string;
  g2RxCharacteristicUuid?: string;
  g2TxCharacteristicUuid?: string;
}

export function loadLaptopBridgeConfig(env: NodeJS.ProcessEnv = process.env): LaptopBridgeConfig {
  const resolvedEnv = env === process.env ? resolveRuntimeEnv() : env;
  const environment = readEnvironment(resolvedEnv.NODE_ENV);

  return {
    environment,
    port: readInt(resolvedEnv.LAPTOP_BRIDGE_PORT, 8791),
    bridgeId: readRequired(resolvedEnv.LAPTOP_BRIDGE_ID, "LAPTOP_BRIDGE_ID"),
    deviceId: readRequired(resolvedEnv.LAPTOP_BRIDGE_DEVICE_ID, "LAPTOP_BRIDGE_DEVICE_ID"),
    adapterMode: readAdapterMode(resolvedEnv.LAPTOP_BRIDGE_ADAPTER_MODE),
    rawBleDebug: readBool(resolvedEnv.LAPTOP_BRIDGE_RAW_BLE_DEBUG, false),
    reconnectInitialMs: readInt(resolvedEnv.LAPTOP_BRIDGE_RECONNECT_INITIAL_MS, 1_000),
    reconnectMaxMs: readInt(resolvedEnv.LAPTOP_BRIDGE_RECONNECT_MAX_MS, 30_000),
    resumeGapMs: readInt(resolvedEnv.LAPTOP_BRIDGE_RESUME_GAP_MS, 15_000),
    upstreamFlushIntervalMs: readInt(resolvedEnv.LAPTOP_BRIDGE_UPSTREAM_FLUSH_INTERVAL_MS, 1_000),
    upstreamMaxBatchSize: readInt(resolvedEnv.LAPTOP_BRIDGE_UPSTREAM_MAX_BATCH_SIZE, 25),
    upstreamMaxQueueSize: readInt(resolvedEnv.LAPTOP_BRIDGE_UPSTREAM_MAX_QUEUE_SIZE, 500),
    vpsBaseUrl: normalizeBaseUrl(readRequired(resolvedEnv.LAPTOP_BRIDGE_VPS_BASE_URL, "LAPTOP_BRIDGE_VPS_BASE_URL")),
    vpsToken: readRequired(resolvedEnv.LAPTOP_BRIDGE_VPS_TOKEN, "LAPTOP_BRIDGE_VPS_TOKEN"),
    g2NamePrefix: readRequired(resolvedEnv.LAPTOP_BRIDGE_G2_NAME_PREFIX, "LAPTOP_BRIDGE_G2_NAME_PREFIX"),
    g2ServiceUuid: normalizeOptional(resolvedEnv.LAPTOP_BRIDGE_G2_SERVICE_UUID),
    g2RxCharacteristicUuid: normalizeOptional(resolvedEnv.LAPTOP_BRIDGE_G2_RX_CHARACTERISTIC_UUID),
    g2TxCharacteristicUuid: normalizeOptional(resolvedEnv.LAPTOP_BRIDGE_G2_TX_CHARACTERISTIC_UUID)
  };
}

function resolveRuntimeEnv(): NodeJS.ProcessEnv {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "laptop-bridge", ".env")
  ];
  const fileEnv = readFirstEnvFile(candidates);
  return { ...fileEnv, ...process.env };
}

function readFirstEnvFile(paths: string[]): Record<string, string> {
  for (const candidate of paths) {
    if (existsSync(candidate)) {
      return parseEnvFile(readFileSync(candidate, "utf8"));
    }
  }

  return {};
}

function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const index = line.indexOf("=");
    if (index <= 0) {
      continue;
    }

    const key = line.slice(0, index).trim();
    const rawValue = line.slice(index + 1).trim();
    values[key] = unwrap(rawValue);
  }

  return values;
}

function unwrap(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function readRequired(value: string | undefined, key: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return trimmed;
}

function readInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function readEnvironment(value: string | undefined): LaptopBridgeConfig["environment"] {
  switch (value?.trim().toLowerCase()) {
    case "production":
      return "production";
    case "test":
      return "test";
    default:
      return "development";
  }
}

function readAdapterMode(value: string | undefined): LaptopBridgeConfig["adapterMode"] {
  return value?.trim() === "xreal_g2_ble_stub" ? "xreal_g2_ble_stub" : "mock";
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function normalizeOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
