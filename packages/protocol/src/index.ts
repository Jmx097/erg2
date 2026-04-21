export type ClientType = "mobile" | "even_hub";

export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface BridgeHealthResponse {
  ok: boolean;
  bridge: string;
  websocket?: boolean;
  gateway?: unknown;
}

export interface CreatePairingSessionRequest {
  platform?: string;
  device_display_name_hint?: string;
}

export interface PairingSessionResponse {
  pairing_session_id: string;
  pairing_code: string;
  relay_base_url: string;
  expires_at: string;
  qr_payload: string;
}

export interface RedeemPairingRequest {
  pairing_code: string;
}

export interface RedeemPairingResponse {
  bootstrap_token: string;
  bootstrap_expires_at: string;
  pairing_session_id: string;
}

export interface RegisterDeviceRequest {
  device_display_name?: string;
  platform?: string;
  app_version?: string;
  client_type?: ClientType;
}

export interface RegisterDeviceResponse {
  device_id: string;
  access_token: string;
  access_expires_at: string;
  refresh_token: string;
  refresh_expires_at: string;
  refresh_family_id: string;
  default_conversation_id: string;
  client_type: ClientType;
}

export interface RefreshSessionRequest {
  device_id: string;
  refresh_token: string;
}

export interface RefreshSessionResponse {
  access_token: string;
  access_expires_at: string;
  refresh_token: string;
  refresh_expires_at: string;
  refresh_family_id: string;
  client_type: ClientType;
}

export interface IssueWebSocketTicketRequest {
  conversation_id?: string;
}

export interface WebSocketTicketResponse {
  ticket: string;
  expires_at: string;
  ws_url: string;
}

export interface TurnRequest {
  conversation_id: string;
  prompt_id: string;
  text: string;
}

export interface TurnResponse {
  reply: string;
  request_id: string;
  conversation_id: string;
}

export interface DeviceSummary {
  device_id: string;
  device_display_name: string;
  platform: string;
  status: string;
  client_type: ClientType;
  last_seen_at?: string;
}

export interface ListDevicesResponse {
  devices: DeviceSummary[];
}

export interface RevokeDeviceRequest {
  reason?: string;
}

export interface RevokeDeviceResponse {
  device_id: string;
  status: "revoked";
  revoked_at: string;
  disconnect_active_sessions: true;
}
