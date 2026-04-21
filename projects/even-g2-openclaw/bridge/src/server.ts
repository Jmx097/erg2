import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { requireBearerToken } from "./auth.js";
import type { BridgeConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { buildG2SessionKey, normalizeInstallId, OpenClawClient, publicErrorMessage } from "./openclaw.js";

export interface TurnBody {
  installId?: unknown;
  prompt?: unknown;
}

export interface OpenClawChatPort {
  checkHealth(): Promise<unknown>;
  createChatCompletion(input: { requestId: string; sessionKey: string; prompt: string }): Promise<{
    reply: string;
    model: string;
    sessionKey: string;
  }>;
}

export function createBridgeApp(config: BridgeConfig, openclaw: OpenClawChatPort = new OpenClawClient(config)): Hono {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: ["authorization", "content-type"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      maxAge: 600
    })
  );

  app.use("/health", requireBearerToken(config.g2BridgeToken));
  app.use("/v0/*", requireBearerToken(config.g2BridgeToken));

  app.get("/health", async (c) => {
    const gateway = config.openclawHealthCheck ? await openclaw.checkHealth() : { skipped: true };
    return c.json({
      ok: true,
      bridge: "g2-openclaw-bridge",
      gateway
    });
  });

  app.post("/v0/turn", async (c) => {
    const body = await readJsonBody(c.req.raw);
    const validated = validateTurnBody(body);

    if (!validated.ok) {
      return c.json({ error: validated.error }, 400);
    }

    const sessionKey = buildG2SessionKey(validated.installId);
    const requestId = createTurnRequestId();

    try {
      const result = await openclaw.createChatCompletion({
        requestId,
        sessionKey,
        prompt: validated.prompt
      });

      return c.json({
        reply: sanitizeHudText(result.reply),
        model: result.model,
        sessionKey: result.sessionKey
      });
    } catch (error) {
      return c.json({ error: publicErrorMessage(error) }, 502);
    }
  });

  return app;
}

async function readJsonBody(request: Request): Promise<TurnBody | null> {
  try {
    return (await request.json()) as TurnBody;
  } catch {
    return null;
  }
}

function validateTurnBody(body: TurnBody | null):
  | { ok: true; installId: string; prompt: string }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Expected JSON body" };
  }

  if (typeof body.installId !== "string") {
    return { ok: false, error: "installId is required" };
  }

  const installId = normalizeInstallId(body.installId);
  if (installId.length < 4) {
    return { ok: false, error: "installId is too short" };
  }

  if (typeof body.prompt !== "string") {
    return { ok: false, error: "prompt is required" };
  }

  const prompt = body.prompt.trim();
  if (!prompt) {
    return { ok: false, error: "prompt is empty" };
  }

  if (prompt.length > 2_000) {
    return { ok: false, error: "prompt is too long" };
  }

  return { ok: true, installId, prompt };
}

function sanitizeHudText(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 2_000);
}

function createTurnRequestId(): string {
  return `turn_${randomBytes(4).toString("hex")}`;
}

function startServer(): void {
  const config = loadConfig();
  const app = createBridgeApp(config);

  serve(
    {
      fetch: app.fetch,
      port: config.port
    },
    (info) => {
      console.log(`G2 OpenClaw bridge listening on http://127.0.0.1:${info.port}`);
    }
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
