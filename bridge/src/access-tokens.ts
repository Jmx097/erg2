import { SignJWT, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import type { BridgeConfig } from "./config.js";
import { createId } from "./ids.js";

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

export interface VerifiedAccessToken {
  deviceId: string;
  scope: string[];
  expiresAt: Date;
  jwtId: string;
}

interface BridgeAccessTokenPayload extends JWTPayload {
  device_id: string;
  scope: string;
}

export class AccessTokenService {
  private readonly secret: Uint8Array;

  constructor(private readonly config: Pick<BridgeConfig, "accessTokenAudience" | "accessTokenIssuer" | "accessTokenSecret">) {
    this.secret = new TextEncoder().encode(config.accessTokenSecret);
  }

  async issue(input: { deviceId: string; scope: string[]; ttlMs: number; now?: Date }): Promise<IssuedAccessToken> {
    const now = input.now ?? new Date();
    const expiresAt = new Date(now.getTime() + input.ttlMs);
    const jwtId = createId("atjti");

    const token = await new SignJWT({
      device_id: input.deviceId,
      scope: input.scope.join(" ")
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(this.config.accessTokenIssuer)
      .setAudience(this.config.accessTokenAudience)
      .setSubject(`device:${input.deviceId}`)
      .setJti(jwtId)
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setNotBefore(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.secret);

    return { token, expiresAt };
  }

  async verify(token: string, requiredScopes: string[] = []): Promise<VerifiedAccessToken> {
    const verified = await jwtVerify<BridgeAccessTokenPayload>(token, this.secret, {
      issuer: this.config.accessTokenIssuer,
      audience: this.config.accessTokenAudience
    });

    const deviceId = verified.payload.device_id?.trim();
    const jwtId = verified.payload.jti?.trim();
    const exp = verified.payload.exp;

    if (!deviceId || !jwtId || !exp) {
      throw new Error("Access token missing required claims");
    }

    const scope = String(verified.payload.scope ?? "")
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    for (const requiredScope of requiredScopes) {
      if (!scope.includes(requiredScope)) {
        throw new Error(`Missing required scope: ${requiredScope}`);
      }
    }

    return {
      deviceId,
      scope,
      expiresAt: new Date(exp * 1000),
      jwtId
    };
  }
}
