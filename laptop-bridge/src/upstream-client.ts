import type {
  HardwareBridgeEvent,
  HardwareBridgeEventBatchRequest,
  HardwareBridgeEventBatchResponse
} from "@openclaw/protocol";

export interface UpstreamClientConfig {
  bridgeId: string;
  baseUrl: string;
  token: string;
}

export interface UpstreamDeliveryResult {
  acceptedEventIds: string[];
  duplicateEventIds: string[];
  rejectedEventIds: string[];
}

export class UpstreamBridgeClient {
  constructor(
    private readonly config: UpstreamClientConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async deliver(events: HardwareBridgeEvent[]): Promise<UpstreamDeliveryResult> {
    const body: HardwareBridgeEventBatchRequest = {
      bridge_id: this.config.bridgeId,
      sent_at: new Date().toISOString(),
      events
    };

    const response = await this.fetchImpl(`${this.config.baseUrl}/v1/hardware-bridge/events`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok && response.status !== 207 && response.status !== 202) {
      throw new Error(`Laptop bridge upstream delivery failed with ${response.status}`);
    }

    const parsed = (await response.json()) as HardwareBridgeEventBatchResponse;
    return {
      acceptedEventIds: parsed.accepted_event_ids,
      duplicateEventIds: parsed.duplicate_event_ids,
      rejectedEventIds: parsed.rejected_events.map((event) => event.event_id)
    };
  }
}
