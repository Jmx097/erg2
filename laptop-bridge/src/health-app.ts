import { createServer, type Server } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import type { LaptopBridgeRuntime } from "./bridge-runtime.js";

export function startHealthServer(port: number, runtime: LaptopBridgeRuntime): Promise<Server> {
  const app = new Hono();

  app.get("/health", (c) => c.json(runtime.health(), 200));
  app.get("/status", (c) => c.json(runtime.health(), 200));

  const server = createServer(getRequestListener(app.fetch));
  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}
