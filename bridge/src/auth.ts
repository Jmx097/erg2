import type { MiddlewareHandler } from "hono";

export function requireBearerToken(expectedToken: string): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method === "OPTIONS") {
      return next();
    }

    const token = parseBearerToken(c.req.header("authorization") ?? "");

    if (!expectedToken || !token || token !== expectedToken) {
      return c.json({ error: "unauthorized" }, 401);
    }

    return next();
  };
}

export function parseBearerToken(header: string): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}
