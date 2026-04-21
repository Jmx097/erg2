import type { HardwareBridgeEvent } from "@openclaw/protocol";

export class EventBuffer {
  private readonly queue: HardwareBridgeEvent[] = [];

  constructor(private readonly maxQueueSize: number) {}

  enqueue(event: HardwareBridgeEvent): void {
    this.queue.push(event);
    while (this.queue.length > this.maxQueueSize) {
      this.queue.shift();
    }
  }

  peekBatch(maxBatchSize: number): HardwareBridgeEvent[] {
    return this.queue.slice(0, maxBatchSize);
  }

  acknowledge(eventIds: string[]): void {
    const acknowledged = new Set(eventIds);
    if (acknowledged.size === 0) {
      return;
    }

    let index = 0;
    while (index < this.queue.length) {
      if (acknowledged.has(this.queue[index]!.event_id)) {
        this.queue.splice(index, 1);
        continue;
      }

      index += 1;
    }
  }

  size(): number {
    return this.queue.length;
  }
}
