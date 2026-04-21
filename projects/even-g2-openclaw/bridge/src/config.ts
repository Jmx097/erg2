import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface BridgeConfig {
  port: number;
  openclawBaseUrl: string;
  openclawGatewayToken: string;
  g2BridgeToken: string;
  openclawModel: string;
  openclawRequestTimeoutMs: number;
  openclawHealthCheck: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const runtimeEnv = env === process.env ? resolveRuntimeEnv(env) : env;

  return {
    port: readInt(runtimeEnv.PORT, 8787),
    openclawBaseUrl: normalizeBaseUrl(readRequired(runtimeEnv.OPENCLAW_BASE_URL, "OPENCLAW_BASE_URL")),
    openclawGatewayToken: readRequired(runtimeEnv.OPENCLAW_GATEWAY_TOKEN, "OPENCLAW_GATEWAY_TOKEN"),
    g2BridgeToken: readRequired(runtimeEnv.G2_BRIDGE_TOKEN, "G2_BRIDGE_TOKEN"),
    openclawModel: runtimeEnv.OPENCLAW_MODEL?.trim() || "openclaw/default",
    openclawRequestTimeoutMs: readInt(runtimeEnv.OPENCLAW_REQUEST_TIMEOUT_MS, 30_000),
    openclawHealthCheck: readBool(runtimeEnv.OPENCLAW_HEALTH_CHECK, true)
  };
}

export function resolveRuntimeEnv(
  env: NodeJS.ProcessEnv = process.env,
  candidatePaths: string[] = defaultEnvFileCandidates()
): NodeJS.ProcessEnv {
  const fileEnv = readFirstEnvFile(candidatePaths);
  return { ...fileEnv, ...env };
}

function readRequired(value: string | undefined, key: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return trimmed;
}

function readInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function normalizeBaseUrl(value: string): string {
  const normalizedScheme = value
    .trim()
    .replace(/^ws:\/\//i, "http://")
    .replace(/^wss:\/\//i, "https://");

  return normalizedScheme.replace(/\/+$/, "");
}

function defaultEnvFileCandidates(): string[] {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));

  return [...new Set([
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "bridge", ".env"),
    path.resolve(moduleDir, "..", ".env")
  ])];
}

function readFirstEnvFile(candidatePaths: string[]): Record<string, string> {
  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      return parseEnvFile(readFileSync(candidatePath, "utf8"));
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

    const normalizedLine = line.startsWith("export ") ? line.slice(7).trimStart() : line;
    const separatorIndex = normalizedLine.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    if (!key) {
      continue;
    }

    const rawValue = normalizedLine.slice(separatorIndex + 1).trim();
    values[key] = unwrapEnvValue(rawValue);
  }

  return values;
}

function unwrapEnvValue(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
