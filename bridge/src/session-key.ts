export function buildMobileSessionKey(deviceId: string, conversationId: string): string {
  return `mobile:${normalizeTokenSegment(deviceId)}:conversation:${normalizeConversationId(conversationId)}`;
}

export function normalizeConversationId(value: string): string {
  const normalized = normalizeTokenSegment(value);
  return normalized || "default";
}

export function normalizeTokenSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 128);
}
