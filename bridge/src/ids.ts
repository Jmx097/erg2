import { randomBytes } from "node:crypto";

const CROCKFORD_BASE32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

export function createOpaqueToken(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}

export function createPairingCode(): string {
  const characters: string[] = [];

  while (characters.length < 8) {
    characters.push(CROCKFORD_BASE32[randomBytes(1)[0] % CROCKFORD_BASE32.length]!);
  }

  return `${characters.slice(0, 4).join("")}-${characters.slice(4).join("")}`;
}
