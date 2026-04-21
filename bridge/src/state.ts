import type { ClientType } from "@openclaw/protocol";

export interface PairingSessionRecord {
  pairingSessionId: string;
  codeHash: string;
  codeLast4: string;
  status: "pending" | "redeemed" | "expired" | "locked";
  createdAt: Date;
  expiresAt: Date;
  redeemedAt?: Date;
  failedAttempts: number;
  createdBy: string;
  platform: string;
  deviceDisplayNameHint?: string;
}

export interface BootstrapTokenRecord {
  tokenHash: string;
  pairingSessionId: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt?: Date;
}

export interface DeviceRecord {
  deviceId: string;
  deviceDisplayName: string;
  platform: string;
  clientType: ClientType;
  status: "active" | "revoked" | "repair_required";
  createdAt: Date;
  lastSeenAt?: Date;
  lastIp?: string;
  lastAppVersion?: string;
  currentRefreshFamilyId: string;
  revokedAt?: Date;
  revokeReason?: string;
}

export interface RefreshTokenFamilyRecord {
  refreshFamilyId: string;
  deviceId: string;
  clientType: ClientType;
  status: "active" | "revoked" | "compromised";
  createdAt: Date;
  compromisedAt?: Date;
  revokeReason?: string;
}

export interface RefreshTokenRecord {
  refreshTokenId: string;
  refreshFamilyId: string;
  tokenHash: string;
  parentRefreshTokenId?: string;
  issuedAt: Date;
  expiresAt: Date;
  usedAt?: Date;
  replacedByRefreshTokenId?: string;
  revokedAt?: Date;
}

export interface WebSocketTicketRecord {
  ticketHash: string;
  ticketId: string;
  deviceId: string;
  conversationId: string;
  accessExpiresAt: Date;
  createdAt: Date;
  expiresAt: Date;
  usedAt?: Date;
}

export interface RevocationRecord {
  revocationId: string;
  subjectType: "device" | "family" | "token";
  subjectId: string;
  reason: string;
  createdAt: Date;
  createdBy: string;
}

export interface ConnectionEventRecord {
  connectionEventId: string;
  deviceId: string;
  connectionId: string;
  eventType: string;
  occurredAt: Date;
  ip?: string;
  closeCode?: number;
  detailsJson?: Record<string, unknown>;
}

export interface PromptResultRecord {
  deviceId: string;
  promptId: string;
  conversationId: string;
  requestId: string;
  text: string;
  createdAt: Date;
}

export class InMemoryBridgeState {
  readonly pairingSessions = new Map<string, PairingSessionRecord>();
  readonly bootstrapTokens = new Map<string, BootstrapTokenRecord>();
  readonly devices = new Map<string, DeviceRecord>();
  readonly refreshFamilies = new Map<string, RefreshTokenFamilyRecord>();
  readonly refreshTokens = new Map<string, RefreshTokenRecord>();
  readonly websocketTickets = new Map<string, WebSocketTicketRecord>();
  readonly revocations: RevocationRecord[] = [];
  readonly connectionEvents: ConnectionEventRecord[] = [];
  readonly promptResults = new Map<string, PromptResultRecord>();
}
