import { randomBytes } from "node:crypto";

export function createBridgeEventId(prefix = "evt"): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}
